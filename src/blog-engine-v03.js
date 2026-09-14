import legacyWorker from './blog-engine.js';
import { MEDIA_POLICY } from './blog-engine-config.js';

const PLAN_MODEL='@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const WRITER_MODEL='@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const H={'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':'*'};
const FOREIGN_SCRIPT=/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/;
const UNSUPPORTED_PATTERNS=[
  /가을(?:이 되면|철|에는|부터)?.{0,20}(?:자외선|일조량).{0,20}(?:강해|강하|증가|높아|많아)/,
  /(?:자외선|일조량).{0,20}가을.{0,20}(?:강해|강하|증가|높아|많아)/,
  /일조량.{0,15}(?:증가|늘어)/,
  /눈의 피로(?:를)?\s*(?:감소|줄여주)/,
  /시야를\s*개선/
];
const VERIFIED_FACTS=[
  '가을이라는 이유만으로 자외선이 더 강해진다고 단정하지 않는다. 야외에서는 계절과 관계없이 자외선 노출과 눈부심이 있을 수 있다는 수준으로 표현한다.',
  '일반적인 변색렌즈는 주로 자외선에 반응하며 자동차 앞유리 뒤에서는 실외보다 변색이 제한될 수 있다. 가시광선에도 반응하도록 설계된 일부 제품은 예외다.',
  '변색 정도와 복귀 속도는 제품, 온도, 광량, 사용 환경에 따라 달라질 수 있다.',
  '변색렌즈를 치료, 시력개선, 피로치료 제품처럼 표현하지 않는다.'
];
const SECTION_SCOPE=[
  '생활 맥락: 가을 자체가 자외선을 강하게 만든다고 말하지 말고, 야외활동 중 자외선과 눈부심을 신경 써야 하는 실제 상황을 설명한다.',
  '작동 원리와 한계: 일반 변색렌즈의 자외선 반응 원리, 차량 유리 뒤에서 변색이 제한될 수 있다는 점, 일부 가시광 반응 제품은 예외라는 점을 설명한다.',
  '선택 체크리스트: 실내 투명도, 변색·복귀 속도, 색상, 온도와 광량, 차량 사용 여부, 도수와 코팅 등 선택 기준을 설명한다.',
  '상담 과정: 기존 안경의 불편, 시력검사 결과, 운전·업무·야외활동 같은 생활환경을 확인한 뒤 기능을 고르는 과정을 설명한다.'
];
const SCHEMA={
  type:'object',
  properties:{
    title:{type:'string'},
    intro:{type:'string'},
    section_headings:{type:'array',items:{type:'string'},minItems:4,maxItems:4},
    photo_slots:{type:'array',minItems:4,maxItems:6,items:{type:'object',properties:{
      position:{type:'string'},description:{type:'string'},
      source_preference:{type:'string',enum:['owned','licensed','ai']},
      search_query:{type:'string'}
    },required:['position','description','source_preference','search_query']}},
    video_plan:{type:'object',properties:{
      hook:{type:'string'},shots:{type:'array',items:{type:'string'},minItems:3,maxItems:6},
      duration_sec:{type:'integer'},caption:{type:'string'}
    },required:['hook','shots','duration_sec','caption']},
    hashtags:{type:'array',items:{type:'string'},minItems:4,maxItems:10},
    cta:{type:'string'}
  },
  required:['title','intro','section_headings','photo_slots','video_plan','hashtags','cta']
};

const J=(data,status=200)=>new Response(JSON.stringify(data,null,2),{status,headers:H});
const norm=v=>String(v||'').toLowerCase().replace(/\s+/g,' ').trim();

function bridge(keyword=''){
  const t=norm(keyword);
  const rules=[
    [['자외선','여행','휴가','캠핑','등산','야외','햇빛','선글라스'],'변색렌즈와 눈부심 관리'],
    [['운전','자동차','야간'],'운전할 때 편한 렌즈와 눈부심 관리'],
    [['컴퓨터','노트북','업무','직장','스마트폰'],'사무용 안경과 디지털 눈 피로'],
    [['개학','입학','학생','학교','수능'],'학생 시력과 근시 관리'],
    [['패션','스타일','연예인'],'얼굴형과 라이프스타일에 맞는 안경테'],
    [['중년','40대','50대','노안'],'누진다초점 적응과 정밀 시력검사']
  ];
  return rules.find(([keys])=>keys.some(k=>t.includes(k)))?.[1]||'정확한 시력검사와 생활에 맞는 안경 선택';
}

function textQualityOK(value=''){
  const text=String(value||'').trim();
  if(!text||FOREIGN_SCRIPT.test(text)) return false;
  return !UNSUPPORTED_PATTERNS.some(pattern=>pattern.test(text));
}
function safety(topic,index=null){
  const out=[
    '질병 진단·치료 효과를 단정하지 않는다.',
    '확인되지 않은 수치, 계절 비교, 의학 통계를 만들지 않는다.',
    '기능은 도수·제품·사용 환경에 따라 달라질 수 있다고 표현한다.',
    '한국어만 사용하고 일본어·중국어 문자를 섞지 않는다.'
  ];
  if(index===1||index===2) out.push(VERIFIED_FACTS[1],VERIFIED_FACTS[2]);
  return out;
}

