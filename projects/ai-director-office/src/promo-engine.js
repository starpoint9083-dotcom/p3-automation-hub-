import {academyId,HttpError,uid} from './lib.js';
import {createPromoPost} from './promo-v2.js';

const IMAGE_MODEL_DEFAULT='@cf/black-forest-labs/flux-2-klein-4b';
const IMAGE_TIMEOUT_MS=180000;

function decodeBase64(base64){
  const clean=String(base64||'').replace(/^data:image\/\w+;base64,/, '');
  const binary=atob(clean);
  const out=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)out[i]=binary.charCodeAt(i);
  return out;
}
function safeJson(text,fallback={}){try{return JSON.parse(text||'');}catch{return fallback;}}
function ratio(w,h){return Number(w||0)>0&&Number(h||0)>0?Number(w)/Number(h):0;}
function assetScore(asset,req){
  let score=0;
  if(String(asset.channel||'')===String(req.channel||''))score+=36;
  if(String(asset.purpose||'')===String(req.purpose||''))score+=34;
  if(req.target_segment&&asset.target_segment===req.target_segment)score+=18;
  const ar=ratio(asset.width,asset.height),rr=ratio(req.width,req.height);
  if(ar&&rr){const diff=Math.abs(ar-rr);score+=diff<0.03?12:diff<0.12?7:diff<0.25?2:-6;}
  if(Number(asset.width||0)>=Number(req.width||0)*0.8&&Number(asset.height||0)>=Number(req.height||0)*0.8)score+=5;
  score-=Math.min(8,Number(asset.reuse_count||0)*0.5);
  return score;
}
async function withTimeout(promise,ms,label){
  let timer;
  try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`${label} ${Math.round(ms/1000)}초 제한 초과`)),ms);})]);}
  finally{if(timer)clearTimeout(timer);}
}

export async function findReusablePromoAsset(env,req){
  const {results=[]}=await env.DB.prepare(`SELECT id,mission_id,kind,purpose,channel,object_key,mime_type,width,height,status,reuse_count,last_used_at,source_type,target_segment,created_at FROM promo_assets WHERE academy_id=? AND status='READY' AND kind='IMAGE' ORDER BY COALESCE(last_used_at,created_at) DESC LIMIT 100`).bind(academyId(env)).all();
  const ranked=results.map(asset=>({asset,score:assetScore(asset,req)})).sort((a,b)=>b.score-a.score);
  const best=ranked[0];
  return best&&best.score>=62?best:null;
}

export async function generateOrReusePromoImage(env,payload){
  if(!env.PROMO_ASSETS)throw new HttpError(503,'PROMO_ASSETS_NOT_BOUND');
  const req={mission_id:String(payload.mission_id||''),purpose:String(payload.purpose||'홍보 이미지'),channel:String(payload.channel||'GENERAL'),width:Math.max(256,Math.min(1920,Math.floor(Number(payload.width)||1080))),height:Math.max(256,Math.min(1920,Math.floor(Number(payload.height)||1350))),target_segment:String(payload.target_segment||''),prompt_hint:String(payload.prompt_hint||'').slice(0,800)};
  if(!req.mission_id)throw new HttpError(400,'MISSION_ID_REQUIRED');
  const mission=await env.DB.prepare(`SELECT id,target_segment,mission_text FROM promo_missions WHERE id=? AND academy_id=?`).bind(req.mission_id,academyId(env)).first();
  if(!mission)throw new HttpError(404,'PROMO_MISSION_NOT_FOUND');
  if(!req.target_segment)req.target_segment=String(mission.target_segment||'');
  const reusable=await findReusablePromoAsset(env,req);
  if(reusable){
    await env.DB.prepare(`UPDATE promo_assets SET reuse_count=reuse_count+1,last_used_at=CURRENT_TIMESTAMP WHERE id=?`).bind(reusable.asset.id).run();
    return {id:reusable.asset.id,mission_id:req.mission_id,purpose:req.purpose,channel:req.channel,width:reusable.asset.width,height:reusable.asset.height,url:`/api/promo/assets/${encodeURIComponent(reusable.asset.id)}`,status:'READY',reused:true,match_score:reusable.score,source_type:reusable.asset.source_type||'GENERATED'};
  }
  if(!env.AI)throw new HttpError(503,'AI_NOT_BOUND');
  const hint=req.prompt_hint||`${req.target_segment} 모집을 위한 영어학원 홍보 이미지`;
  const prompt=`Premium Korean neighborhood English academy promotional photography/illustration for parents. ${hint}. Clean modern learning environment, warm natural light, trustworthy and calm, realistic educational materials, no readable text, no logos, no identifiable child faces, no exaggerated luxury, generous composition space for later Korean typography. Target: ${req.target_segment}.`;
  const form=new FormData();form.append('prompt',prompt);form.append('width',String(req.width));form.append('height',String(req.height));const serialized=new Response(form);
  const result=await withTimeout(env.AI.run(env.IMAGE_MODEL||IMAGE_MODEL_DEFAULT,{multipart:{body:serialized.body,contentType:serialized.headers.get('content-type')}}),IMAGE_TIMEOUT_MS,'이미지 AI');
  const image=result?.image||result?.result?.image;if(!image)throw new HttpError(502,'IMAGE_EMPTY_RESPONSE');
  const bytes=decodeBase64(image),id=uid('asset'),date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),key=`promo/${academyId(env)}/${date}/${id}.png`;
  await env.PROMO_ASSETS.put(key,bytes,{httpMetadata:{contentType:'image/png'},customMetadata:{academy_id:academyId(env),mission_id:req.mission_id,purpose:req.purpose,channel:req.channel}});
  await env.DB.prepare(`INSERT INTO promo_assets (id,academy_id,mission_id,kind,purpose,channel,prompt,object_key,mime_type,width,height,status,reuse_count,last_used_at,source_type,target_segment) VALUES (?,?,?,?,?,?,?,?,?,?,?,'READY',0,CURRENT_TIMESTAMP,'GENERATED',?)`).bind(id,academyId(env),req.mission_id,'IMAGE',req.purpose,req.channel,prompt,key,'image/png',req.width,req.height,req.target_segment).run();
  return {id,mission_id:req.mission_id,purpose:req.purpose,channel:req.channel,width:req.width,height:req.height,url:`/api/promo/assets/${encodeURIComponent(id)}`,status:'READY',reused:false,source_type:'GENERATED'};
}

