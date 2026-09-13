import {academyId,bodyJson,HttpError,numeric,optionalString,requiredString,uid} from './lib.js';
import {ensureAcademy,recruitmentPerformance,recruitmentTargets,runAI} from './services.js';

const CHANNELS=['NAVER_BLOG','INSTAGRAM','DAANGN'];
const CHANNEL_LABEL={NAVER_BLOG:'네이버 블로그',INSTAGRAM:'인스타그램',DAANGN:'당근'};
const IMAGE_MODEL_DEFAULT='@cf/black-forest-labs/flux-2-klein-4b';

function safeJson(text,fallback={}){try{return JSON.parse(text||'');}catch{return fallback;}}
function normalizeChannels(value){
  const raw=Array.isArray(value)?value:[];
  const mapped=raw.map(v=>String(v).trim().toUpperCase().replace(/\s+/g,'_')).map(v=>v==='NAVER'||v==='BLOG'||v==='NAVERBLOG'?'NAVER_BLOG':v==='INSTA'||v==='INSTAGRAM_REELS'?'INSTAGRAM':v==='KARROT'?'DAANGN':v).filter(v=>CHANNELS.includes(v));
  return [...new Set(mapped.length?mapped:CHANNELS)];
}
function profileMissing(profile){
  const out=[];
  if(!profile?.academy_name)out.push('학원명');
  if(!profile?.neighborhood)out.push('동네/상권');
  if(!profile?.consultation_cta)out.push('상담 연결 방법(전화·톡톡·DM 등)');
  if(!profile?.instagram_handle)out.push('인스타그램 계정');
  if(!profile?.naver_blog_url)out.push('네이버 블로그 주소');
  return out;
}
function assetNeedsFor(channels,target){
  const needs=[];
  if(channels.includes('NAVER_BLOG'))needs.push(
    {kind:'IMAGE',channel:'NAVER_BLOG',purpose:'대표 썸네일',width:1200,height:675,required:true,prompt_hint:`${target} 학부모가 신뢰감을 느낄 밝고 정돈된 영어학원 홍보 이미지`},
    {kind:'IMAGE',channel:'NAVER_BLOG',purpose:'본문 학습 장면',width:1200,height:800,required:true,prompt_hint:'교재와 노트, 연필이 놓인 깨끗한 영어 학습 공간. 학생 얼굴 식별 없이 자연스러운 수업 분위기'},
    {kind:'IMAGE',channel:'NAVER_BLOG',purpose:'상담 안내 이미지',width:1200,height:675,required:false,prompt_hint:'영어학원 상담을 상징하는 따뜻하고 전문적인 책상과 노트, 차분한 분위기'}
  );
  if(channels.includes('INSTAGRAM'))needs.push(
    {kind:'IMAGE',channel:'INSTAGRAM',purpose:'피드 커버',width:1080,height:1350,required:true,prompt_hint:`${target} 모집용 프리미엄 영어학원 소셜 미디어 커버. 여백이 충분하고 학부모 대상의 신뢰감 있는 교육 분위기`},
    {kind:'IMAGE',channel:'INSTAGRAM',purpose:'카드 2',width:1080,height:1350,required:true,prompt_hint:'아이 영어 학습 습관을 상징하는 교재, 연필, 체크리스트가 있는 세련된 교육 비주얼'},
    {kind:'IMAGE',channel:'INSTAGRAM',purpose:'릴스 세로 커버',width:1080,height:1920,required:false,prompt_hint:'모바일 릴스용 세로형 영어학원 홍보 비주얼, 자연광, 전문적이고 현대적인 교육 공간'}
  );
  if(channels.includes('DAANGN'))needs.push({kind:'IMAGE',channel:'DAANGN',purpose:'동네 소식 대표 이미지',width:1080,height:1080,required:true,prompt_hint:`${target} 대상 동네 영어학원 모집용 정사각형 이미지. 친근하지만 광고 티가 과하지 않은 지역 커뮤니티 톤`});
  return needs;
}

