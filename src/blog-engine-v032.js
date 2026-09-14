import legacyWorker from './blog-engine.js';
import { BLOG_ENGINE_VERSION, MEDIA_POLICY } from './blog-engine-config.js';

const WRITER_MODEL='@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const QUALITY_GATE='v0.3.2-safe-plan-split-writing';
const H={'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':'*'};
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
  const rules=[
    '질병 진단·치료 효과를 단정하지 않는다.',
    '확인되지 않은 수치, 계절 비교, 의학 통계를 만들지 않는다.',
    '가을이라고 자외선이 여름보다 강해진다거나 일조량이 증가한다고 쓰지 않는다. 자외선 노출은 계절·시간·날씨·환경에 따라 달라지며 가을에도 관리가 필요할 수 있다고만 표현한다.',
    '기능은 도수·제품·사용 환경에 따라 달라질 수 있다고 표현한다.',
    '눈 피로 감소, 시야 개선, 눈 건강 유지 같은 효과를 근거 없이 단정하지 않는다.'
  ];
  if(t.includes('변색')) rules.push('일반적인 UV 반응형 변색렌즈는 자동차 유리가 자외선을 많이 차단하기 때문에 차 안에서는 실외보다 착색이 제한될 수 있다. 가시광선에도 반응하는 일부 제품은 다를 수 있으므로 제품별 사양 확인이 필요하다고 설명한다.');
  if(t.includes('블루라이트')) rules.push('블루라이트 차단이 피로 개선이나 질환 예방을 보장한다고 단정하지 않는다.');
  return rules;
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
function textIssue(s,min=1,max=5000){
  if(typeof s!=='string') return 'not_string';
  const text=s.trim();
  if(text.length<min) return `too_short_${text.length}`;
  if(text.length>max) return `too_long_${text.length}`;
  if(BAD_FOREIGN.test(text)) return 'foreign_cjk';
  if(BAD_PATTERNS.some(re=>re.test(text))) return 'unsafe_claim';
  return null;
}
function safeText(s,min=1,max=5000){return !textIssue(s,min,max);}
function tokens(s){return new Set(norm(s).replace(/[^0-9a-z가-힣\s]/g,' ').split(/\s+/).filter(w=>w.length>=2));}
function similarity(a,b){
  const A=tokens(a),B=tokens(b);if(!A.size||!B.size)return 0;
  let n=0;for(const x of A)if(B.has(x))n++;
  return n/(A.size+B.size-n);
}
function maxSimilarity(sections){
  let max=0;for(let i=0;i<sections.length;i++)for(let j=0;j<i;j++)max=Math.max(max,similarity(sections[i].body,sections[j].body));
  return max;
}

function safeIntro(topic){
  const t=norm(`${topic.keyword} ${topic.blog_bridge}`);
  if(t.includes('자외선')||t.includes('변색')){
    return '가을에도 야외 활동을 하다 보면 햇빛과 눈부심이 신경 쓰일 때가 있습니다. 자외선 노출은 시간과 날씨, 활동 환경에 따라 달라지므로 계절 이름만 보고 판단하기보다 실제 생활 패턴을 함께 보는 것이 좋습니다. 오늘은 변색렌즈를 고를 때 기능뿐 아니라 사용 환경과 한계까지 같이 살펴보겠습니다.';
  }
  return `${topic.keyword} 때문에 안경이 불편하다면 제품부터 고르기보다 언제, 어떤 거리와 환경에서 불편한지 먼저 확인하는 편이 좋습니다. 오늘은 ${topic.blog_bridge}를 중심으로 실제 안경 선택에서 확인할 기준과 주의점을 차분하게 정리해 보겠습니다.`;
}

