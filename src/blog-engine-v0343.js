import workerV0342 from './blog-engine-v034.js';

const QUALITY_GATE='v0.3.4.3-stella-v13b';
const VOICE_PROFILE='stella-v13b-starpoint-friendly-60-40';
const FULL_DRAFT_RETRY_LIMIT=3;
const H={'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':'*'};
const J=(data,status=200)=>new Response(JSON.stringify(data,null,2),{status,headers:H});

function retryableGenerationFailure(status,data){
  const error=String(data?.error||'');
  if(status!==502) return false;
  return /^section_\d+_/.test(error)||/^draft_/.test(error);
}

function lockStellaMeta(draft,fullDraftAttempts=1){
  if(!draft||typeof draft!=='object') return draft;
  return {
    ...draft,
    generation_meta:{
      ...(draft.generation_meta||{}),
      quality_gate:QUALITY_GATE,
      voice_profile:VOICE_PROFILE,
      stella_v13b_locked:true,
      extra_lead_rewrite:false,
      full_draft_attempts:fullDraftAttempts
    }
  };
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
      return J({...lastData,draft:lockStellaMeta(lastData.draft,attempt)},lastResponse.status);
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
    if(request.method==='POST'&&url.pathname==='/api/draft') return draftWithRetry(request,env,ctx);

    const response=await workerV0342.fetch(request,env,ctx);
    if(!(request.method==='GET'&&url.pathname==='/health')) return response;

    let data;
    try{data=await response.clone().json();}catch{return response;}
    return J({
      ...data,
      text_quality_gate:QUALITY_GATE,
      voice_profile:VOICE_PROFILE,
      stella_v13b_locked:true,
      extra_lead_rewrite:false,
      full_draft_retry_limit:FULL_DRAFT_RETRY_LIMIT
    },response.status);
  }
};
