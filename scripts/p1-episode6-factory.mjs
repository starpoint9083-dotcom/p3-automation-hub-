import fs from 'node:fs/promises';
import process from 'node:process';
import puppeteer from 'puppeteer-core';

const P1_BASE_URL=(process.env.P1_BASE_URL||'https://k-stella-shorts-factory.k-stella-p1.workers.dev').replace(/\/$/,'');
const CHROME_PATH=String(process.env.CHROME_PATH||'');
const TARGET_DURATION=Math.max(50,Math.min(70,Number(process.env.P1_TARGET_DURATION||60)));
const SUMMARY_PATH=process.env.P1_FACTORY_SUMMARY||'p1_factory_summary.json';
const OIDC_AUDIENCE='k-stella-p1-p3-bridge';
const API_TIMEOUT=8*60*1000;
const RENDER_TIMEOUT=15*60*1000;

if(!CHROME_PATH)throw new Error('CHROME_PATH is required.');
if(new URL(P1_BASE_URL).hostname!=='k-stella-shorts-factory.k-stella-p1.workers.dev')throw new Error('P1_BASE_URL host is not allowlisted.');

const episode={
  episode_no:6,
  content_group:'core',
  title:'6화 - 그 사람 만나러 가지 마… 친구가 숨긴 8개월의 비밀',
  hook:'그 사람 오늘 만나러 가지 마. 네 친구가 8개월 동안 숨긴 게 있어.',
  script:[
    '밤거리에서 여주가 휴대폰을 들고 불안한 눈빛으로 멈춰 선다. 그 사람 오늘 만나러 가지 마.',
    '카페 앞에서 여주의 여자 친구가 걱정스러운 표정으로 바라본다. 네 친구가 8개월 동안 숨긴 게 있어.',
    '여주는 남주에게 온 메시지를 보며 설레지만 망설인다. 너는 그 사람을 운명이라고 믿었지.',
    '친구의 회상 속에서 남주가 다른 여자와 가까이 웃는 모습을 멀리서 목격한다. 근데 네 친구는 먼저 봤어.',
    '친구는 행복해 보이는 여주 앞에서 진실을 말하려다 입을 다문다. 말하려고 했는데 못 했어. 네가 너무 행복해 보여서.',
    '오늘 보자는 남주의 메시지를 본 여주의 표정이 굳는다. 하지만 오늘은 달라. 오늘 만나면 네 마음이 더 깊어져.',
    '밤거리에서 여주가 발걸음을 멈추고 친구에게 전화할지 고민한다. 지금 필요한 건 설렘이 아니라 확인이야.',
    '여주와 친구가 서로 깊은 눈빛으로 마주 본다. 그 사람보다 먼저 네 친구에게 물어봐. 숨겨진 진실은 가장 가까운 사람부터 알아.',
    '어두운 배경 속 여주의 차분한 클로즈업. 고르는 사주가 아니라 질문하는 사주. 지금 가장 궁금한 한 가지를 직접 물어보세요. @kstellaway 프로필 링크'
  ].join('\n'),
  description:'운명이라고 믿은 사람. 그런데 가장 가까운 친구는 이미 진실을 알고 있었습니다. 고르는 사주가 아니라, 질문하는 사주. 지금 가장 궁금한 한 가지를 직접 물어보세요. @kstellaway 프로필 링크',
  hashtags:'#1분사주드라마 #사주드라마 #연애사주 #썸 #이별신호 #친구비밀 #여자심리 #연애심리 #쇼츠 #유튜브쇼츠 #K스텔라웨이',
  pinned_comment:'친구가 알고 있는데 말 못 한 진실, 말해주는 편이 맞을까요? 아니면 조용히 지켜보는 편이 맞을까요? 고르는 사주가 아니라, 질문하는 사주. 지금 가장 궁금한 한 가지는 프로필 링크에서 직접 물어보세요.',
  tracking_url:''
};

