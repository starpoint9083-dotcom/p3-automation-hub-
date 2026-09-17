import {academyId,bodyJson,HttpError,numeric,optionalString,requiredString,uid} from './lib.js';
import {ensureAcademy,recruitmentPerformance,recruitmentTargets,runAI} from './services.js';
import {listPromoAssets,promoAssetObject,listPromoPosts,promoDashboard as basePromoDashboard} from './promo.js';

export {listPromoAssets,promoAssetObject,listPromoPosts};

const CHANNELS=['YOUTUBE','NAVER_BLOG','INSTAGRAM','DAANGN'];
const CHANNEL_LABEL={YOUTUBE:'유튜브 쇼츠',NAVER_BLOG:'네이버 블로그',INSTAGRAM:'인스타 릴스',DAANGN:'당근'};
export const VIDEO_SAFE_ZONES={
  YOUTUBE:{width:1080,height:1920,label:'유튜브 쇼츠 안전영역',left:90,right:250,top:180,bottom:330,title_y:[230,760],subtitle_y:[1030,1430],cta_y:[1450,1560]},
  INSTAGRAM:{width:1080,height:1920,label:'인스타 릴스 안전영역',left:90,right:220,top:190,bottom:420,title_y:[240,760],subtitle_y:[1010,1370],cta_y:[1390,1490]}
};
const EMPTY_PROFILE={academy_name:'',neighborhood:'',consultation_cta:'',youtube_channel_url:'',naver_blog_url:'',instagram_handle:'',daangn_profile:'',logo_asset_id:null,updated_at:null};
function normalizeChannels(value){
  const raw=Array.isArray(value)?value:[];
  const mapped=raw.map(v=>String(v).trim().toUpperCase().replace(/\s+/g,'_')).map(v=>{
    if(['YT','YOUTUBE_SHORTS','SHORTS'].includes(v))return 'YOUTUBE';
    if(['NAVER','BLOG','NAVERBLOG'].includes(v))return 'NAVER_BLOG';
    if(['INSTA','INSTAGRAM_REELS','REELS'].includes(v))return 'INSTAGRAM';
    if(['KARROT'].includes(v))return 'DAANGN';
    return v;
  }).filter(v=>CHANNELS.includes(v));
  return [...new Set(mapped.length?mapped:CHANNELS)];
}
function profileMissing(profile){
  const out=[];
  if(!profile?.academy_name)out.push('학원명');
  if(!profile?.neighborhood)out.push('동네/상권');
  if(!profile?.consultation_cta)out.push('상담 연결 방법(전화·톡톡·DM 등)');
  if(!profile?.youtube_channel_url)out.push('유튜브 채널 주소');
  if(!profile?.instagram_handle)out.push('인스타그램 계정');
  if(!profile?.naver_blog_url)out.push('네이버 블로그 주소');
  return out;
}
function assetNeedsFor(channels,target){
  const needs=[];
  if(channels.includes('YOUTUBE'))needs.push(
    {kind:'IMAGE',channel:'YOUTUBE',purpose:'쇼츠 커버',width:1080,height:1920,required:true,prompt_hint:`${target} 학부모 대상 영어학원 유튜브 쇼츠 세로 커버. 중앙 핵심 피사체, 오른쪽 액션버튼과 하단 설명 UI를 피하고 중앙 안전영역에 제목 여백`},
    {kind:'IMAGE',channel:'YOUTUBE',purpose:'쇼츠 장면 1',width:1080,height:1920,required:true,prompt_hint:'영어 교재와 노트가 있는 실제감 있는 학습 장면. 학생 얼굴 식별 없이 자연스러운 세로 구도. 좌우·상하 안전 여백 확보'},
    {kind:'IMAGE',channel:'YOUTUBE',purpose:'쇼츠 장면 2',width:1080,height:1920,required:false,prompt_hint:'학부모 상담과 아이 학습 성장을 연상시키는 밝고 전문적인 영어학원 세로 비주얼. 자막 안전영역 확보'}
  );
  if(channels.includes('NAVER_BLOG'))needs.push(
    {kind:'IMAGE',channel:'NAVER_BLOG',purpose:'대표 썸네일',width:1200,height:675,required:true,prompt_hint:`${target} 학부모가 신뢰감을 느낄 밝고 정돈된 영어학원 홍보 이미지`},
    {kind:'IMAGE',channel:'NAVER_BLOG',purpose:'본문 학습 장면',width:1200,height:800,required:true,prompt_hint:'교재와 노트, 연필이 놓인 깨끗한 영어 학습 공간. 학생 얼굴 식별 없이 자연스러운 수업 분위기'}
  );
  if(channels.includes('INSTAGRAM'))needs.push(
    {kind:'IMAGE',channel:'INSTAGRAM',purpose:'릴스 세로 커버',width:1080,height:1920,required:true,prompt_hint:`${target} 학부모 대상 인스타 릴스 9:16 세로 커버. 상단 계정 UI, 오른쪽 액션버튼, 하단 캡션·음원 UI를 피하고 중앙 안전영역에 제목 여백`},
    {kind:'IMAGE',channel:'INSTAGRAM',purpose:'릴스 장면 1',width:1080,height:1920,required:true,prompt_hint:'실제 영어학원 수업 분위기의 자연스러운 세로 장면. 학생 얼굴 식별 없이 중앙 피사체, 릴스 자막 안전영역 확보'}
  );
  if(channels.includes('DAANGN'))needs.push({kind:'IMAGE',channel:'DAANGN',purpose:'동네 소식 대표 이미지',width:1080,height:1080,required:true,prompt_hint:`${target} 대상 동네 영어학원 모집용 정사각형 이미지. 친근하지만 광고 티가 과하지 않은 지역 커뮤니티 톤`});
  return needs;
}