export async function createPromoProductionRun(env,{mission_id,items=[]}){
  const missionId=String(mission_id||'');if(!missionId)throw new HttpError(400,'MISSION_ID_REQUIRED');
  const mission=await env.DB.prepare(`SELECT id FROM promo_missions WHERE id=? AND academy_id=?`).bind(missionId,academyId(env)).first();if(!mission)throw new HttpError(404,'PROMO_MISSION_NOT_FOUND');
  const runId=uid('prun'),normalized=(Array.isArray(items)?items:[]).slice(0,40);
  await env.DB.prepare(`INSERT INTO promo_production_runs (id,academy_id,mission_id,status,total_items) VALUES (?,?,?,'QUEUED',?)`).bind(runId,academyId(env),missionId,normalized.length).run();
  for(const item of normalized)await env.DB.prepare(`INSERT INTO promo_production_items (id,run_id,academy_id,mission_id,item_type,channel,purpose,payload_json,status) VALUES (?,?,?,?,?,?,?,?,'QUEUED')`).bind(uid('pitem'),runId,academyId(env),missionId,String(item.item_type||'POST'),String(item.channel||''),String(item.purpose||''),JSON.stringify(item.payload||{})).run();
  return promoProductionRun(env,runId);
}

export async function createMissionProductionRun(env,missionId){
  missionId=String(missionId||'');
  const existing=await env.DB.prepare(`SELECT id FROM promo_production_runs WHERE academy_id=? AND mission_id=? AND status IN ('QUEUED','RUNNING','PAUSED') ORDER BY created_at DESC LIMIT 1`).bind(academyId(env),missionId).first();
  if(existing)return promoProductionRun(env,existing.id);
  const mission=await env.DB.prepare(`SELECT id,target_segment,channels_json,needs_json FROM promo_missions WHERE id=? AND academy_id=?`).bind(missionId,academyId(env)).first();if(!mission)throw new HttpError(404,'PROMO_MISSION_NOT_FOUND');
  const needs=safeJson(mission.needs_json,[]),channels=safeJson(mission.channels_json,[]),items=[];
  for(const n of needs)items.push({item_type:'IMAGE',channel:String(n.channel||'GENERAL'),purpose:String(n.purpose||'홍보 이미지'),payload:{width:Number(n.width)||1080,height:Number(n.height)||1350,prompt_hint:String(n.prompt_hint||''),target_segment:String(mission.target_segment||'')}});
  for(const channel of channels){const c=String(channel||'').toUpperCase();items.push({item_type:c==='YOUTUBE'?'SHORTS_SCRIPT':c==='INSTAGRAM'?'REELS_SCRIPT':c==='NAVER_BLOG'?'BLOG':'DAANGN',channel:c,purpose:`${c} 완성 콘텐츠`,payload:{}});}
  return createPromoProductionRun(env,{mission_id:missionId,items});
}