function obj(result){
  for(const x of [result?.response,result?.result?.response,result?.choices?.[0]?.message?.content,result]){
    if(x&&typeof x==='object'&&!Array.isArray(x)) return x;
    if(typeof x==='string'){
      try{return JSON.parse(x.replace(/^```(?:json)?\s*/i,'').replace(/```\s*$/i,'').trim());}catch{}
    }
  }
  return null;
}
function txt(result){
  for(const x of [result,result?.response,result?.result?.response,result?.choices?.[0]?.message?.content]){
    if(typeof x==='string'&&x.trim()) return x.trim();
  }
  return '';
}
function planOK(p){
  if(!(p&&p.title?.length>=8&&p.intro?.length>=40&&p.section_headings?.length===4&&
    p.photo_slots?.length>=4&&p.video_plan?.shots?.length>=3&&p.hashtags?.length>=4&&p.cta?.length>=15)) return false;
  return [p.title,p.intro,...p.section_headings,p.video_plan?.hook,p.video_plan?.caption,p.cta]
    .filter(Boolean).every(textQualityOK);
}
function bodyOK(s){return typeof s==='string'&&s.length>=100&&s.length<=1400&&textQualityOK(s);}
function openingKey(text=''){
  return norm(text).replace(/[^가-힣a-z0-9 ]/g,'').replace(/\s+/g,'').slice(0,12);
}
function draftQualityIssues(d){
  const issues=[];
  const all=[d?.title,d?.intro,d?.cta,...(d?.sections||[]).flatMap(s=>[s.heading,s.body])].filter(Boolean);
  if(all.some(v=>FOREIGN_SCRIPT.test(String(v)))) issues.push('foreign_script');
  if(all.some(v=>UNSUPPORTED_PATTERNS.some(p=>p.test(String(v))))) issues.push('unsupported_claim');
  const openings=(d?.sections||[]).map(s=>openingKey(s.body)).filter(Boolean);
  if(new Set(openings).size!==openings.length) issues.push('repeated_section_opening');
  return issues;
}
function draftOK(d){return !!(d&&d.title?.length>=8&&d.intro?.length>=40&&d.sections?.length===4&&
  d.sections.every(s=>s.heading&&bodyOK(s.body))&&d.photo_slots?.length>=4&&
  d.video_plan?.shots?.length>=3&&d.hashtags?.length>=4&&d.cta?.length>=15&&draftQualityIssues(d).length===0);}

async function topicFor(request,env,body){
  if(body.topic?.keyword){
    const t={...body.topic};
    t.blog_bridge=t.blog_bridge||bridge(t.keyword);
    t.suggested_title=t.suggested_title||`${t.keyword}, 안경을 바꾸기 전에 확인할 것`;
    t.trend_mode=t.trend_mode||'manual_topic';
    return t;
  }
  const u=new URL(request.url);
  const r=await legacyWorker.fetch(new Request(`${u.origin}/api/topics?limit=30`),env);
  const d=await r.json();
  if(d.topics?.[0]) return {...d.topics[0],trend_mode:'live_relevant'};
  if(d.fallback_suggestions?.[0]) return {...d.fallback_suggestions[0],trend_mode:'evergreen_fallback'};
  return {keyword:'정확한 시력검사',blog_bridge:'생활에 맞는 안경 선택',suggested_title:'안경이 불편할 때 먼저 확인할 것',trend_mode:'evergreen_fallback'};
}

async function makePlan(env,topic){
  let err;
  for(let n=1;n<=2;n++){
    const prompt=[
      '부산 수영구 광안동 스타포인트안경원의 네이버 블로그 기획안을 만든다.',
      `주제: ${topic.keyword}`,`안경원 연결 주제: ${topic.blog_bridge}`,
      '실제 안경사가 고객에게 설명하듯 차분하고 구체적인 생활 언어를 쓴다.',
      '과장 광고, 공포 표현, "필수 아이템", "걱정 끝" 같은 상투어를 쓰지 않는다.',
      '인트로 2~4문장, 소제목 정확히 4개, 사진 위치 4~6개, 30초 세로영상 구성을 만든다.',
      '소제목 4개는 순서대로 생활 상황 / 원리와 한계 / 선택 체크리스트 / 실제 상담 과정의 역할이 서로 겹치지 않게 한다.',
      '외부 사진은 저작권 확인 없는 재업로드를 전제로 하지 않는다.',
      '아래 검증 기준을 어기면 안 된다.',...VERIFIED_FACTS,...safety(topic),
      ...(n===2?['첫 결과가 품질검사에서 탈락했다. 계절 과장, 의학적 효능 단정, 외국문자, 반복 표현을 특히 제거해서 다시 작성한다.']:[])
    ].join('\n');
    try{
      const r=await env.AI.run(PLAN_MODEL,{
        messages:[{role:'system',content:'Return a compact Korean local-optician blog plan matching the JSON schema exactly. Korean only.'},{role:'user',content:prompt}],
        response_format:{type:'json_schema',json_schema:SCHEMA},
        temperature:n===1?0.3:0.15,max_tokens:1800
      });
      const p=obj(r);
      if(planOK(p)) return {plan:p,attempts:n};
      err=new Error('plan_quality_validation_failed');
    }catch(e){err=e;}
  }
  throw err||new Error('plan_generation_failed');
}

