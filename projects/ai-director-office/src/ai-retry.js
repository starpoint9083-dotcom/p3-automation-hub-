import {HttpError} from './lib.js';

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function quotaExhausted(error){
  const msg=String(error?.message||error||'').toLowerCase();
  return msg.includes('4006')||msg.includes('daily free allocation')||msg.includes('used up your daily free allocation');
}
function permanentError(error){
  if(quotaExhausted(error))return true;
  const status=Number(error?.status||error?.statusCode||error?.cause?.status||0);
  if(status>=400&&status<500&&status!==408&&status!==409&&status!==425&&status!==429)return true;
  const msg=String(error?.message||error||'').toLowerCase();
  return /invalid (?:request|input|model)|unsupported|unauthori[sz]ed|forbidden|permission|authentication|not found/.test(msg);
}
function emptyAIResult(result){
  if(result===null||result===undefined)return true;
  if(typeof result==='string')return result.trim()==='';
  if(typeof result!=='object')return false;
  if('response' in result)return String(result.response??'').trim()==='';
  if(result?.result&&typeof result.result==='object'&&'response' in result.result)return String(result.result.response??'').trim()==='';
  if('image' in result)return !result.image;
  if(result?.result&&typeof result.result==='object'&&'image' in result.result)return !result.result.image;
  return false;
}
function normalizeAIError(error){
  if(quotaExhausted(error))return new HttpError(503,'AI_QUOTA_EXHAUSTED','Cloudflare Workers AI daily allocation is exhausted');
  return error;
}

export function withAIRetry(env){
  if(!env?.AI?.run||env.__AI_RETRY_WRAPPED__)return env;
  const raw=env.AI;
  const wrappedAI={...raw,run:async(...args)=>{
    let last;
    for(let attempt=1;attempt<=3;attempt++){
      try{
        const result=await raw.run(...args);
        if(emptyAIResult(result))throw new Error('AI_EMPTY_TRANSIENT_RESPONSE');
        return result;
      }catch(error){
        last=error;
        if(attempt>=3||permanentError(error))throw normalizeAIError(error);
        await sleep(500*Math.pow(2,attempt-1));
      }
    }
    throw normalizeAIError(last);
  }};
  return {...env,AI:wrappedAI,__AI_RETRY_WRAPPED__:true};
}
