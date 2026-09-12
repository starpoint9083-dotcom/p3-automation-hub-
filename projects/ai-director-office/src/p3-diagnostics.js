import {academyId} from './lib.js';

function errInfo(error){
  return {
    name:String(error?.name||'Error').slice(0,80),
    message:String(error?.message||error||'unknown').slice(0,500),
    status:Number(error?.status||error?.statusCode||error?.cause?.status||0)||null,
    code:String(error?.code||error?.cause?.code||'').slice(0,120)||null
  };
}
async function step(fn){try{return {ok:true,data:await fn()};}catch(error){return {ok:false,error:errInfo(error)};}}

export async function p3RuntimeDiagnostic(env){
  const academy=academyId(env);
  const dbProfile=await step(async()=>await env.DB.prepare(`SELECT academy_name,neighborhood,consultation_cta,youtube_channel_url,naver_blog_url,instagram_handle,daangn_profile,logo_asset_id,updated_at FROM academy_profile WHERE academy_id=?`).bind(academy).first());
  const dbTargets=await step(async()=>await env.DB.prepare(`SELECT COUNT(*) count FROM academy_targets WHERE academy_id=?`).bind(academy).first());
  const aiBinding={ok:Boolean(env.AI&&typeof env.AI.run==='function'),wrapped:Boolean(env.__AI_RETRY_WRAPPED__),model:env.AI_MODEL||null};
  const aiProbe=await step(async()=>{
    const result=await env.AI.run(env.AI_MODEL||'@cf/meta/llama-3.3-70b-instruct-fp8-fast',{messages:[{role:'user',content:'Reply with exactly OK'}],max_tokens:8,temperature:0});
    const text=typeof result==='string'?result:(result?.response??result?.result?.response??'');
    return {has_text:Boolean(String(text||'').trim()),preview:String(text||'').trim().slice(0,40)};
  });
  return {ok:dbProfile.ok&&dbTargets.ok&&aiBinding.ok&&aiProbe.ok,academy,db_profile:dbProfile,db_targets:dbTargets,ai_binding:aiBinding,ai_probe:aiProbe};
}