export async function getAcademyProfile(env){
  await ensureAcademy(env);
  const row=await env.DB.prepare(`SELECT academy_name,neighborhood,consultation_cta,youtube_channel_url,naver_blog_url,instagram_handle,daangn_profile,logo_asset_id,updated_at FROM academy_profile WHERE academy_id=?`).bind(academyId(env)).first();
  return {...EMPTY_PROFILE,...(row||{})};
}
export async function saveAcademyProfile(env,request){
  const b=await bodyJson(request);await ensureAcademy(env);
  const data={academy_name:optionalString(b.academy_name,100),neighborhood:optionalString(b.neighborhood,120),consultation_cta:optionalString(b.consultation_cta,300),youtube_channel_url:optionalString(b.youtube_channel_url,500),naver_blog_url:optionalString(b.naver_blog_url,500),instagram_handle:optionalString(b.instagram_handle,120),daangn_profile:optionalString(b.daangn_profile,300)};
  await env.DB.prepare(`INSERT INTO academy_profile (academy_id,academy_name,neighborhood,consultation_cta,youtube_channel_url,naver_blog_url,instagram_handle,daangn_profile,updated_at) VALUES (?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(academy_id) DO UPDATE SET academy_name=excluded.academy_name,neighborhood=excluded.neighborhood,consultation_cta=excluded.consultation_cta,youtube_channel_url=excluded.youtube_channel_url,naver_blog_url=excluded.naver_blog_url,instagram_handle=excluded.instagram_handle,daangn_profile=excluded.daangn_profile,updated_at=CURRENT_TIMESTAMP`).bind(academyId(env),data.academy_name,data.neighborhood,data.consultation_cta,data.youtube_channel_url,data.naver_blog_url,data.instagram_handle,data.daangn_profile).run();
  return {...EMPTY_PROFILE,...data,missing:profileMissing(data)};
}

export async function promoDashboard(env){
  const [base,profile]=await Promise.all([basePromoDashboard(env),getAcademyProfile(env)]);
  return {...base,profile,missing_profile:profileMissing(profile),engine:{name:'AI 원장실 내장형 P1 콘텐츠 엔진',version:'0.6.1',asset_reuse:true,resumable_queue:true,image_timeout_seconds:180,video_safe_zones:VIDEO_SAFE_ZONES},channel_capabilities:{YOUTUBE:{label:'유튜브 쇼츠',content_package:true,video_render:true,safe_zone:VIDEO_SAFE_ZONES.YOUTUBE,auto_publish:'OAUTH_CONNECTOR_REQUIRED'},INSTAGRAM:{label:'인스타 릴스',content_package:true,video_render:true,safe_zone:VIDEO_SAFE_ZONES.INSTAGRAM,auto_publish:'CONNECTOR_REQUIRED'},NAVER_BLOG:{content_package:true,auto_publish:false,reason:'공식 블로그 글쓰기 API 종료로 승인형 게시 패키지 제공'},DAANGN:{content_package:true,auto_publish:false,reason:'공식 자동 게시 연결 전 승인형 게시 패키지 제공'}}};
}