export async function getAcademyProfile(env){
  await ensureAcademy(env);
  return await env.DB.prepare(`SELECT academy_name,neighborhood,consultation_cta,naver_blog_url,instagram_handle,daangn_profile,logo_asset_id,updated_at FROM academy_profile WHERE academy_id=?`).bind(academyId(env)).first()||{};
}
export async function saveAcademyProfile(env,request){
  const b=await bodyJson(request); await ensureAcademy(env);
  const data={academy_name:optionalString(b.academy_name,100),neighborhood:optionalString(b.neighborhood,120),consultation_cta:optionalString(b.consultation_cta,300),naver_blog_url:optionalString(b.naver_blog_url,500),instagram_handle:optionalString(b.instagram_handle,120),daangn_profile:optionalString(b.daangn_profile,300)};
  await env.DB.prepare(`INSERT INTO academy_profile (academy_id,academy_name,neighborhood,consultation_cta,naver_blog_url,instagram_handle,daangn_profile,updated_at) VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(academy_id) DO UPDATE SET academy_name=excluded.academy_name,neighborhood=excluded.neighborhood,consultation_cta=excluded.consultation_cta,naver_blog_url=excluded.naver_blog_url,instagram_handle=excluded.instagram_handle,daangn_profile=excluded.daangn_profile,updated_at=CURRENT_TIMESTAMP`).bind(academyId(env),data.academy_name,data.neighborhood,data.consultation_cta,data.naver_blog_url,data.instagram_handle,data.daangn_profile).run();
  return {...data,missing:profileMissing(data)};
}

export async function promoDashboard(env){
  const [profile,targets,perf]=await Promise.all([getAcademyProfile(env),recruitmentTargets(env),recruitmentPerformance(env)]);
  const mission=await env.DB.prepare(`SELECT id,goal_students,target_segment,channels_json,needs_json,mission_text,status,created_at FROM promo_missions WHERE academy_id=? ORDER BY created_at DESC LIMIT 1`).bind(academyId(env)).first();
  const {results:assets=[]}=await env.DB.prepare(`SELECT id,mission_id,kind,purpose,channel,object_key,mime_type,width,height,status,created_at FROM promo_assets WHERE academy_id=? AND status='READY' ORDER BY created_at DESC LIMIT 30`).bind(academyId(env)).all();
  const {results:posts=[]}=await env.DB.prepare(`SELECT id,mission_id,channel,format,title,status,scheduled_at,published_url,created_at FROM promo_posts WHERE academy_id=? ORDER BY created_at DESC LIMIT 30`).bind(academyId(env)).all();
  return {profile,missing_profile:profileMissing(profile),targets,source_funnel:perf.source_funnel||[],latest_mission:mission?{...mission,channels:safeJson(mission.channels_json,[]),needs:safeJson(mission.needs_json,[])}:null,assets,posts,channel_capabilities:{INSTAGRAM:{auto_publish:'CONNECTOR_REQUIRED'},NAVER_BLOG:{auto_publish:false,reason:'공식 블로그 글쓰기 API 종료로 게시 패키지 제공'},DAANGN:{auto_publish:false,reason:'공식 자동 게시 연결 전 승인형 게시 패키지 제공'}}};
}