async function oidc(){
  const requestUrl=String(process.env.ACTIONS_ID_TOKEN_REQUEST_URL||'');
  const requestToken=String(process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN||'');
  if(!requestUrl||!requestToken)throw new Error('GitHub OIDC environment is unavailable.');
  const url=new URL(requestUrl);url.searchParams.set('audience',OIDC_AUDIENCE);
  const response=await fetch(url,{headers:{accept:'application/json',authorization:`Bearer ${requestToken}`},cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data?.value)throw new Error(`GitHub OIDC token request failed (${response.status}).`);
  return String(data.value);
}

const summary={
  ok:false,
  started_at:new Date().toISOString(),
  p1:P1_BASE_URL,
  auth:'github-actions-oidc-to-p1-session',
  target_duration:TARGET_DURATION,
  mode:'episode6-direct',
  episode_no:6,
  lineup_id:null,
  production_run_id:null,
  completed:0,
  failed:0,
  items:[],
  release:{ready:0,review:0,hold:0}
};
async function saveSummary(){summary.finished_at=new Date().toISOString();await fs.writeFile(SUMMARY_PATH,JSON.stringify(summary,null,2));}
async function deadline(promise,ms,label){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`${label} timed out after ${Math.round(ms/1000)}s`)),ms);})]);}finally{if(timer)clearTimeout(timer);}}

const token=await oidc();
const browser=await puppeteer.launch({executablePath:CHROME_PATH,protocolTimeout:20*60*1000,headless:true,args:['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--autoplay-policy=no-user-gesture-required','--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding','--window-size=720,1280']});