export async function createPromoMission(env,payload){
  await ensureAcademy(env);
  const goal=Math.max(1,Math.min(50,Math.floor(numeric(payload.goal_students)??5)));
  const targets=await recruitmentTargets(env);
  const open=targets.filter(t=>Number(t.open_seats)>0).sort((a,b)=>Number(b.priority)-Number(a.priority)||Number(b.open_seats)-Number(a.open_seats));
  const target=optionalString(payload.target_segment,120)||open[0]?.segment||'신규 모집이 필요한 학년';
  const channels=normalizeChannels(payload.channels);
  const profile=await getAcademyProfile(env),perf=await recruitmentPerformance(env),needs=assetNeedsFor(channels,target),missing=profileMissing(profile);
  const system=`당신은 한국 소규모 영어학원의 능동적인 AI 모집·홍보실장이다. 빈자리, 문의, 상담, 등록성과를 보고 이번 주 필요한 홍보물을 먼저 결정하고 제작엔진에 작업을 지시한다. 뮤엠영어·노피곰의 공식 교육내용을 임의로 지어내지 않는다. 성적보장·과장·불안조장·가짜 후기·가짜 희소성을 금지한다. 조회수보다 상담과 신규등록을 우선한다. 유튜브 쇼츠와 인스타 릴스는 서로 다른 영상 채널로 따로 편성하고, 네이버 블로그와 당근도 같은 문구를 복붙하지 않는다. 부족한 학원 자료가 있으면 원장에게 구체적으로 요청한다.`;
  const user=`신규등록 목표 ${goal}명. 우선 모집대상 ${target}. 빈자리 ${JSON.stringify(open.slice(0,8))}. 기존 유입성과 ${JSON.stringify((perf.source_funnel||[]).slice(0,8))}. 사용 채널 ${JSON.stringify(channels.map(c=>CHANNEL_LABEL[c]))}. 학원 프로필 ${JSON.stringify(profile)}. 부족한 정보 ${JSON.stringify(missing)}. 필요한 자산 ${JSON.stringify(needs)}. 다음 구조로 실행 가능한 한국어 작전을 작성하라: [이번 주 목표] [우선 대상 선정 이유] [이번 주 편성표-유튜브 쇼츠/인스타 릴스/네이버 블로그/당근 각각 몇 개] [오늘 만들 것] [필요 이미지·영상·자료] [원장님에게 필요한 자료] [게시 순서] [1일/3일/7일 후속] [문의→상담→등록 KPI]. 쇼츠와 릴스는 한 항목으로 묶지 말고 반드시 따로 적는다.`;
  const missionText=await runAI(env,system,user,1700),id=uid('mission');
  await env.DB.prepare(`INSERT INTO promo_missions (id,academy_id,goal_students,target_segment,channels_json,needs_json,mission_text,status) VALUES (?,?,?,?,?,?,?,'DRAFT')`).bind(id,academyId(env),goal,target,JSON.stringify(channels),JSON.stringify(needs),missionText).run();
  return {id,goal_students:goal,target_segment:target,channels,needs,missing_profile:missing,mission_text:missionText,status:'DRAFT'};
}