async function refreshRunStats(env,runId){
  const stats=await env.DB.prepare(`SELECT COUNT(*) total,SUM(CASE WHEN status='READY' THEN 1 ELSE 0 END) done,SUM(CASE WHEN status='FAILED' THEN 1 ELSE 0 END) failed,SUM(CASE WHEN status='QUEUED' THEN 1 ELSE 0 END) queued,SUM(CASE WHEN status='PROCESSING' THEN 1 ELSE 0 END) processing FROM promo_production_items WHERE run_id=?`).bind(runId).first();
  const total=Number(stats?.total||0),done=Number(stats?.done||0),failed=Number(stats?.failed||0),queued=Number(stats?.queued||0),processing=Number(stats?.processing||0);
  let status='RUNNING';if(total>0&&done===total)status='DONE';else if(failed>0&&queued===0&&processing===0)status='FAILED';else if(queued>0&&processing===0)status='PAUSED';
  await env.DB.prepare(`UPDATE promo_production_runs SET total_items=?,done_items=?,failed_items=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(total,done,failed,status,runId).run();
  return {total,done,failed,queued,processing,status};
}
function retryAt(attempt){return new Date(Date.now()+Math.min(5,Math.max(1,attempt))*60000).toISOString();}

export async function processPromoProductionRun(env,runId,{max_items=3}={}){
  const run=await env.DB.prepare(`SELECT id,mission_id FROM promo_production_runs WHERE id=? AND academy_id=?`).bind(String(runId),academyId(env)).first();if(!run)throw new HttpError(404,'PROMO_RUN_NOT_FOUND');
  await env.DB.prepare(`UPDATE promo_production_items SET status='QUEUED',updated_at=CURRENT_TIMESTAMP WHERE run_id=? AND status='PROCESSING'`).bind(run.id).run();
  await env.DB.prepare(`UPDATE promo_production_runs SET status='RUNNING',updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(run.id).run();
  const limit=Math.max(1,Math.min(5,Number(max_items)||3));
  const {results:items=[]}=await env.DB.prepare(`SELECT * FROM promo_production_items WHERE run_id=? AND status='QUEUED' AND (next_retry_at IS NULL OR next_retry_at<=CURRENT_TIMESTAMP) ORDER BY created_at,id LIMIT ?`).bind(run.id,limit).all();
  const processed=[];
  for(const item of items){
    const attempt=Number(item.attempt_count||0)+1;
    await env.DB.prepare(`UPDATE promo_production_items SET status='PROCESSING',attempt_count=?,last_retry_at=CURRENT_TIMESTAMP,last_error='',updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(attempt,item.id).run();
    try{
      const payload=safeJson(item.payload_json,{}),result=item.item_type==='IMAGE'?await generateOrReusePromoImage(env,{mission_id:run.mission_id,channel:item.channel,purpose:item.purpose,...payload}):await createPromoPost(env,{mission_id:run.mission_id,channel:item.channel});
      await env.DB.prepare(`UPDATE promo_production_items SET status='READY',result_ref=?,last_error='',next_retry_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(String(result?.id||''),item.id).run();
      processed.push({id:item.id,status:'READY',result_ref:String(result?.id||''),reused:Boolean(result?.reused)});
    }catch(error){
      const permanent=attempt>=4,next=permanent?null:retryAt(attempt),message=String(error?.message||error).slice(0,900);
      await env.DB.prepare(`UPDATE promo_production_items SET status=?,last_error=?,next_retry_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(permanent?'FAILED':'QUEUED',message,next,item.id).run();
      processed.push({id:item.id,status:permanent?'FAILED':'QUEUED',error:message,next_retry_at:next});
    }
  }
  const stats=await refreshRunStats(env,run.id);return {...await promoProductionRun(env,run.id),processed_now:processed,stats};
}

export async function promoProductionRun(env,runId){
  const run=await env.DB.prepare(`SELECT * FROM promo_production_runs WHERE id=? AND academy_id=?`).bind(String(runId),academyId(env)).first();if(!run)throw new HttpError(404,'PROMO_RUN_NOT_FOUND');
  const {results:items=[]}=await env.DB.prepare(`SELECT id,item_type,channel,purpose,status,result_ref,attempt_count,last_error,last_retry_at,next_retry_at,created_at,updated_at FROM promo_production_items WHERE run_id=? ORDER BY created_at,id`).bind(run.id).all();return {...run,items};
}

export async function recoverPromoProductionRun(env,runId){
  const run=await env.DB.prepare(`SELECT id FROM promo_production_runs WHERE id=? AND academy_id=?`).bind(String(runId),academyId(env)).first();if(!run)throw new HttpError(404,'PROMO_RUN_NOT_FOUND');
  const restored=await env.DB.prepare(`UPDATE promo_production_items SET status='QUEUED',attempt_count=0,last_error='',last_retry_at=NULL,next_retry_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE run_id=? AND status IN ('PROCESSING','FAILED')`).bind(run.id).run();
  await env.DB.prepare(`UPDATE promo_production_runs SET status='QUEUED',last_error='',updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(run.id).run();
  return {ok:true,run_id:run.id,restored:Number(restored?.meta?.changes||0)};
}