try{
  const page=await browser.newPage();
  await page.setViewport({width:720,height:1280,deviceScaleFactor:1});
  page.setDefaultTimeout(20*60*1000);
  page.on('console',msg=>{const t=msg.text();if(/render|quality|error|media|asset|music|scene/i.test(t))console.log(`[P1 browser] ${t.slice(0,1200)}`);});
  page.on('pageerror',err=>console.log(`[P1 pageerror] ${String(err?.message||err).slice(0,1500)}`));
  page.on('requestfailed',req=>console.log(`[P1 requestfailed] ${req.failure()?.errorText||'unknown'} ${req.url().slice(0,1200)}`));

  await page.goto(P1_BASE_URL,{waitUntil:'networkidle2',timeout:120000});
  await page.waitForFunction(()=>document.readyState==='complete'&&typeof window.fetch==='function');
  const session=await page.evaluate(async({token})=>{
    localStorage.removeItem('kstella_admin_password');
    const r=await fetch('/api/session',{method:'POST',headers:{accept:'application/json',authorization:`Bearer ${token}`},credentials:'same-origin',cache:'no-store'});
    const d=await r.json().catch(()=>({}));return{ok:r.ok,status:r.status,data:d};
  },{token});
  if(!session.ok||!session.data?.ok)throw new Error(`P1 OIDC session exchange failed (${session.status}): ${session.data?.error||'unknown'}`);
  const cookies=await page.cookies(P1_BASE_URL);const c=cookies.find(x=>x.name==='kstella_session');if(!c?.value)throw new Error('P1 session cookie missing.');
  const cookie=`kstella_session=${c.value}`;

  async function api(path,{method='GET',body,timeout=API_TIMEOUT}={}){
    const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),timeout);
    try{
      const headers={accept:'application/json',cookie};if(body!==undefined)headers['content-type']='application/json';
      const r=await fetch(new URL(path,`${P1_BASE_URL}/`),{method,headers,cache:'no-store',body:body===undefined?undefined:JSON.stringify(body),signal:ctrl.signal});
      const text=await r.text();let d;try{d=JSON.parse(text);}catch{d={raw:text.slice(0,1000)}}
      if(!r.ok)throw new Error(`${method} ${path} failed (${r.status}): ${d?.error||JSON.stringify(d)}`);return d;
    }finally{clearTimeout(timer);}
  }

  const health=await api('/api/health',{timeout:60000});
  if(!health?.ok||!health?.db||!health?.r2||!health?.ai)throw new Error(`P1 health failed: ${JSON.stringify(health)}`);
  console.log('P1 health PASS');

  const plan=await api('/api/plan',{method:'POST',body:episode});
  const projectId=String(plan?.project_id||'');if(!projectId)throw new Error('Episode 6 project id was not returned.');
  summary.project_id=projectId;
  console.log(`Episode 6 planned: ${projectId} scenes=${plan?.scenes?.length||0}`);
  await saveSummary();

  const queue=await api('/api/queue?status=waiting',{timeout:60000});
  let mine=(queue?.queue||[]).filter(x=>String(x.project_id)===projectId);
  if(!mine.length && (plan?.scenes||[]).some(x=>x.missing)){
    console.log('Episode 6 queue rows are outside the /api/queue 200-row window; resolving exact project queues from read-only export.');
    const backup=await api('/api/export',{timeout:4*60*1000});
    mine=(backup?.generation_queue||[]).filter(x=>String(x.project_id)===projectId&&String(x.status)==='waiting');
  }
  const expectedMissing=(plan?.scenes||[]).filter(x=>x.missing).length;
  if(mine.length!==expectedMissing)throw new Error(`Episode 6 queue resolution mismatch: expected=${expectedMissing} found=${mine.length}`);
  console.log(`Episode 6 missing scenes: ${mine.length}`);
  mine.sort((a,b)=>Number(a.scene_no||0)-Number(b.scene_no||0));
  for(let i=0;i<mine.length;i++){
    let last;
    for(let attempt=1;attempt<=3;attempt++){
      try{await api('/api/queue/generate',{method:'POST',body:{id:mine[i].id},timeout:4*60*1000});last=null;break;}catch(e){last=e;console.log(`scene ${mine[i].scene_no} attempt ${attempt} failed: ${e.message}`);if(attempt<3)await new Promise(r=>setTimeout(r,1000*attempt));}
    }
    if(last)throw last;
    console.log(`Episode 6 scene ${mine[i].scene_no} ready (${i+1}/${mine.length})`);
  }
  console.log('Episode 6 asset queue clear; /api/video-plan will perform authoritative asset readiness validation.');

  await page.waitForFunction(()=>typeof renderOnDevice==='function'&&!!document.querySelector('#renderCanvas'),{timeout:120000});
  const timeline=await api('/api/video-plan',{method:'POST',body:{project_id:projectId,target_duration:TARGET_DURATION},timeout:2*60*1000});
  if(!timeline?.manifest?.shots?.length)throw new Error('Episode 6 video manifest is empty.');
  console.log(`Episode 6 timeline ready: duration=${timeline.manifest.actual_duration} shots=${timeline.manifest.shots.length}`);

  const video=await deadline(page.evaluate(async({manifest,projectId,target})=>{
    const d=document.querySelector('#videoDuration');if(d)d.value=String(target);
    return await renderOnDevice(manifest,projectId);
  },{manifest:timeline.manifest,projectId,target:TARGET_DURATION}),RENDER_TIMEOUT,'Episode 6 browser render');
  if(!video?.id)throw new Error(`Episode 6 render did not return video id: ${JSON.stringify(video)}`);
  console.log(`Episode 6 render PASS: video=${video.id}`);

  const qualityResponse=await api('/api/quality/check',{method:'POST',body:{project_id:projectId,rendered_video_id:video.id},timeout:2*60*1000});
  const quality=qualityResponse?.quality||{};
  const releaseResponse=await api('/api/release/check',{method:'POST',body:{project_id:projectId},timeout:2*60*1000});
  const decision=releaseResponse?.decision||{};
  const releaseStatus=String(decision?.status||'review').toLowerCase();
  summary.release={ready:releaseStatus==='ready'?1:0,review:releaseStatus==='ready'||releaseStatus==='hold'?0:1,hold:releaseStatus==='hold'?1:0,status:releaseStatus,score:decision?.score??null,reasons:decision?.reasons||[]};
  const itemOk=String(quality?.status||'').toLowerCase()!=='fail'&&releaseStatus!=='hold';
  summary.items=[{slot_no:6,episode_no:6,project_id:projectId,ok:itemOk,video_id:video.id,quality_status:quality?.status||null,quality_score:quality?.score??null,title:episode.title}];
  summary.completed=itemOk?1:0;summary.failed=itemOk?0:1;summary.ok=itemOk;
  await saveSummary();
  console.log(`Episode 6 QC: status=${quality?.status} score=${quality?.score} release=${releaseStatus}`);
  if(!itemOk)throw new Error(`Episode 6 blocked by quality/release gate: quality=${quality?.status} release=${releaseStatus}`);
} catch(error){
  summary.ok=false;summary.failed=Math.max(1,Number(summary.failed||0));summary.error=error?.message||String(error);await saveSummary();throw error;
} finally{await browser.close();}