function channelRules(channel){
  if(channel==='YOUTUBE')return `유튜브 쇼츠 전용 완성 제작패키지. 인스타 릴스와 섞지 않는다. ① 제목 후보 5개 ② 첫 1~2초 훅 3개 ③ 45~60초 타임코드 대본 ④ 6~10개 장면표(초 단위, 화면, TTS 내레이션, 자막) ⑤ 썸네일 문구 3개 ⑥ 설명문 ⑦ 해시태그 8~12개 ⑧ 상담 CTA ⑨ 촬영 또는 AI로 추가 제작해야 할 장면 목록. 모든 제목·자막·CTA는 1080×1920 쇼츠 안전영역 ${JSON.stringify(VIDEO_SAFE_ZONES.YOUTUBE)} 안에만 배치하도록 장면표에 표기한다. 오른쪽 액션버튼과 하단 설명 UI에 글자가 겹치지 않게 한다. 첫 3초 안에 학부모 고민을 명확히 잡고 과장된 성적 약속을 하지 않는다.`;
  if(channel==='NAVER_BLOG')return `네이버 블로그 완성 게시패키지. 검색형 제목 후보 3개와 최종 제목 1개, 1400~2200자 본문, 첫 3문장 안에 학부모 고민, 소제목 4~6개, [이미지1] 형태 이미지 위치, 상담 CTA, 검색 키워드와 태그를 제공한다. 지역·학년 키워드를 자연스럽게 쓰고 [연락처] 같은 미완성 플레이스홀더를 쓰지 않는다.`;
  if(channel==='INSTAGRAM')return `인스타 릴스 전용 완성 제작패키지. 유튜브 쇼츠나 피드/카드뉴스와 섞지 않는다. ① 릴스 제목/커버 문구 3개 ② 첫 1~2초 훅 3개 ③ 30~45초 타임코드 대본 ④ 5~8개 장면표(초 단위, 화면, TTS 내레이션, 자막) ⑤ 캡션 500~900자 ⑥ DM/프로필 상담 CTA ⑦ 해시태그 8~15개 ⑧ 촬영 또는 AI로 추가 제작해야 할 장면 목록. 모든 제목·자막·CTA는 1080×1920 릴스 안전영역 ${JSON.stringify(VIDEO_SAFE_ZONES.INSTAGRAM)} 안에만 배치하도록 장면표에 표기한다. 상단 계정 UI, 오른쪽 액션버튼, 하단 캡션·음원 UI에 글자가 겹치지 않게 한다. 억지 감성문구와 과한 이모지를 피한다.`;
  return `당근 동네소식 완성패키지. 지역 원장 말투로 350~650자. 학년·빈자리·상담 포인트를 앞부분에 두고 대표 이미지 문구 2개와 상담 CTA를 제공한다. 허위 마감임박·가짜 희소성을 쓰지 않는다.`;
}
export async function createPromoPost(env,payload){
  const missionId=requiredString(payload.mission_id,'mission_id',140),channel=requiredString(payload.channel,'channel',50).toUpperCase();
  if(!CHANNELS.includes(channel))throw new HttpError(400,'INVALID_PROMO_CHANNEL');
  const mission=await env.DB.prepare(`SELECT id,goal_students,target_segment,mission_text,needs_json FROM promo_missions WHERE id=? AND academy_id=?`).bind(missionId,academyId(env)).first();
  if(!mission)throw new HttpError(404,'PROMO_MISSION_NOT_FOUND');
  const profile=await getAcademyProfile(env),targets=await recruitmentTargets(env),assets=await listPromoAssets(env);
  const system=`당신은 실제 등록 전환을 만드는 영어학원 AI 모집·홍보실장이다. 원장이 거의 수정 없이 사용할 수 있는 완성 결과물만 준다. 확인되지 않은 뮤엠영어·노피곰 기능이나 교육효과를 만들지 않는다. 성적보장, 경쟁학원 비방, 공포마케팅, 가짜 후기, 가짜 희소성은 금지한다. 연락처나 주소가 없으면 임시 플레이스홀더를 쓰지 말고 메시지 상담 CTA로 자연스럽게 마무리한다. ${channelRules(channel)}`;
  const user=`학원 프로필 ${JSON.stringify(profile)}. 모집작전 ${mission.mission_text}. 목표 ${mission.goal_students}명 / 대상 ${mission.target_segment}. 현재 자리 ${JSON.stringify(targets.slice(0,10))}. 사용 가능한 홍보 자산 ${JSON.stringify(assets.filter(a=>a.mission_id===missionId).slice(0,12))}. ${CHANNEL_LABEL[channel]}에 바로 사용할 완성 패키지를 작성하라.`;
  const body=await runAI(env,system,user,channel==='YOUTUBE'?2400:channel==='INSTAGRAM'?2300:2100),id=uid('post');
  const format=channel==='YOUTUBE'?'SHORTS_PACKAGE':channel==='INSTAGRAM'?'REELS_PACKAGE':channel==='NAVER_BLOG'?'BLOG':'LOCAL_POST';
  const assetIds=assets.filter(a=>a.mission_id===missionId&&(!a.channel||a.channel===channel||a.channel==='GENERAL')).slice(0,8).map(a=>a.id);
  const title=`${mission.target_segment} · ${CHANNEL_LABEL[channel]}`;
  await env.DB.prepare(`INSERT INTO promo_posts (id,academy_id,mission_id,channel,format,title,body,asset_ids_json,status) VALUES (?,?,?,?,?,?,?,?,'READY')`).bind(id,academyId(env),missionId,channel,format,title,body,JSON.stringify(assetIds)).run();
  return {id,mission_id:missionId,channel,channel_label:CHANNEL_LABEL[channel],format,title,body,asset_ids:assetIds,status:'READY',safe_zone:VIDEO_SAFE_ZONES[channel]||null,publish_mode:['YOUTUBE','INSTAGRAM'].includes(channel)?'CONNECTOR_READY':'APPROVAL_PACKAGE'};
}