export async function createPromoMission(env,payload){
  await ensureAcademy(env);
  const goal=Math.max(1,Math.min(50,Math.floor(numeric(payload.goal_students)??5)));
  const targets=await recruitmentTargets(env);
  const open=targets.filter(t=>Number(t.open_seats)>0).sort((a,b)=>Number(b.priority)-Number(a.priority)||Number(b.open_seats)-Number(a.open_seats));
  const target=optionalString(payload.target_segment,120)||open[0]?.segment||'신규 모집이 필요한 학년';
  const channels=normalizeChannels(payload.channels);
  const profile=await getAcademyProfile(env);
  const perf=await recruitmentPerformance(env);
  const needs=assetNeedsFor(channels,target);
  const missing=profileMissing(profile);
  const system=`당신은 한국 소규모 영어학원의 능동적인 AI 홍보·모집실장이다. 단순 광고문을 쓰는 사람이 아니라 빈자리와 과거 문의·상담·등록 흐름을 보고 이번 주 무엇을 만들어 어디에 내보내야 하는지 결정한다. 뮤엠영어·노피곰의 공식 교육내용을 임의로 지어내지 않는다. 성적보장·과장·불안조장·가짜 희소성을 금지한다. 조회수보다 상담과 등록을 우선한다. 원장에게 필요한 자료가 부족하면 정확히 요청한다. 네이버 블로그, 인스타그램, 당근은 같은 문구를 복붙하지 않고 각 채널의 역할을 구분한다.`;
  const user=`신규등록 목표 ${goal}명. 우선 모집대상 ${target}. 빈자리 ${JSON.stringify(open.slice(0,8))}. 기존 유입성과 ${JSON.stringify((perf.source_funnel||[]).slice(0,8))}. 채널 ${JSON.stringify(channels.map(c=>CHANNEL_LABEL[c]))}. 학원 프로필 ${JSON.stringify(profile)}. 부족한 정보 ${JSON.stringify(missing)}. 필요한 이미지 규격 ${JSON.stringify(needs)}. 다음 구조로 900~1300자 한국어 작전을 써라: [이번 주 목표] [왜 이 대상을 먼저 모집하는지] [이번 주 제작물] [채널별 실행] [원장님에게 필요한 자료] [오늘/3일/7일 후속] [상담·등록 KPI].`;
  const missionText=await runAI(env,system,user,1500);
  const id=uid('mission');
  await env.DB.prepare(`INSERT INTO promo_missions (id,academy_id,goal_students,target_segment,channels_json,needs_json,mission_text,status) VALUES (?,?,?,?,?,?,?,'DRAFT')`).bind(id,academyId(env),goal,target,JSON.stringify(channels),JSON.stringify(needs),missionText).run();
  return {id,goal_students:goal,target_segment:target,channels,needs,missing_profile:missing,mission_text:missionText,status:'DRAFT'};
}

