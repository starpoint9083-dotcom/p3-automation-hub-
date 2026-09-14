import legacyWorker from './blog-engine.js';
import { MEDIA_POLICY } from './blog-engine-config.js';

const PLAN_MODEL='@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const WRITER_MODEL='@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const QUALITY_GATE='v0.3.1-korean-fact-distinct';
const H={'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':'*'};

const SCHEMA={
  type:'object',
  properties:{
    title:{type:'string'},
    intro:{type:'string'},
    section_plans:{
      type:'array',minItems:4,maxItems:4,
      items:{type:'object',properties:{
        heading:{type:'string'},
        angle:{type:'string'},
        key_points:{type:'array',items:{type:'string'},minItems:2,maxItems:4}
      },required:['heading','angle','key_points'],additionalProperties:false}
    },
    photo_slots:{type:'array',minItems:4,maxItems:6,items:{type:'object',properties:{
      position:{type:'string'},description:{type:'string'},
      source_preference:{type:'string',enum:['owned','licensed','ai']},
      search_query:{type:'string'}
    },required:['position','description','source_preference','search_query'],additionalProperties:false}},
    video_plan:{type:'object',properties:{
      hook:{type:'string'},shots:{type:'array',items:{type:'string'},minItems:3,maxItems:6},
      duration_sec:{type:'integer'},caption:{type:'string'}
    },required:['hook','shots','duration_sec','caption'],additionalProperties:false},
    hashtags:{type:'array',items:{type:'string'},minItems:4,maxItems:10},
    cta:{type:'string'}
  },
  required:['title','intro','section_plans','photo_slots','video_plan','hashtags','cta'],
  additionalProperties:false
};

const J=(data,status=200)=>new Response(JSON.stringify(data,null,2),{status,headers:H});
const norm=v=>String(v||'').toLowerCase().replace(/\s+/g,' ').trim();
const BAD_FOREIGN=/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/u;
const BAD_PATTERNS=[
  /가을[^.!?]{0,35}자외선[^.!?]{0,25}(강해|강하|증가|높아)/u,
  /자외선[^.!?]{0,25}(강해지|증가하|더\s*강)/u,
  /일조량[^.!?]{0,20}(증가|늘어)/u,
  /시야[^.!?]{0,20}(개선|향상)/u,
  /(눈|안구)[^.!?]{0,20}(피로|건강)[^.!?]{0,20}(개선|감소|유지|치료)/u,
  /(100%|완벽하게|완전히\s*(차단|해결)|걱정\s*끝|필수\s*아이템)/u
];

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
  const t=norm(`${topic.keyword} ${topic.blog_bridge}`);
  const out=[
    '질병 진단·치료 효과를 단정하지 않는다.',
    '확인되지 않은 수치, 계절 비교, 의학 통계를 만들지 않는다.',
    '가을이라고 자외선이 여름보다 강해진다거나 일조량이 증가한다고 쓰지 않는다. 자외선 노출은 계절·시간·날씨·환경에 따라 달라지며 가을에도 관리가 필요할 수 있다고만 표현한다.',
    '기능은 도수·제품·사용 환경에 따라 달라질 수 있다고 표현한다.',
    '눈 피로 감소, 시야 개선, 눈 건강 유지 같은 효과를 근거 없이 단정하지 않는다.'
  ];
  if(t.includes('변색')){
    out.push('일반적인 UV 반응형 변색렌즈는 자동차 유리가 자외선을 많이 차단하기 때문에 차 안에서는 실외보다 착색이 제한될 수 있다. 가시광선에도 반응하는 일부 제품은 다를 수 있으므로 제품별 사양 확인이 필요하다고 설명한다.');
  }
  if(t.includes('블루라이트')) out.push('블루라이트 차단이 피로 개선이나 질환 예방을 보장한다고 단정하지 않는다.');
  return out;
}

