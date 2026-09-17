import {bodyJson,HttpError} from './lib.js';

const TTS_MODEL='@cf/myshell-ai/melotts';

function decodeBase64(value){
  const clean=String(value||'').replace(/^data:audio\/[^;]+;base64,/,'');
  const raw=atob(clean),out=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);
  return out;
}
function audioResponse(value){
  const headers={'content-type':'audio/mpeg','cache-control':'no-store','x-content-type-options':'nosniff'};
  if(value instanceof Response)return new Response(value.body,{status:value.status,headers:{...headers,'content-type':value.headers.get('content-type')||'audio/mpeg'}});
  if(value instanceof ReadableStream)return new Response(value,{headers});
  if(value instanceof ArrayBuffer)return new Response(value,{headers});
  if(ArrayBuffer.isView(value))return new Response(value,{headers});
  if(value?.body instanceof ReadableStream)return new Response(value.body,{headers:{...headers,'content-type':value.contentType||value.content_type||'audio/mpeg'}});
  const audio=value?.audio??value?.result?.audio??value?.data?.audio;
  if(typeof audio==='string'&&audio.length>32)return new Response(decodeBase64(audio),{headers});
  if(typeof value==='string'&&value.length>32)return new Response(decodeBase64(value),{headers});
  throw new HttpError(502,'TTS_EMPTY_RESPONSE');
}
export async function createPromoTts(env,request){
  if(!env.AI)throw new HttpError(503,'AI_NOT_BOUND');
  const b=await bodyJson(request),text=String(b?.text||'').replace(/\s+/g,' ').trim();
  if(!text)throw new HttpError(400,'TTS_TEXT_REQUIRED');
  const prompt=text.slice(0,900);
  let lastError=null;
  for(const lang of ['ko','KR']){
    try{
      const result=await env.AI.run(TTS_MODEL,{prompt,lang});
      return audioResponse(result);
    }catch(error){lastError=error;}
  }
  throw lastError||new HttpError(502,'TTS_GENERATION_FAILED');
}