function decodeBase64(base64){
  const clean=String(base64||'').replace(/^data:image\/\w+;base64,/, '');
  const binary=atob(clean); const out=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)out[i]=binary.charCodeAt(i);
  return out;
}
export async function generatePromoAsset(env,payload){
  if(!env.AI)throw new HttpError(503,'AI_NOT_BOUND');
  if(!env.PROMO_ASSETS)throw new HttpError(503,'PROMO_ASSETS_NOT_BOUND');
  const missionId=requiredString(payload.mission_id,'mission_id',140);
  const mission=await env.DB.prepare(`SELECT id,target_segment,mission_text FROM promo_missions WHERE id=? AND academy_id=?`).bind(missionId,academyId(env)).first();
  if(!mission)throw new HttpError(404,'PROMO_MISSION_NOT_FOUND');
  const purpose=requiredString(payload.purpose,'purpose',160), channel=optionalString(payload.channel,50)||'GENERAL';
  const width=Math.max(256,Math.min(1920,Math.floor(numeric(payload.width)??1080))),height=Math.max(256,Math.min(1920,Math.floor(numeric(payload.height)??1350)));
  const hint=optionalString(payload.prompt_hint,800)||`${mission.target_segment} 모집을 위한 영어학원 홍보 이미지`;
  const prompt=`Premium Korean neighborhood English academy promotional photography/illustration for parents. ${hint}. Clean modern learning environment, warm natural light, trustworthy and calm, realistic educational materials, no readable text, no logos, no identifiable child faces, no exaggerated luxury, generous composition space for later Korean typography. Target: ${mission.target_segment}.`;
  const form=new FormData(); form.append('prompt',prompt); form.append('width',String(width)); form.append('height',String(height));
  const serialized=new Response(form);
  const result=await env.AI.run(env.IMAGE_MODEL||IMAGE_MODEL_DEFAULT,{multipart:{body:serialized.body,contentType:serialized.headers.get('content-type')}});
  const image=result?.image||result?.result?.image;
  if(!image)throw new HttpError(502,'IMAGE_EMPTY_RESPONSE');
  const bytes=decodeBase64(image), id=uid('asset'), key=`promo/${academyId(env)}/${new Date().toISOString().slice(0,10)}/${id}.png`;
  await env.PROMO_ASSETS.put(key,bytes,{httpMetadata:{contentType:'image/png'},customMetadata:{academy_id:academyId(env),mission_id:missionId,purpose,channel}});
  await env.DB.prepare(`INSERT INTO promo_assets (id,academy_id,mission_id,kind,purpose,channel,prompt,object_key,mime_type,width,height,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,'READY')`).bind(id,academyId(env),missionId,'IMAGE',purpose,channel,prompt,key,'image/png',width,height).run();
  return {id,mission_id:missionId,purpose,channel,width,height,url:`/api/promo/assets/${encodeURIComponent(id)}`,status:'READY'};
}
export async function listPromoAssets(env){
  const {results=[]}=await env.DB.prepare(`SELECT id,mission_id,kind,purpose,channel,width,height,status,created_at FROM promo_assets WHERE academy_id=? AND status='READY' ORDER BY created_at DESC LIMIT 50`).bind(academyId(env)).all();
  return results.map(x=>({...x,url:`/api/promo/assets/${encodeURIComponent(x.id)}`}));
}
export async function promoAssetObject(env,id){
  if(!env.PROMO_ASSETS)throw new HttpError(503,'PROMO_ASSETS_NOT_BOUND');
  const row=await env.DB.prepare(`SELECT object_key,mime_type FROM promo_assets WHERE id=? AND academy_id=? AND status='READY'`).bind(id,academyId(env)).first();
  if(!row)throw new HttpError(404,'PROMO_ASSET_NOT_FOUND');
  const object=await env.PROMO_ASSETS.get(row.object_key);
  if(!object)throw new HttpError(404,'PROMO_ASSET_OBJECT_NOT_FOUND');
  return new Response(object.body,{headers:{'content-type':row.mime_type||'image/png','cache-control':'private, max-age=300','x-content-type-options':'nosniff'}});
}

