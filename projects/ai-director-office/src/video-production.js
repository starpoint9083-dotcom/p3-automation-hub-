import {academyId,HttpError,requiredString,uid} from './lib.js';
import {runAI} from './services.js';
import {createPromoPost,listPromoAssets,VIDEO_SAFE_ZONES} from './promo-v2.js';

const TTS_MODEL='@cf/myshell-ai/melotts';
const VIDEO_CHANNELS=['YOUTUBE','INSTAGRAM'];
const MAX_VIDEO_BYTES=80*1024*1024;

function parseJson(text){
  const raw=String(text||'').trim();
  try{return JSON.parse(raw)}catch{}
  const a=raw.indexOf('{'),b=raw.lastIndexOf('}');
  if(a>=0&&b>a){try{return JSON.parse(raw.slice(a,b+1))}catch{}}
  throw new HttpError(502,'VIDEO_PLAN_INVALID_JSON');
}
function clipText(v,max=300){return String(v||'').trim().slice(0,max)}
function publicProject(row){
  if(!row)return null;
  let plan={};try{plan=JSON.parse(row.plan_json||'{}')}catch{}
  let safe={};try{safe=JSON.parse(row.safe_zone_json||'{}')}catch{}
  return {...row,plan,safe_zone:safe,narration_url:row.narration_object_key?`/api/promo/videos/${encodeURIComponent(row.id)}/narration`:null,video_url:row.video_object_key?`/api/promo/videos/${encodeURIComponent(row.id)}/file`:null};
}
async function rowById(env,id){return env.DB.prepare(`SELECT * FROM promo_video_projects WHERE id=? AND academy_id=?`).bind(String(id),academyId(env)).first()}
function normalizePlan(plan,assets,channel){
  const duration=Math.max(15,Math.min(channel==='YOUTUBE'?60:45,Math.round(Number(plan.duration_seconds)||Number(plan.duration)||45)));
  const usable=new Map(assets.map(a=>[String(a.id),a]));
  const fallback=assets.filter(a=>['IMAGE','VIDEO'].includes(String(a.kind||'')));
  const rawScenes=Array.isArray(plan.scenes)?plan.scenes:[];
  const scenes=[];
  let cursor=0;
  for(let i=0;i<Math.max(1,Math.min(12,rawScenes.length||fallback.length||1));i++){
    const src=rawScenes[i]||{},chosen=usable.get(String(src.asset_id||''))||fallback[i%Math.max(1,fallback.length)]||null;
    const remain=Math.max(1,duration-cursor),defaultLen=Math.max(2,Math.min(7,Math.ceil(duration/Math.max(1,rawScenes.length||fallback.length||6))));
    const len=Math.max(1,Math.min(remain,Number(src.duration)||defaultLen)),start=cursor,end=Math.min(duration,start+len);
    scenes.push({index:i+1,start,end,duration:end-start,asset_id:chosen?.id||null,asset_url:chosen?.url||null,asset_kind:chosen?.kind||'IMAGE',subtitle:clipText(src.subtitle||src.caption||'',100),headline:clipText(src.headline||'',80),motion:clipText(src.motion||'slow_zoom',40)});
    cursor=end;if(cursor>=duration)break;
  }
  if(scenes.length&&scenes[scenes.length-1].end<duration){scenes[scenes.length-1].end=duration;scenes[scenes.length-1].duration=duration-scenes[scenes.length-1].start}
  const narration=clipText(plan.narration||plan.voiceover||'',3000);
  return {version:1,channel,width:1080,height:1920,duration_seconds:duration,title:clipText(plan.title||'',120),hook:clipText(plan.hook||'',160),cta:clipText(plan.cta||'',160),narration,scenes,safe_zone:VIDEO_SAFE_ZONES[channel]};
}