async function section(env,topic,heading,index){
  let previous='';
  let lastLength=0;
  let err;
  for(let n=1;n<=2;n++){
    const prompt=[
      `스타포인트안경원 블로그 본문 ${index+1}/4`,`주제: ${topic.keyword}`,`연결: ${topic.blog_bridge}`,`소제목: ${heading}`,
      `이 문단의 고유 역할: ${SECTION_SCOPE[index]}`,
      '한국어 220~420자 한 문단으로 쓴다. 반드시 100자 이상 완성된 문단이어야 한다.',
      '첫 문장을 "가을이 되면"으로 시작하지 않는다. 다른 소제목의 내용과 같은 설명을 반복하지 않는다.',
      '독자의 실제 생활 상황이나 질문에서 시작하고, 이 문단의 역할에 필요한 정보만 설명한다.',
      '스타포인트안경원의 상담 경험이 느껴지는 현실적인 표현을 쓰되 과장 홍보는 하지 않는다.',
      '마크다운, JSON, 일본어, 중국어 문자는 쓰지 않는다.',
      ...VERIFIED_FACTS,...safety(topic,index),
      ...(n===2&&previous ? [`이전 문단은 품질검사에서 탈락했다. 아래 문단의 의미는 참고하되 금지 주장·외국문자·반복을 제거하고 역할에 맞춰 220~420자로 완전히 다시 써라.\n이전 문단: ${previous}`] : [])
    ].join('\n');
    try{
      const r=await env.AI.run(WRITER_MODEL,{
        messages:[{role:'system',content:'Write one complete practical Korean paragraph for a real local optician blog. Korean plain text only. No unsupported claims. Never stop mid-sentence.'},{role:'user',content:prompt}],
        temperature:n===1?0.3:0.15,max_tokens:700
      });
      const body=txt(r).replace(/^```(?:text)?\s*/i,'').replace(/```\s*$/i,'').replace(/^["']|["']$/g,'').trim();
      previous=body;
      lastLength=body.length;
      if(bodyOK(body)) return {body,attempts:n,length:lastLength};
      const reason=!body?'empty':FOREIGN_SCRIPT.test(body)?'foreign_script':UNSUPPORTED_PATTERNS.some(p=>p.test(body))?'unsupported_claim':'length';
      err=new Error(`section_validation_failed_${index+1}_${reason}_len_${lastLength}`);
    }catch(e){err=e;}
  }
  throw err||new Error(`section_generation_failed_${index+1}_len_${lastLength}`);
}

async function build(env,topic){
  if(!env?.AI?.run) throw new Error('workers_ai_not_bound');
  const p=await makePlan(env,topic);
  const generated=await Promise.all(
    p.plan.section_headings.map((heading,index)=>section(env,topic,heading,index))
  );
  const sections=generated.map((item,index)=>({heading:p.plan.section_headings[index],body:item.body,photo_after:true}));
  const tries=generated.reduce((sum,item)=>sum+item.attempts,0);
  const d={
    mode:'ai-structured-multistage-quality-gated',title:p.plan.title,intro:p.plan.intro,sections,
    photo_slots:p.plan.photo_slots,video_plan:{...p.plan.video_plan,duration_sec:30},
    hashtags:p.plan.hashtags,cta:p.plan.cta,
    generation_meta:{
      structured_output:true,publish_quality_gate:true,plan_model:PLAN_MODEL,writer_model:WRITER_MODEL,
      plan_attempts:p.attempts,section_attempts:tries,parallel_sections:true,
      section_lengths:generated.map(item=>item.length),quality_issues:[]
    }
  };
  const issues=draftQualityIssues(d);
  if(!draftOK(d)) throw new Error(`draft_quality_failed:${issues.join(',')||'structure'}`);
  return d;
}

export default{
  async fetch(request,env,ctx){
    const u=new URL(request.url);
    if(!(request.method==='POST'&&u.pathname==='/api/draft')) return legacyWorker.fetch(request,env,ctx);
    let body={};try{body=await request.json();}catch{}
    const topic=await topicFor(request,env,body);
    try{
      const draft=await build(env,topic);
      return J({ok:true,topic,draft,ai_used:true,structured_output:true,publish_quality_passed:true,media_policy:MEDIA_POLICY});
    }catch(e){
      return J({ok:false,topic,ai_used:false,structured_output:false,publish_quality_passed:false,error:e?.message||String(e)},502);
    }
  }
};
