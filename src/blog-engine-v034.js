import legacyWorker from './blog-engine.js';
import { BLOG_ENGINE_VERSION, MEDIA_POLICY } from './blog-engine-config.js';

const WRITER_MODEL='@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const QUALITY_GATE='v0.3.4.2-starpoint-natural-friendly';
const H={'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':'*'};
const J=(data,status=200)=>new Response(JSON.stringify(data,null,2),{status,headers:H});
const norm=v=>String(v||'').toLowerCase().replace(/\s+/g,' ').trim();

const BAD_FOREIGN=/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/u;
const BAD_PATTERNS=[
  /가을[^.!?]{0,35}자외선[^.!?]{0,25}(강해|강하|증가|높아)/u,
  /자외선[^.!?]{0,25}(강해지|증가하|더\s*강)/u,
  /(아침|저녁)[^.!?]{0,30}자외선[^.!?]{0,20}(강|높)/u,
  /일조량[^.!?]{0,20}(증가|늘어)/u,
  /시야[^.!?]{0,20}(개선|향상|더\s*좋)/u,
  /(눈|안구)[^.!?]{0,20}(피로|건강)[^.!?]{0,20}(개선|감소|유지|치료)/u,
  /창가[^.!?]{0,45}변색렌즈[^.!?]{0,30}(잘|효과)/u,
  /(더\s*좋은\s*효과|효과적으로|큰\s*도움이\s*될\s*수|전문적인\s*상담이\s*필요|왜\s*그런지\s*이유를\s*보세요)/u,
  /(100%|완벽하게|완전히\s*(차단|해결)|걱정\s*끝|필수\s*아이템)/u
];
const AIISH=['중요합니다','추천드립니다','최적의 선택','전문가와 상담','적합한 렌즈를 선택','도움이 될 수 있습니다','선택하는 것이 중요해요','전문적인 상담이 필요해요','큰 도움이 될 수 있어요'];
const RIGID=['고객은','고객들은','선택해야 합니다','확인해야 합니다','이러한 이유로','왜냐하면','따라서'];
const FRIENDLY_GLOBAL=/(해요|돼요|예요|이에요|거든요|있어요|없어요|않아요|맞아요|달라요|보세요|보셔야 해요|볼 수 있어요)\./gu;
const VOICE_RULES=[
  '기본 톤은 전문성 60, 친근함 40이다.',
  '결론을 먼저 말한다.',
  '바로 이어 실제 생활 장면이나 손님이 겪는 상황을 보여준다.',
  '주의할 점이나 한계를 숨기지 않는다.',
  '마지막에는 왜 그런지 이유나 근거를 붙인다.',
  '짧고 단단한 생활 언어를 쓰되 딱딱한 설명문처럼 쓰지 않는다.',
  '친근함은 말끝 전체를 ~해요로 바꾸는 방식이 아니다. 필요할 때만 부드러운 존댓말을 섞고 나머지는 차분한 설명체로 쓴다.',
  '문단마다 친근한 말끝을 억지로 넣지 않는다. 자연스러움이 우선이다.',
  '너무 가볍거나 장난스럽게 쓰지 않는다. 경험 많은 안경사가 편하게 설명하는 느낌을 유지한다.',
  '고객은, 고객들은 같은 표현을 반복하지 말고 이런 분, 운전을 자주 하신다면, 실제 생활에서는 같은 표현을 쓴다.',
  '“왜냐하면”, “따라서”, “중요합니다”, “추천드립니다”, “최적의 선택”, “전문가와 상담하세요” 같은 AI식 상투 표현을 반복하지 않는다.',
  '시간대별 자외선 강도, 창가에서의 변색 정도, 눈부심 개선 효과처럼 확인되지 않은 사실은 만들지 않는다.'
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
    '가을이라고 자외선이 여름보다 강해진다거나 특정 시간대에 자외선이 더 강하다고 쓰지 않는다. 자외선 노출은 계절·시간·날씨·환경에 따라 달라질 수 있다고만 표현한다.',
    '기능은 도수·제품·사용 환경에 따라 달라질 수 있다고 표현한다.',
    '눈 피로 감소, 시야 개선, 눈 건강 유지, 눈부심 개선 효과를 근거 없이 단정하지 않는다.',
    '창가나 실내 조명만으로 변색렌즈가 잘 작동한다고 일반화하지 않는다.',
    '검사와 상담의 목적은 현재 도수와 불편 원인, 생활 환경을 확인하는 것이라고 설명하고 상담이 반드시 필요하다고 겁주지 않는다.'
  ];
  if(t.includes('변색')) rules.push('일반적인 UV 반응형 변색렌즈는 자동차 유리가 자외선을 많이 차단하기 때문에 차 안에서는 실외보다 착색이 제한될 수 있다. 가시광선에도 반응하는 일부 제품은 다를 수 있으므로 제품별 사양 확인이 필요하다고 설명한다.');
  if(t.includes('블루라이트')) rules.push('블루라이트 차단이 피로 개선이나 질환 예방을 보장한다고 단정하지 않는다.');
  return rules;
}
function txt(result){
  for(const x of [result,result?.response,result?.result?.response,result?.choices?.[0]?.message?.content]) if(typeof x==='string'&&x.trim()) return x.trim();
  return '';
}
function cleanText(s){return String(s||'').replace(/^```(?:text)?\s*/i,'').replace(/```\s*$/i,'').replace(/^["']|["']$/g,'').trim();}
function countPhrases(text,list){return list.reduce((n,p)=>n+(text.split(p).length-1),0);}
function friendlyCount(text){return (text.match(FRIENDLY_GLOBAL)||[]).length;}
function textIssue(s,min=1,max=5000){
  if(typeof s!=='string') return 'not_string';
  const text=s.trim();
  if(text.length<min) return `too_short_${text.length}`;
  if(text.length>max) return `too_long_${text.length}`;
  if(BAD_FOREIGN.test(text)) return 'foreign_cjk';
  if(BAD_PATTERNS.some(re=>re.test(text))) return 'unsafe_or_awkward_claim';
  if(AIISH.some(p=>(text.split(p).length-1)>1)) return 'ai_style_repetition';
  if(min>=120&&countPhrases(text,RIGID)>1) return 'too_formal';
  if(min>=120&&friendlyCount(text)>4) return 'too_chatty';
  return null;
}
function safeText(s,min=1,max=5000){return !textIssue(s,min,max);}
function tokens(s){return new Set(norm(s).replace(/[^0-9a-z가-힣\s]/g,' ').split(/\s+/).filter(w=>w.length>=2));}
function similarity(a,b){const A=tokens(a),B=tokens(b);if(!A.size||!B.size)return 0;let n=0;for(const x of A)if(B.has(x))n++;return n/(A.size+B.size-n);}
function maxSimilarity(sections){let max=0;for(let i=0;i<sections.length;i++)for(let j=0;j<i;j++)max=Math.max(max,similarity(sections[i].body,sections[j].body));return max;}

function safeIntro(topic){
  const t=norm(`${topic.keyword} ${topic.blog_bridge}`);
  if(t.includes('자외선')||t.includes('변색')) return '변색렌즈, 야외를 자주 오가신다면 꽤 편해요. 다만 계절 이름만 보고 고르기보다는 평소 생활을 먼저 보는 게 좋습니다. 햇빛을 얼마나 자주 받는지, 실내와 실외를 얼마나 오가는지, 운전을 많이 하는지에 따라 만족도가 달라질 수 있거든요.';
  return `${topic.keyword}이 신경 쓰인다면 제품부터 정하지 않아도 돼요. 언제, 어느 거리에서, 어떤 상황이 불편한지부터 보면 됩니다. 그다음 ${topic.blog_bridge}가 내 생활과 맞는지 확인하면 훨씬 쉽게 고를 수 있어요.`;
}
function buildSafePlan(topic){
  const isPhoto=norm(`${topic.keyword} ${topic.blog_bridge}`).includes('변색');
  return {
    title:topic.suggested_title||`${topic.keyword}, 제품보다 먼저 확인할 것`,
    intro:safeIntro(topic),
    section_plans:[
      {heading:'먼저, 언제 불편한지부터 볼게요',angle:'결론을 먼저 말하고 실제 생활 속 불편 장면을 자연스러운 존댓말로 보여준다.',key_points:['야외·실내 이동 등 실제 사용 장면','제품보다 불편 상황을 먼저 확인']},
      {heading:'좋은 기능도 한계는 같이 봐야 해요',angle:'렌즈 기능의 장점과 한계를 숨기지 않고 편하게 설명한 뒤 이유를 붙인다.',key_points:isPhoto?['실외에서의 변색 특성','차량 안에서는 제품별 반응 차이 확인']:['기능이 도움 되는 사용 환경','도수·제품·환경에 따른 차이']},
      {heading:'내 생활에 맞는지는 여기서 갈려요',angle:'선택 기준을 결론부터 제시하고 일상적인 예시로 설명한다.',key_points:['주 사용 장소와 시간','색상·도수·착용 습관 등 개인 조건']},
      {heading:'마지막은 시력검사에서 같이 확인해요',angle:'검사와 상담에서 무엇을 확인하는지 부담 없이 현실적인 이유와 함께 설명한다.',key_points:['현재 도수와 기존 안경 불편 원인','생활 패턴을 반영한 렌즈 선택']}
    ],
    photo_slots:[
      {position:'도입부 뒤',description:'스타포인트안경원 실제 시력검사 또는 상담 장면',source_preference:'owned',search_query:''},
      {position:'2번째 섹션 뒤',description:`${topic.blog_bridge} 관련 실제 렌즈 또는 안경 디테일`,source_preference:'owned',search_query:`${topic.blog_bridge} 렌즈`},
      {position:'3번째 섹션 뒤',description:'생활패턴을 보여주는 사용 장면',source_preference:'ai',search_query:`${topic.keyword} 생활 장면`},
      {position:'마무리 전',description:'가공·피팅 또는 완성 안경 디테일',source_preference:'owned',search_query:''}
    ],
    video_plan:{hook:`${topic.keyword}, 제품보다 먼저 볼 게 하나 있어요`,shots:['실제 불편 상황','렌즈 디테일','주의할 한계','검사·상담 장면'],duration_sec:30,caption:'정확한 시력검사, 편안한 안경'},
    hashtags:['#스타포인트안경원','#광안동안경원','#수영구안경원',`#${String(topic.keyword).replace(/\s+/g,'')}`],
    cta:'안경은 기능 이름보다 내 생활에 잘 맞는지가 먼저예요. 지금 쓰는 안경이 왜 불편한지부터 같이 확인해 보세요.'
  };
}
function planOK(p){return !!(p&&safeText(p.title,8,140)&&safeText(p.intro,40,800)&&p.section_plans?.length===4&&p.section_plans.every(s=>safeText(s.heading,4,120)&&safeText(s.angle,10,320)&&s.key_points?.length>=2&&s.key_points.every(k=>safeText(k,3,200)))&&p.photo_slots?.length>=4&&p.video_plan?.shots?.length>=3&&safeText(p.video_plan.hook,8,220)&&safeText(p.video_plan.caption,4,180)&&p.hashtags?.length>=4&&safeText(p.cta,15,300));}

async function topicFor(request,env,body){
  if(body.topic?.keyword){const t={...body.topic};t.blog_bridge=t.blog_bridge||bridge(t.keyword);t.suggested_title=t.suggested_title||`${t.keyword}, 제품보다 먼저 확인할 것`;t.trend_mode=t.trend_mode||'manual_topic';return t;}
  const u=new URL(request.url);const r=await legacyWorker.fetch(new Request(`${u.origin}/api/topics?limit=30`),env);const d=await r.json();
  if(d.topics?.[0]) return {...d.topics[0],trend_mode:'live_relevant'};
  if(d.fallback_suggestions?.[0]) return {...d.fallback_suggestions[0],trend_mode:'evergreen_fallback'};
  return {keyword:'정확한 시력검사',blog_bridge:'생활에 맞는 안경 선택',suggested_title:'안경이 불편하다면, 제품보다 먼저 볼 것',trend_mode:'evergreen_fallback'};
}
async function section(env,topic,sectionPlan,index,avoidText=''){
  let previous='',lastIssue='none',lastLength=0,lastError;
  for(let attempt=1;attempt<=4;attempt++){
    const prompt=[
      `스타포인트안경원 블로그 본문 ${index+1}/4`,`주제: ${topic.keyword}`,`연결: ${topic.blog_bridge}`,
      `소제목: ${sectionPlan.heading}`,`이 문단의 역할: ${sectionPlan.angle}`,`반드시 다룰 핵심: ${sectionPlan.key_points.join(' / ')}`,
      '한국어 220~420자 한 문단으로 쓴다. 마지막 문장을 끝까지 완성한다.',
      ...VOICE_RULES,
      '첫 1~2문장 안에서 이 문단의 결론을 말한다.',
      '그 뒤 실제 생활 장면이나 손님이 느끼는 상황을 하나 넣는다.',
      '한계나 주의점을 숨기지 말고, 마지막에는 왜 그런지 자연스럽게 설명한다.',
      '부드러운 존댓말은 필요할 때 0~3개 정도만 섞는다. 모든 문장을 ~해요로 끝내지 않고, 억지로 친근한 말끝을 넣지도 않는다.',
      '“왜냐하면”, “따라서”, “중요해요”, “필요해요”를 연결어처럼 반복하지 않는다.',
      '시간대별 자외선 강도, 창가에서의 변색 정도, 더 좋은 시야·효과 같은 근거 없는 표현은 만들지 않는다.',
      '매장 홍보 문구, 마크다운, JSON은 넣지 않는다. 일본어·중국어 문자를 섞지 않는다.',
      ...(avoidText?[`다음 기존 문단과 내용·표현이 겹치지 않게 작성한다.\n반복 금지 참고문단: ${avoidText.slice(0,650)}`]:[]),
      ...(attempt>1?[`이전 출력은 품질검사에서 '${lastIssue}' 사유로 탈락했다. 같은 문제를 없애고 완전히 새 문장으로 다시 쓴다.\n이전 출력: ${previous.slice(0,650)}`]:[]),
      ...safety(topic)
    ].join('\n');
    try{
      const r=await env.AI.run(WRITER_MODEL,{messages:[
        {role:'system',content:'Write like an experienced Korean optician speaking warmly but precisely to a customer. Tone balance: 60% professional, 40% friendly. Friendly endings are optional: use 0 to 3 only when natural, and never force them into every paragraph. Keep the rest calm and natural. Lead with the conclusion, then a real-life scene, then caution, then the reason. Never invent UV timing, indoor/window behavior, medical effects, better vision, or guaranteed glare benefits. Never sound childish, salesy, or generic AI. Plain Korean text only.'},
        {role:'user',content:prompt}
      ],temperature:attempt===1?0.24:0.08,max_tokens:760});
      const body=cleanText(txt(r));previous=body;lastLength=body.length;lastIssue=textIssue(body,120,1400)||'none';
      if(lastIssue==='none') return {body,attempts:attempt,length:lastLength};
      lastError=new Error(`section_${index+1}_${lastIssue}`);
    }catch(e){lastError=e;lastIssue=e?.message||'generation_error';}
  }
  throw lastError||new Error(`section_${index+1}_failed_len_${lastLength}`);
}
async function build(env,topic){
  if(!env?.AI?.run) throw new Error('workers_ai_not_bound');
  const plan=buildSafePlan(topic);if(!planOK(plan)) throw new Error('safe_plan_validation_failed');
  let generated=await Promise.all(plan.section_plans.map((p,i)=>section(env,topic,p,i)));
  let repairs=0;
  for(let i=1;i<generated.length;i++){
    let worst=0,worstIndex=-1;for(let j=0;j<i;j++){const sim=similarity(generated[i].body,generated[j].body);if(sim>worst){worst=sim;worstIndex=j;}}
    if(worst>=0.62){generated[i]=await section(env,topic,plan.section_plans[i],i,generated[worstIndex].body);repairs++;}
  }
  const sections=generated.map((x,i)=>({heading:plan.section_plans[i].heading,body:x.body,photo_after:true}));
  const maxSim=maxSimilarity(sections);
  const friendlyTotal=friendlyCount(plan.intro)+generated.reduce((n,x)=>n+friendlyCount(x.body),0);
  const draft={mode:'ai-split-writing-starpoint-friendly-v13b',title:plan.title,intro:plan.intro,sections,photo_slots:plan.photo_slots,video_plan:plan.video_plan,hashtags:plan.hashtags,cta:plan.cta,generation_meta:{structured_output:true,text_quality_gate_passed:true,quality_gate:QUALITY_GATE,voice_profile:'stella-v13b-starpoint-friendly-60-40',writer_model:WRITER_MODEL,plan_mode:'deterministic_safe',section_attempts:generated.reduce((s,x)=>s+x.attempts,0),parallel_sections:true,distinct_repairs:repairs,section_lengths:generated.map(x=>x.length),max_section_similarity:Number(maxSim.toFixed(3)),friendly_ending_count:friendlyTotal}};
  if(!draft.sections.every(s=>safeText(s.heading,4,120)&&safeText(s.body,120,1400))) throw new Error('draft_section_quality_failed');
  if(maxSim>=0.62) throw new Error(`draft_repetition_failed_${maxSim.toFixed(3)}`);
  return draft;
}
export default{
  async fetch(request,env,ctx){
    const u=new URL(request.url);
    if(request.method==='GET'&&u.pathname==='/health') return J({ok:true,service:'p3-blog-engine',version:BLOG_ENGINE_VERSION,ai_bound:Boolean(env?.AI),structured_generation:true,text_quality_gate:QUALITY_GATE,voice_profile:'stella-v13b-starpoint-friendly-60-40',live_trend_source:'Google Trends KR RSS',media_policy:MEDIA_POLICY});
    if(!(request.method==='POST'&&u.pathname==='/api/draft')) return legacyWorker.fetch(request,env,ctx);
    let body={};try{body=await request.json();}catch{}
    const topic=await topicFor(request,env,body);
    try{const draft=await build(env,topic);return J({ok:true,topic,draft,ai_used:true,structured_output:true,text_quality_gate_passed:true,media_policy:MEDIA_POLICY});}
    catch(e){return J({ok:false,topic,ai_used:false,structured_output:false,text_quality_gate_passed:false,error:e?.message||String(e)},502);}
  }
};