export async function createVideoProject(env,payload){
  const missionId=requiredString(payload.mission_id,'mission_id',140),channel=requiredString(payload.channel,'channel',30).toUpperCase();
  if(!VIDEO_CHANNELS.includes(channel))throw new HttpError(400,'INVALID_VIDEO_CHANNEL');
  const mission=await env.DB.prepare(`SELECT id,target_segment,mission_text FROM promo_missions WHERE id=? AND academy_id=?`).bind(missionId,academyId(env)).first();
  if(!mission)throw new HttpError(404,'PROMO_MISSION_NOT_FOUND');
  let post=await env.DB.prepare(`SELECT * FROM promo_posts WHERE academy_id=? AND mission_id=? AND channel=? ORDER BY created_at DESC LIMIT 1`).bind(academyId(env),missionId,channel).first();
  if(!post)post=await createPromoPost(env,{mission_id:missionId,channel});
  const allAssets=await listPromoAssets(env),assets=allAssets.filter(a=>!a.mission_id||a.mission_id===missionId).filter(a=>['IMAGE','VIDEO'].includes(String(a.kind||''))).filter(a=>!a.channel||a.channel===channel||a.channel==='GENERAL').slice(0,18);
  if(!assets.length)throw new HttpError(400,'VIDEO_ASSET_REQUIRED','갤러리 사진·동영상이나 생성 이미지를 먼저 준비해주세요.');
  const safe=VIDEO_SAFE_ZONES[channel];
  const system=`당신은 영어학원 세로형 홍보영상 편집감독이다. 반드시 JSON 객체만 출력한다. 확인되지 않은 교육효과, 성적보장, 가짜후기, 공포마케팅을 만들지 않는다. ${channel==='YOUTUBE'?'유튜브 쇼츠 45~60초':'인스타 릴스 30~45초'} 전용으로 설계한다. 1080x1920 세로 영상이며 제목·자막·CTA는 다음 안전영역을 절대 벗어나지 않는다: ${JSON.stringify(safe)}. 자막은 한 화면 2줄 이하, 한 줄은 짧게 쓴다.`;
  const user=`학원 모집작전: ${mission.mission_text}\n기존 ${channel==='YOUTUBE'?'쇼츠':'릴스'} 패키지: ${post.body}\n사용 가능한 자산: ${JSON.stringify(assets.map(a=>({id:a.id,kind:a.kind,purpose:a.purpose,channel:a.channel,width:a.width,height:a.height,url:a.url})))}\n다음 JSON 스키마로만 작성: {"title":"","hook":"","duration_seconds":45,"narration":"한국어 전체 TTS 문장","cta":"","scenes":[{"asset_id":"실제 자산 id","duration":5,"headline":"필요할 때만","subtitle":"화면 자막","motion":"slow_zoom|pan|hold"}]}. 장면 합계는 전체 길이에 맞추고 실제 자산 id만 사용하라.`;
  const raw=await runAI(env,system,user,2600),plan=normalizePlan(parseJson(raw),assets,channel),id=uid('video');
  await env.DB.prepare(`INSERT INTO promo_video_projects (id,academy_id,mission_id,post_id,channel,status,duration_seconds,plan_json,narration_text,safe_zone_json) VALUES (?,?,?,?,?,'PLAN_READY',?,?,?,?)`).bind(id,academyId(env),missionId,post.id,channel,plan.duration_seconds,JSON.stringify(plan),plan.narration,JSON.stringify(safe)).run();
  return publicProject(await rowById(env,id));
}

export async function generateVideoNarration(env,id){
  const row=await rowById(env,id);if(!row)throw new HttpError(404,'VIDEO_PROJECT_NOT_FOUND');
  if(!env.AI)throw new HttpError(503,'AI_NOT_BOUND');if(!env.PROMO_ASSETS)throw new HttpError(503,'PROMO_ASSETS_NOT_BOUND');
  const text=clipText(row.narration_text,3000);if(!text)throw new HttpError(400,'VIDEO_NARRATION_EMPTY');
  const response=await env.AI.run(TTS_MODEL,{prompt:text,lang:'ko'},{returnRawResponse:true});
  let bytes,mime='audio/mpeg';
  if(response instanceof Response){mime=response.headers.get('content-type')||mime;bytes=new Uint8Array(await response.arrayBuffer())}
  else if(response?.audio){const bin=atob(String(response.audio));bytes=Uint8Array.from(bin,c=>c.charCodeAt(0))}
  else if(response instanceof ArrayBuffer||ArrayBuffer.isView(response)){bytes=new Uint8Array(response.buffer||response)}
  if(!bytes?.byteLength)throw new HttpError(502,'TTS_EMPTY_RESPONSE');
  const key=`promo/${academyId(env)}/video/${row.id}/narration.mp3`;
  await env.PROMO_ASSETS.put(key,bytes,{httpMetadata:{contentType:mime},customMetadata:{academy_id:academyId(env),video_project_id:row.id,channel:row.channel}});
  await env.DB.prepare(`UPDATE promo_video_projects SET narration_object_key=?,narration_mime_type=?,status='TTS_READY',updated_at=CURRENT_TIMESTAMP,error_text=NULL WHERE id=?`).bind(key,mime,row.id).run();
  return publicProject(await rowById(env,row.id));
}