function channelRules(channel){
  if(channel==='NAVER_BLOG')return `네이버 블로그용. 검색형 제목 3개 중 최종 1개를 맨 위에 쓰고, 본문은 1200~1800자. 첫 3문장 안에 학부모 고민을 제시하고 지역·학년·상담 의도를 자연스럽게 연결한다. 소제목 4~6개, 이미지 삽입 위치를 [이미지1] 형식으로 표시한다. 해시태그 8~12개. [연락처] 같은 미완성 플레이스홀더를 절대 쓰지 않는다.`;
  if(channel==='INSTAGRAM')return `인스타그램 피드/카드뉴스용. 첫 문장 훅은 짧게, 본문 500~900자. 카드 1~4 각각의 한 줄 문구를 별도로 제안하고, 마지막은 DM 또는 프로필 링크 상담 유도로 끝낸다. 해시태그 8~15개. 과한 이모지와 억지 감성문구를 피한다.`;
  return `당근 동네소식용. 광고 티가 과하지 않은 지역 원장 말투로 350~650자. 동네 학부모가 바로 이해할 수 있게 학년·빈자리·상담 포인트를 앞부분에 둔다. 허위 마감임박 표현을 쓰지 않는다.`;
}
export async function createPromoPost(env,payload){
  const missionId=requiredString(payload.mission_id,'mission_id',140), channel=requiredString(payload.channel,'channel',50).toUpperCase();
  if(!CHANNELS.includes(channel))throw new HttpError(400,'INVALID_PROMO_CHANNEL');
  const mission=await env.DB.prepare(`SELECT id,goal_students,target_segment,mission_text,needs_json FROM promo_missions WHERE id=? AND academy_id=?`).bind(missionId,academyId(env)).first();
  if(!mission)throw new HttpError(404,'PROMO_MISSION_NOT_FOUND');
  const profile=await getAcademyProfile(env), targets=await recruitmentTargets(env), assets=await listPromoAssets(env);
  const system=`당신은 실제 등록 전환을 만드는 영어학원 홍보실장이다. 원장에게 그대로 게시 가능한 완성 원고만 준다. 확인되지 않은 뮤엠영어·노피곰 기능이나 교육효과를 만들지 않는다. 성적보장, 경쟁학원 비방, 공포마케팅, 가짜 후기, 가짜 희소성은 금지한다. 연락처나 주소가 없으면 [연락처] 같은 플레이스홀더를 쓰지 말고 '상담을 원하시면 메시지로 아이 학년과 현재 영어 경험을 보내주세요'처럼 실제 사용할 수 있는 CTA로 마무리한다. ${channelRules(channel)}`;
  const user=`학원 프로필 ${JSON.stringify(profile)}. 모집작전 ${mission.mission_text}. 목표 ${mission.goal_students}명 / 대상 ${mission.target_segment}. 현재 자리 ${JSON.stringify(targets.slice(0,10))}. 사용 가능한 홍보 이미지 ${JSON.stringify(assets.filter(a=>a.mission_id===missionId).slice(0,12))}. 완성 원고를 작성하라.`;
  const body=await runAI(env,system,user,1900), id=uid('post'), format=channel==='INSTAGRAM'?'CAROUSEL':channel==='NAVER_BLOG'?'BLOG':'LOCAL_POST';
  const assetIds=assets.filter(a=>a.mission_id===missionId&&(!a.channel||a.channel===channel||a.channel==='GENERAL')).slice(0,6).map(a=>a.id);
  const title=`${mission.target_segment} · ${CHANNEL_LABEL[channel]}`;
  await env.DB.prepare(`INSERT INTO promo_posts (id,academy_id,mission_id,channel,format,title,body,asset_ids_json,status) VALUES (?,?,?,?,?,?,?,?,'READY')`).bind(id,academyId(env),missionId,channel,format,title,body,JSON.stringify(assetIds)).run();
  return {id,mission_id:missionId,channel,channel_label:CHANNEL_LABEL[channel],format,title,body,asset_ids:assetIds,status:'READY',publish_mode:channel==='INSTAGRAM'?'CONNECTOR_READY':'APPROVAL_PACKAGE'};
}
export async function listPromoPosts(env){
  const {results=[]}=await env.DB.prepare(`SELECT id,mission_id,channel,format,title,body,asset_ids_json,status,scheduled_at,published_url,created_at FROM promo_posts WHERE academy_id=? ORDER BY created_at DESC LIMIT 50`).bind(academyId(env)).all();
  return results.map(r=>({...r,asset_ids:safeJson(r.asset_ids_json,[])}));
}

export async function cleanupP3Fixtures(env){
  const academy=academyId(env);
  const {results:campaigns=[]}=await env.DB.prepare(`SELECT id FROM recruitment_campaigns WHERE academy_id=? AND (target_segment LIKE '배포 검증용%' OR target_segment LIKE 'P3 %')`).bind(academy).all();
  for(const c of campaigns)await env.DB.prepare(`DELETE FROM recruitment_campaigns WHERE id=? AND academy_id=?`).bind(c.id,academy).run();
  await env.DB.prepare(`DELETE FROM academy_targets WHERE academy_id=? AND (id LIKE 'e2e-%' OR segment LIKE '배포 검증용%' OR segment LIKE 'P3 %')`).bind(academy).run();
  await env.DB.prepare(`DELETE FROM students WHERE academy_id=? AND name LIKE 'P3 %'`).bind(academy).run();
  await env.DB.prepare(`DELETE FROM leads WHERE academy_id=? AND child_name LIKE 'P3 %'`).bind(academy).run();
  return {ok:true};
}
