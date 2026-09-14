import workerV0342 from './blog-engine-v034.js';

const QUALITY_GATE='v0.3.4.3-friendly-leads';
const VOICE_PROFILE='stella-v13b-starpoint-friendly-60-40';
const FULL_DRAFT_RETRY_LIMIT=3;
const H={'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':'*'};
const J=(data,status=200)=>new Response(JSON.stringify(data,null,2),{status,headers:H});
const FRIENDLY_GLOBAL=/(해요|돼요|예요|이에요|거든요|있어요|없어요|않아요|맞아요|달라요|보세요|보셔야 해요|볼 수 있어요)\./gu;
const LEADS=[
  '처음에는 제품보다 언제 불편한지부터 보는 게 쉬워요.',
  '좋은 기능도 한계까지 같이 봐야 선택이 편해요.',
  '결국 내 생활에 맞는지가 가장 먼저 볼 기준이에요.',
  '마지막은 지금 쓰는 안경의 불편 원인부터 확인하면 돼요.'
];

function friendlyCount(text=''){
  return (String(text).match(FRIENDLY_GLOBAL)||[]).length;
}

function addFriendlyLead(body,index){
  const text=String(body||'').trim();
  if(!text) return text;
  const lead=LEADS[index]||'먼저 생활에서 실제로 불편한 순간부터 보면 쉬워요.';
  if(text.startsWith(lead)) return text;
  return `${lead} ${text}`;
}

function applyFriendlyLeads(draft,fullDraftAttempts=1){
  if(!draft||typeof draft!=='object'||!Array.isArray(draft.sections)) return draft;
  const sections=draft.sections.map((section,index)=>({
    ...section,
    body:addFriendlyLead(section?.body,index)
  }));
  const friendlyTotal=friendlyCount(draft.intro)+sections.reduce((n,s)=>n+friendlyCount(s.body),0);
  return {
    ...draft,
    sections,
    generation_meta:{
      ...(draft.generation_meta||{}),
      quality_gate:QUALITY_GATE,
      voice_profile:VOICE_PROFILE,
      friendly_lead_layer:true,
      full_draft_attempts:fullDraftAttempts,
      friendly_ending_count:friendlyTotal
    }
  };
}

function retryableGenerationFailure(status,data){
  const error=String(data?.error||'');
  if(status!==502) return false;
  return /^section_\d+_/.test(error)||/^draft_/.test(error);
}

async function draftWithRetry(request,env,ctx){
  const bodyText=await request.text();
  let lastResponse;
  let lastData;
  for(let attempt=1;attempt<=FULL_DRAFT_RETRY_LIMIT;attempt++){
    const retryRequest=new Request(request.url,{method:'POST',headers:request.headers,body:bodyText});
    lastResponse=await workerV0342.fetch(retryRequest,env,ctx);
    try{lastData=await lastResponse.clone().json();}catch{return lastResponse;}
    if(lastData?.ok&&lastData?.draft){
      return J({...lastData,draft:applyFriendlyLeads(lastData.draft,attempt)},lastResponse.status);
    }
    if(!retryableGenerationFailure(lastResponse.status,lastData)||attempt===FULL_DRAFT_RETRY_LIMIT){
      return J({...lastData,full_draft_attempts:attempt},lastResponse.status);
    }
  }
  return lastResponse||J({ok:false,error:'draft_retry_exhausted'},502);
}

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url);

    if(request.method==='POST'&&url.pathname==='/api/draft'){
      return draftWithRetry(request,env,ctx);
    }

    const response=await workerV0342.fetch(request,env,ctx);
    if(!(request.method==='GET'&&url.pathname==='/health')) return response;

    let data;
    try{data=await response.clone().json();}catch{return response;}
    return J({...data,text_quality_gate:QUALITY_GATE,voice_profile:VOICE_PROFILE,friendly_lead_layer:true,full_draft_retry_limit:FULL_DRAFT_RETRY_LIMIT},response.status);
  }
};