export async function videoProject(env,id){const row=await rowById(env,id);if(!row)throw new HttpError(404,'VIDEO_PROJECT_NOT_FOUND');return publicProject(row)}
export async function listVideoProjects(env,missionId=''){
  const q=String(missionId||'');const res=q?await env.DB.prepare(`SELECT * FROM promo_video_projects WHERE academy_id=? AND mission_id=? ORDER BY created_at DESC LIMIT 30`).bind(academyId(env),q).all():await env.DB.prepare(`SELECT * FROM promo_video_projects WHERE academy_id=? ORDER BY created_at DESC LIMIT 30`).bind(academyId(env)).all();
  return (res.results||[]).map(publicProject);
}
export async function videoMediaObject(env,id,type='file'){
  const row=await rowById(env,id);if(!row)throw new HttpError(404,'VIDEO_PROJECT_NOT_FOUND');
  const key=type==='narration'?row.narration_object_key:row.video_object_key,mime=type==='narration'?(row.narration_mime_type||'audio/mpeg'):(row.video_mime_type||'video/mp4');
  if(!key)throw new HttpError(404,type==='narration'?'VIDEO_NARRATION_NOT_READY':'VIDEO_FILE_NOT_READY');
  const obj=await env.PROMO_ASSETS.get(key);if(!obj)throw new HttpError(404,'VIDEO_OBJECT_MISSING');
  return new Response(obj.body,{headers:{'content-type':mime,'cache-control':'private, max-age=3600','x-content-type-options':'nosniff'}});
}
export async function uploadRenderedVideo(env,request,id){
  const row=await rowById(env,id);if(!row)throw new HttpError(404,'VIDEO_PROJECT_NOT_FOUND');if(!env.PROMO_ASSETS)throw new HttpError(503,'PROMO_ASSETS_NOT_BOUND');
  const mime=String(request.headers.get('content-type')||'').split(';')[0].toLowerCase();if(mime!=='video/mp4')throw new HttpError(415,'MP4_REQUIRED','완성영상은 MP4 형식이어야 합니다.');
  const size=Number(request.headers.get('content-length')||request.headers.get('x-file-size')||0);if(size>MAX_VIDEO_BYTES)throw new HttpError(413,'VIDEO_TOO_LARGE');
  const bytes=new Uint8Array(await request.arrayBuffer());if(!bytes.byteLength)throw new HttpError(400,'VIDEO_EMPTY');if(bytes.byteLength>MAX_VIDEO_BYTES)throw new HttpError(413,'VIDEO_TOO_LARGE');
  const key=`promo/${academyId(env)}/video/${row.id}/${row.channel==='YOUTUBE'?'shorts':'reels'}.mp4`;
  await env.PROMO_ASSETS.put(key,bytes,{httpMetadata:{contentType:'video/mp4'},customMetadata:{academy_id:academyId(env),video_project_id:row.id,channel:row.channel}});
  await env.DB.prepare(`UPDATE promo_video_projects SET video_object_key=?,video_mime_type='video/mp4',status='READY',updated_at=CURRENT_TIMESTAMP,error_text=NULL WHERE id=?`).bind(key,row.id).run();
  return publicProject(await rowById(env,row.id));
}