function buildSafePlan(topic){
  const isPhoto=norm(`${topic.keyword} ${topic.blog_bridge}`).includes('변색');
  const plans=[
    {heading:`${topic.keyword}, 먼저 생활 속 불편부터 확인`,angle:'고객이 실제로 언제 무엇이 불편한지 구체적인 생활 상황을 설명한다.',key_points:['야외·실내 이동 등 실제 사용 장면','제품보다 불편 상황을 먼저 확인']},
    {heading:`${topic.blog_bridge}, 기능과 한계를 함께 보기`,angle:'관련 렌즈 또는 안경 기능이 어떤 상황에 쓰이는지와 한계를 균형 있게 설명한다.',key_points:isPhoto?['실외에서의 변색 특성','차량 안에서는 제품별 반응 차이 확인']:['기능이 도움 되는 사용 환경','도수·제품·환경에 따른 차이']},
    {heading:'내 생활에 맞게 고를 때 비교할 기준',angle:'구매 전에 고객이 비교해야 할 실용적인 선택 기준을 제시한다.',key_points:['주 사용 장소와 시간','색상·도수·착용 습관 등 개인 조건']},
    {heading:'시력검사와 상담에서 확인할 항목',angle:'매장에서 검사와 상담으로 확인할 사항을 설명하되 과도한 홍보는 피한다.',key_points:['현재 도수와 기존 안경 불편 원인','생활 패턴을 반영한 렌즈 선택']}
  ];
  return {
    title:topic.suggested_title||`${topic.keyword}, 안경을 바꾸기 전에 확인할 것`,
    intro:safeIntro(topic),
    section_plans:plans,
    photo_slots:[
      {position:'도입부 뒤',description:'스타포인트안경원 실제 시력검사 또는 상담 장면',source_preference:'owned',search_query:''},
      {position:'2번째 섹션 뒤',description:`${topic.blog_bridge}와 관련된 실제 렌즈 또는 안경 디테일`,source_preference:'owned',search_query:`${topic.blog_bridge} 렌즈`},
      {position:'3번째 섹션 뒤',description:'주제와 맞는 생활 사용 장면',source_preference:'ai',search_query:`${topic.keyword} 생활 장면`},
      {position:'마무리 전',description:'가공·피팅 또는 완성 안경 디테일',source_preference:'owned',search_query:''}
    ],
    video_plan:{
      hook:`${topic.keyword}, 기능만 보고 고르기 전에 이것부터 확인하세요`,
      shots:['고객이 느끼는 실제 불편 상황','렌즈 또는 안경 디테일','검사·상담에서 확인할 기준','완성 안경 또는 착용 장면'],
      duration_sec:30,
      caption:'정확한 시력검사, 편안한 안경'
    },
    hashtags:['#스타포인트안경원','#광안동안경원','#수영구안경원',`#${String(topic.keyword).replace(/\s+/g,'')}`],
    cta:'현재 안경이 불편하다면 기능 이름부터 정하기보다 사용 환경과 시력 상태를 함께 확인해 보세요.'
  };
}