function obj(result){
  for(const x of [result?.response,result?.result?.response,result?.choices?.[0]?.message?.parsed,result?.choices?.[0]?.message?.content,result]){
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

function cleanText(s){
  return String(s||'').replace(/^```(?:text)?\s*/i,'').replace(/```\s*$/i,'').replace(/^["']|["']$/g,'').trim();
}
function safeText(s,min=1,max=5000){
  if(typeof s!=='string') return false;
  const text=s.trim();
  if(text.length<min||text.length>max) return false;
  if(BAD_FOREIGN.test(text)) return false;
  return !BAD_PATTERNS.some(re=>re.test(text));
}
function mediaOK(p){
  if(!Array.isArray(p?.photo_slots)||p.photo_slots.length<4) return false;
  if(!p.video_plan||!Array.isArray(p.video_plan.shots)||p.video_plan.shots.length<3) return false;
  if(!safeText(p.video_plan.hook,8,180)||!safeText(p.video_plan.caption,4,180)) return false;
  return p.photo_slots.every(slot=>safeText(slot?.position,2,120)&&safeText(slot?.description,2,180)&&['owned','licensed','ai'].includes(slot?.source_preference));
}
function planOK(p){
  return !!(p&&safeText(p.title,8,120)&&safeText(p.intro,40,700)&&p.section_plans?.length===4&&
    p.section_plans.every(s=>safeText(s?.heading,4,100)&&safeText(s?.angle,10,300)&&Array.isArray(s?.key_points)&&s.key_points.length>=2&&s.key_points.every(k=>safeText(k,3,180)))&&
    mediaOK(p)&&Array.isArray(p.hashtags)&&p.hashtags.length>=4&&safeText(p.cta,15,260));
}
function bodyOK(s){return safeText(s,120,1400);}
function tokens(s){
  return new Set(norm(s).replace(/[^0-9a-z가-힣\s]/g,' ').split(/\s+/).filter(w=>w.length>=2));
}
function similarity(a,b){
  const A=tokens(a),B=tokens(b);
  if(!A.size||!B.size) return 0;
  let inter=0;for(const x of A) if(B.has(x)) inter++;
  return inter/(A.size+B.size-inter);
}
function maxSimilarity(sections){
  let max=0;
  for(let i=0;i<sections.length;i++) for(let j=0;j<i;j++) max=Math.max(max,similarity(sections[i].body,sections[j].body));
  return max;
}
function draftOK(d){
  return !!(d&&safeText(d.title,8,120)&&safeText(d.intro,40,700)&&d.sections?.length===4&&
    d.sections.every(s=>safeText(s?.heading,4,100)&&bodyOK(s.body))&&mediaOK(d)&&
    Array.isArray(d.hashtags)&&d.hashtags.length>=4&&safeText(d.cta,15,260)&&maxSimilarity(d.sections)<0.62);
}

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
    '실제 안경사가 고객에게 설명하듯 차분하고 구체적으로 쓴다.',
    '과장 광고, 공포 표현, "필수 아이템", "걱정 끝" 같은 상투어는 쓰지 않는다.',
    '인트로 2~4문장, 서로 역할이 겹치지 않는 섹션 기획 정확히 4개를 만든다.',
    'section_plans의 angle과 key_points는 각 섹션이 반복되지 않도록 서로 다른 질문을 담당해야 한다.',
    '권장 역할: 1) 고객이 느끼는 실제 불편/상황, 2) 렌즈 기능의 원리와 한계, 3) 선택할 때 비교할 기준, 4) 매장에서 검사·상담 시 확인할 항목.',
    '사진 위치 4~6개와 30초 세로영상 구성을 만든다. owned는 실제 매장·검사·제품·가공·착용 사진처럼 매장에서 직접 찍을 수 있는 장면에만 사용한다. 일반 풍경은 licensed 또는 ai로 둔다.',
    '외부 사진은 저작권 확인 없는 재업로드를 전제로 하지 않는다.',
    ...safety(topic)
  ].join('\n');
  let err;
  for(let n=1;n<=3;n++){
    try{
      const r=await env.AI.run(PLAN_MODEL,{
        messages:[{role:'system',content:'Return a compact Korean blog plan matching the JSON schema exactly. Use Korean only except ordinary product names and English abbreviations.'},{role:'user',content:prompt}],
        response_format:{type:'json_schema',json_schema:SCHEMA},
        temperature:n===1?0.3:0.15,max_tokens:1900
      });
      const p=obj(r);
      if(planOK(p)) return {plan:p,attempts:n};
      err=new Error('plan_quality_validation_failed');
    }catch(e){err=e;}
  }
  throw err||new Error('plan_generation_failed');
}

async function section(env,topic,sectionPlan,index,avoidText=''){
  let previous='';
  let lastLength=0;
  let err;
  for(let n=1;n<=3;n++){
    const prompt=[
      `스타포인트안경원 블로그 본문 ${index+1}/4`,`주제: ${topic.keyword}`,`연결: ${topic.blog_bridge}`,
      `소제목: ${sectionPlan.heading}`,`이 문단의 역할: ${sectionPlan.angle}`,
      `반드시 다룰 핵심: ${sectionPlan.key_points.join(' / ')}`,
      '한국어 220~420자 한 문단으로 쓴다. 최소 120자 이상이고 문장을 끝까지 완성한다.',
      '다른 섹션의 역할을 가져오지 말고 이 문단의 angle만 깊게 설명한다.',
      '생활 속 사례 또는 확인 포인트를 넣되 같은 말을 반복하지 않는다.',
      '실제 안경사가 설명하는 생활 언어를 쓰고, 매장 홍보·마크다운·JSON은 넣지 않는다.',
      '한글 문장에 일본어·중국어 문자를 섞지 않는다.',
      ...(avoidText ? [`다음 기존 문단과 내용·표현이 겹치지 않게 완전히 다른 설명으로 작성한다.\n반복 금지 참고문단: ${avoidText.slice(0,650)}`] : []),
      ...(n>1&&previous ? [`이전 출력은 품질검사를 통과하지 못했다. 길이 ${lastLength}자. 사실 단정, 외국 문자, 반복 표현을 제거하고 완성된 문단으로 다시 써라.\n이전 출력: ${previous.slice(0,650)}`] : []),
      ...safety(topic)
    ].join('\n');
    try{
      const r=await env.AI.run(WRITER_MODEL,{
        messages:[{role:'system',content:'Write one complete practical Korean paragraph for a real local optician blog. Plain text only. Never stop mid-sentence. Do not invent medical or seasonal facts.'},{role:'user',content:prompt}],
        temperature:n===1?0.3:0.15,max_tokens:750
      });
      const body=cleanText(txt(r));
      previous=body;lastLength=body.length;
      if(bodyOK(body)) return {body,attempts:n,length:lastLength};
      err=new Error(`section_quality_failed_${index+1}_len_${lastLength}`);
    }catch(e){err=e;}
  }
  throw err||new Error(`section_generation_failed_${index+1}_len_${lastLength}`);
}

async function build(env,topic){
  if(!env?.AI?.run) throw new Error('workers_ai_not_bound');
  const p=await makePlan(env,topic);
  let generated=await Promise.all(
    p.plan.section_plans.map((plan,index)=>section(env,topic,plan,index))
  );

  let distinctRepairs=0;
  for(let i=1;i<generated.length;i++){
    let worst=0,worstIndex=-1;
    for(let j=0;j<i;j++){
      const sim=similarity(generated[i].body,generated[j].body);
      if(sim>worst){worst=sim;worstIndex=j;}
    }
    if(worst>=0.62){
      const repaired=await section(env,topic,p.plan.section_plans[i],i,generated[worstIndex].body);
      generated[i]=repaired;distinctRepairs++;
    }
  }

  const sections=generated.map((item,index)=>({
    heading:p.plan.section_plans[index].heading,body:item.body,photo_after:true
  }));
  const tries=generated.reduce((sum,item)=>sum+item.attempts,0);
  const maxSim=maxSimilarity(sections);
  const d={
    mode:'ai-structured-multistage-quality-gated',title:p.plan.title,intro:p.plan.intro,sections,
    photo_slots:p.plan.photo_slots,video_plan:{...p.plan.video_plan,duration_sec:30},
    hashtags:p.plan.hashtags,cta:p.plan.cta,
    generation_meta:{
      structured_output:true,text_quality_gate_passed:true,quality_gate:QUALITY_GATE,
      plan_model:PLAN_MODEL,writer_model:WRITER_MODEL,plan_attempts:p.attempts,
      section_attempts:tries,parallel_sections:true,distinct_repairs:distinctRepairs,
      section_lengths:generated.map(item=>item.length),max_section_similarity:Number(maxSim.toFixed(3))
    }
  };
  if(!draftOK(d)) throw new Error(`draft_quality_failed:max_similarity_${maxSim.toFixed(3)}`);
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
      return J({ok:true,topic,draft,ai_used:true,structured_output:true,text_quality_gate_passed:true,media_policy:MEDIA_POLICY});
    }catch(e){
      return J({ok:false,topic,ai_used:false,structured_output:false,text_quality_gate_passed:false,error:e?.message||String(e)},502);
    }
  }
};
