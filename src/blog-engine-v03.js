import legacyWorker from './blog-engine.js';
import { MEDIA_POLICY } from './blog-engine-config.js';

const PLAN_MODEL='@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const WRITER_MODEL='@cf/zai-org/glm-4.7-flash';
const H={'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':'*'};
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

function safety(topic){
  const out=[
    '질병 진단·치료 효과를 단정하지 않는다.',
    '확인되지 않은 수치, 계절 비교, 의학 통계를 만들지 않는다.',
    '기능은 도수·제품·사용 환경에 따라 달라질 수 있다고 표현한다.'
  ];
  if(norm(`${topic.keyword} ${topic.blog_bridge}`).includes('변색')){
    out.push('일반적인 변색렌즈는 차량 유리 환경에서 실외보다 진하게 변색되지 않을 수 있으므로 운전 성능을 일괄 단정하지 않는다.');
  }
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
  return !!(p&&p.title?.length>=8&&p.intro?.length>=40&&p.section_headings?.length===4&&
    p.photo_slots?.length>=4&&p.video_plan?.shots?.length>=3&&p.hashtags?.length>=4&&p.cta?.length>=15);
}
function bodyOK(s){return typeof s==='string'&&s.length>=100&&s.length<=1400;}
function draftOK(d){return !!(d&&d.title?.length>=8&&d.intro?.length>=40&&d.sections?.length===4&&
  d.sections.every(s=>s.heading&&bodyOK(s.body))&&d.photo_slots?.length>=4&&
  d.video_plan?.shots?.length>=3&&d.hashtags?.length>=4&&d.cta?.length>=15);}

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
  const prompt=[
    '부산 수영구 광안동 스타포인트안경원 네이버 블로그 기획안을 만든다.',
    `주제: ${topic.keyword}`,`연결: ${topic.blog_bridge}`,
    '실제 안경사가 상담하듯 차분하고 구체적으로 쓴다.',
    '과장 광고, 공포 표현, "필수 아이템", "걱정 끝" 같은 상투어는 쓰지 않는다.',
    '인트로 2~4문장, 소제목 정확히 4개, 사진 위치 4~6개, 30초 세로영상 구성.',
    '외부 사진은 저작권 확인 없는 재업로드를 전제로 하지 않는다.',
    ...safety(topic)
  ].join('\n');
  let err;
  for(let n=1;n<=2;n++){
    try{
      const r=await env.AI.run(PLAN_MODEL,{
        messages:[{role:'system',content:'Return a compact Korean blog plan matching the JSON schema exactly.'},{role:'user',content:prompt}],
        response_format:{type:'json_schema',json_schema:SCHEMA},
        temperature:n===1?0.35:0.2,max_tokens:1800
      });
      const p=obj(r);
      if(planOK(p)) return {plan:p,attempts:n};
      err=new Error('plan_validation_failed');
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
      '한국어 220~420자 한 문단으로 쓴다. 반드시 100자 이상 완성된 문단이어야 한다.',
      '독자의 실제 불편부터 시작하고, 언제 유용한지와 확인할 점을 함께 쓴다.',
      '한계나 주의점이 있으면 숨기지 말고 포함한다. 실제 안경사가 설명하는 생활 언어를 쓴다.',
      '매장 홍보, 마크다운, JSON은 넣지 않는다.',
      ...(n===2&&previous ? [`이전 문단은 ${lastLength}자로 너무 짧거나 불완전했다. 아래 내용을 살리되 사례와 확인 포인트를 보강해 완성된 220~420자 문단으로 다시 써라.\n이전 문단: ${previous}`] : []),
      ...safety(topic)
    ].join('\n');
    try{
      const r=await env.AI.run(WRITER_MODEL,{
        messages:[{role:'system',content:'Write one complete practical Korean paragraph for a real local optician blog. Plain text only. Never stop mid-sentence.'},{role:'user',content:prompt}],
        temperature:n===1?0.35:0.2,max_completion_tokens:900
      });
      const body=txt(r).replace(/^```(?:text)?\s*/i,'').replace(/```\s*$/i,'').replace(/^["']|["']$/g,'').trim();
      previous=body;
      lastLength=body.length;
      if(bodyOK(body)) return {body,attempts:n,length:lastLength};
      err=new Error(`section_validation_failed_${index+1}_len_${lastLength}`);
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
  const sections=generated.map((item,index)=>({
    heading:p.plan.section_headings[index],body:item.body,photo_after:true
  }));
  const tries=generated.reduce((sum,item)=>sum+item.attempts,0);
  const d={
    mode:'ai-structured-multistage',title:p.plan.title,intro:p.plan.intro,sections,
    photo_slots:p.plan.photo_slots,video_plan:{...p.plan.video_plan,duration_sec:30},
    hashtags:p.plan.hashtags,cta:p.plan.cta,
    generation_meta:{
      structured_output:true,plan_model:PLAN_MODEL,writer_model:WRITER_MODEL,
      plan_attempts:p.attempts,section_attempts:tries,parallel_sections:true,
      section_lengths:generated.map(item=>item.length)
    }
  };
  if(!draftOK(d)) throw new Error('draft_validation_failed');
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
      return J({ok:true,topic,draft,ai_used:true,structured_output:true,media_policy:MEDIA_POLICY});
    }catch(e){
      return J({ok:false,topic,ai_used:false,structured_output:false,error:e?.message||String(e)},502);
    }
  }
};