function planOK(p){
  return !!(p&&safeText(p.title,8,140)&&safeText(p.intro,40,800)&&p.section_plans?.length===4&&
    p.section_plans.every(s=>safeText(s.heading,4,120)&&safeText(s.angle,10,320)&&s.key_points?.length>=2&&s.key_points.every(k=>safeText(k,3,200)))&&
    p.photo_slots?.length>=4&&p.video_plan?.shots?.length>=3&&safeText(p.video_plan.hook,8,220)&&safeText(p.video_plan.caption,4,180)&&
    p.hashtags?.length>=4&&safeText(p.cta,15,300));
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

async function section(env,topic,sectionPlan,index,avoidText=''){
  let previous='',lastIssue='none',lastLength=0,lastError;
  for(let attempt=1;attempt<=3;attempt++){
    const prompt=[
      `스타포인트안경원 블로그 본문 ${index+1}/4`,`주제: ${topic.keyword}`,`연결: ${topic.blog_bridge}`,
      `소제목: ${sectionPlan.heading}`,`이 문단의 역할: ${sectionPlan.angle}`,
      `반드시 다룰 핵심: ${sectionPlan.key_points.join(' / ')}`,
      '한국어 220~420자 한 문단으로 쓴다. 최소 120자 이상이고 마지막 문장을 끝까지 완성한다.',
      '이 문단의 역할만 깊게 설명하고 다른 섹션과 같은 서론을 반복하지 않는다.',
      '실제 안경사가 고객에게 설명하는 생활 언어를 쓴다. 과장 광고, 마크다운, JSON, 매장 홍보 문구는 넣지 않는다.',
      '일본어·중국어 문자를 섞지 않는다.',
      ...(avoidText?[`다음 기존 문단과 내용·표현이 겹치지 않게 작성한다.\n반복 금지 참고문단: ${avoidText.slice(0,650)}`]:[]),
      ...(attempt>1?[`이전 출력은 품질검사에서 '${lastIssue}' 사유로 탈락했다. 같은 문제를 수정하고 새 문장으로 다시 쓴다.\n이전 출력: ${previous.slice(0,650)}`]:[]),
      ...safety(topic)
    ].join('\n');
    try{
      const r=await env.AI.run(WRITER_MODEL,{messages:[
        {role:'system',content:'Write one complete factual Korean paragraph for a real local optician blog. Plain text only. Never invent seasonal or medical facts. Never stop mid-sentence.'},
        {role:'user',content:prompt}
      ],temperature:attempt===1?0.3:0.12,max_tokens:760});
      const body=cleanText(txt(r));
      previous=body;lastLength=body.length;lastIssue=textIssue(body,120,1400)||'none';
      if(lastIssue==='none') return {body,attempts:attempt,length:lastLength};
      lastError=new Error(`section_${index+1}_${lastIssue}`);
    }catch(e){lastError=e;lastIssue=e?.message||'generation_error';}
  }
  throw lastError||new Error(`section_${index+1}_failed_len_${lastLength}`);
}

async function build(env,topic){
  if(!env?.AI?.run) throw new Error('workers_ai_not_bound');
  const plan=buildSafePlan(topic);
  if(!planOK(plan)) throw new Error('safe_plan_validation_failed');

  let generated=await Promise.all(plan.section_plans.map((p,i)=>section(env,topic,p,i)));
  let repairs=0;
  for(let i=1;i<generated.length;i++){
    let worst=0,worstIndex=-1;
    for(let j=0;j<i;j++){
      const sim=similarity(generated[i].body,generated[j].body);
      if(sim>worst){worst=sim;worstIndex=j;}
    }
    if(worst>=0.62){generated[i]=await section(env,topic,plan.section_plans[i],i,generated[worstIndex].body);repairs++;}
  }

  const sections=generated.map((x,i)=>({heading:plan.section_plans[i].heading,body:x.body,photo_after:true}));
  const maxSim=maxSimilarity(sections);
  const draft={
    mode:'ai-split-writing-safe-plan',title:plan.title,intro:plan.intro,sections,
    photo_slots:plan.photo_slots,video_plan:plan.video_plan,hashtags:plan.hashtags,cta:plan.cta,
    generation_meta:{
      structured_output:true,text_quality_gate_passed:true,quality_gate:QUALITY_GATE,
      writer_model:WRITER_MODEL,plan_mode:'deterministic_safe',section_attempts:generated.reduce((s,x)=>s+x.attempts,0),
      parallel_sections:true,distinct_repairs:repairs,section_lengths:generated.map(x=>x.length),max_section_similarity:Number(maxSim.toFixed(3))
    }
  };
  if(!draft.sections.every(s=>safeText(s.heading,4,120)&&safeText(s.body,120,1400))) throw new Error('draft_section_quality_failed');
  if(maxSim>=0.62) throw new Error(`draft_repetition_failed_${maxSim.toFixed(3)}`);
  return draft;
}

export default{
  async fetch(request,env,ctx){
    const u=new URL(request.url);
    if(request.method==='GET'&&u.pathname==='/health'){
      return J({ok:true,service:'p3-blog-engine',version:BLOG_ENGINE_VERSION,ai_bound:Boolean(env?.AI),structured_generation:true,text_quality_gate:QUALITY_GATE,live_trend_source:'Google Trends KR RSS',media_policy:MEDIA_POLICY});
    }
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
