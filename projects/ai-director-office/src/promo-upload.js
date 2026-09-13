import {academyId,HttpError,uid} from './lib.js';

const IMAGE_TYPES=new Set(['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif']);
const VIDEO_TYPES=new Set(['video/mp4','video/webm','video/quicktime','video/x-m4v']);
const CHANNELS=new Set(['GENERAL','YOUTUBE','NAVER_BLOG','INSTAGRAM','DAANGN']);
const IMAGE_LIMIT=20*1024*1024;
const VIDEO_LIMIT=80*1024*1024;

function decodedHeader(request,name,fallback=''){
  const raw=request.headers.get(name)||'';
  if(!raw)return fallback;
  try{return decodeURIComponent(raw)}catch{return raw}
}
function positiveInt(value){const n=Math.floor(Number(value)||0);return n>0?n:null}
function extFor(mime,name=''){
  const m=String(name).toLowerCase().match(/\.([a-z0-9]{2,5})$/);
  if(m)return m[1].replace(/[^a-z0-9]/g,'').slice(0,5)||'bin';
  return ({'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif','image/heic':'heic','image/heif':'heif','video/mp4':'mp4','video/webm':'webm','video/quicktime':'mov','video/x-m4v':'m4v'})[mime]||'bin';
}
function seoulDay(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}

export async function uploadPromoMedia(env,request){
  if(!env.PROMO_ASSETS)throw new HttpError(503,'PROMO_ASSETS_NOT_BOUND');
  if(!request.body)throw new HttpError(400,'MEDIA_BODY_REQUIRED');
  const mime=String(request.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
  const kind=IMAGE_TYPES.has(mime)?'IMAGE':VIDEO_TYPES.has(mime)?'VIDEO':'';
  if(!kind)throw new HttpError(415,'UNSUPPORTED_MEDIA_TYPE');
  const size=Number(request.headers.get('x-file-size')||request.headers.get('content-length')||0);
  const limit=kind==='IMAGE'?IMAGE_LIMIT:VIDEO_LIMIT;
  if(!Number.isFinite(size)||size<=0)throw new HttpError(400,'MEDIA_SIZE_REQUIRED');
  if(size>limit)throw new HttpError(413,kind==='IMAGE'?'IMAGE_TOO_LARGE':'VIDEO_TOO_LARGE');

  const missionId=decodedHeader(request,'x-mission-id','').slice(0,140)||null;
  if(missionId){const mission=await env.DB.prepare(`SELECT id FROM promo_missions WHERE id=? AND academy_id=?`).bind(missionId,academyId(env)).first();if(!mission)throw new HttpError(404,'PROMO_MISSION_NOT_FOUND')}
  const channelRaw=String(request.headers.get('x-channel')||'GENERAL').toUpperCase();
  const channel=CHANNELS.has(channelRaw)?channelRaw:'GENERAL';
  const purpose=decodedHeader(request,'x-purpose',kind==='IMAGE'?'학원 갤러리 사진':'학원 갤러리 영상').slice(0,160)|| (kind==='IMAGE'?'학원 갤러리 사진':'학원 갤러리 영상');
  const fileName=decodedHeader(request,'x-file-name',kind==='IMAGE'?'photo':'video').slice(0,180);
  const width=positiveInt(request.headers.get('x-width'));
  const height=positiveInt(request.headers.get('x-height'));
  const id=uid('asset'),key=`promo/${academyId(env)}/uploads/${seoulDay()}/${id}.${extFor(mime,fileName)}`;
  await env.PROMO_ASSETS.put(key,request.body,{httpMetadata:{contentType:mime},customMetadata:{academy_id:academyId(env),mission_id:missionId||'',source_type:'UPLOADED',purpose,channel,file_name:fileName}});
  try{
    await env.DB.prepare(`INSERT INTO promo_assets (id,academy_id,mission_id,kind,purpose,channel,prompt,object_key,mime_type,width,height,status,reuse_count,last_used_at,source_type,target_segment) VALUES (?,?,?,?,?,?,?,?,?,?,?,'READY',0,CURRENT_TIMESTAMP,'UPLOADED','')`).bind(id,academyId(env),missionId,kind,purpose,channel,'',key,mime,width,height).run();
  }catch(error){try{await env.PROMO_ASSETS.delete(key)}catch{}throw error}
  return {id,mission_id:missionId,kind,purpose,channel,mime_type:mime,width,height,file_name:fileName,size,status:'READY',source_type:'UPLOADED',url:`/api/promo/assets/${encodeURIComponent(id)}`};
}
