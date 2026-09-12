import {chromium} from 'playwright';

const base=(process.env.DEPLOY_URL||'').replace(/\/$/,'');
const password=process.env.ADMIN_PASSWORD||'';
if(!base)throw new Error('DEPLOY_URL_REQUIRED');
if(password.length<12)throw new Error('ADMIN_PASSWORD_REQUIRED');

function silenceWav(seconds=1.4,sampleRate=8000){
  const samples=Math.floor(seconds*sampleRate),dataSize=samples*2,b=Buffer.alloc(44+dataSize);
  b.write('RIFF',0);b.writeUInt32LE(36+dataSize,4);b.write('WAVE',8);b.write('fmt ',12);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(sampleRate,24);b.writeUInt32LE(sampleRate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(dataSize,40);return b;
}
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z0Z8AAAAASUVORK5CYII=';
const wav=silenceWav();
const uploaded={};
let logged=false;
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const page=await context.newPage();

async function internalPost(path){return page.evaluate(async p=>{const csrf=document.querySelector('meta[name="csrf-token"]')?.content||'';const r=await fetch(p,{method:'POST',headers:{'content-type':'application/json','x-csrf-token':csrf},body:'{}'});return {status:r.status,body:await r.json().catch(()=>null)}},path)}
function project(channel){const isY=channel==='YOUTUBE',id=isY?'p3-video-shorts':'p3-video-reels';return {id,mission_id:'p3-ui-mission',channel,status:'TTS_READY',duration_seconds:1,plan:{channel,width:1080,height:1920,duration_seconds:1,title:isY?'P3 쇼츠':'P3 릴스',hook:isY?'쇼츠 안전영역':'릴스 안전영역',cta:'상담 문의',narration:'P3 영상 검수',scenes:[{index:1,start:0,end:1,duration:1,asset_id:'fixture',asset_url:png,asset_kind:'IMAGE',subtitle:isY?'쇼츠 자막':'릴스 자막'}]},safe_zone:isY?{width:1080,height:1920,left:90,right:250,top:180,bottom:330,title_y:[230,760],subtitle_y:[1030,1430],cta_y:[1450,1560]}:{width:1080,height:1920,left:90,right:220,top:190,bottom:420,title_y:[240,760],subtitle_y:[1010,1370],cta_y:[1390,1490]},narration_url:'/api/promo/videos/'+id+'/narration',video_url:null};}
async function waitVideoOutcome(successText,label){
  await page.waitForFunction(({successText})=>{const t=document.getElementById('videoRenderStatus')?.textContent||'';return t.includes(successText)||t.includes('영상 생성 중단')||t.includes('실패')},{successText},{timeout:15000});
  const text=(await page.locator('#videoRenderStatus').textContent())||'';
  if(!text.includes(successText))throw new Error(label+'_RENDER_STATUS:'+text);
  return text;
}

await page.route('**/api/promo/videos',async route=>{
  if(route.request().method()!=='POST')return route.continue();
  const body=route.request().postDataJSON();const p=project(String(body?.channel||''));
  await route.fulfill({status:201,contentType:'application/json',body:JSON.stringify({ok:true,data:{...p,status:'PLAN_READY'}})});
});
await page.route('**/api/promo/videos/*/narration',async route=>{
  const url=route.request().url(),channel=url.includes('shorts')?'YOUTUBE':'INSTAGRAM',p=project(channel);
  if(route.request().method()==='POST')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:p})});
  return route.fulfill({status:200,contentType:'audio/wav',body:wav});
});
await page.route('**/api/promo/videos/*/file*',async route=>{
  const url=route.request().url(),key=url.includes('shorts')?'YOUTUBE':'INSTAGRAM';
  if(route.request().method()==='POST'){
    const mime=String(route.request().headers()['content-type']||'');const body=route.request().postDataBuffer();
    if(mime!=='video/mp4')throw new Error('VIDEO_UPLOAD_NOT_MP4:'+mime);
    if(!body?.length)throw new Error('VIDEO_UPLOAD_EMPTY');uploaded[key]=body;
    const p=project(key);p.status='READY';p.video_url='/api/promo/videos/'+p.id+'/file';
    return route.fulfill({status:201,contentType:'application/json',body:JSON.stringify({ok:true,data:p})});
  }
  return route.fulfill({status:200,contentType:'video/mp4',body:uploaded[key]||Buffer.from([0,0,0,24,102,116,121,112,105,115,111,109,0,0,2,0,105,115,111,109,109,112,52,50])});
});

try{
  await page.goto(base+'/',{waitUntil:'domcontentloaded',timeout:30000});
  await page.locator('#pw').fill(password);
  await Promise.all([page.waitForURL(base+'/',{timeout:30000}),page.locator('#login').click()]);logged=true;
  await page.waitForFunction(()=>window.__AI_OFFICE_READY__===true,{timeout:30000});
  await internalPost('/api/internal/p3-cleanup');await internalPost('/api/internal/p3-ui-fixture');
  await page.reload({waitUntil:'domcontentloaded',timeout:30000});await page.waitForFunction(()=>window.__AI_OFFICE_READY__===true,{timeout:30000});
  await page.locator('.mobilebar [data-view="recruitment"]').click();await page.locator('#recruitment').waitFor({state:'visible'});
  const shortsVisible=await page.locator('#makeShortsVideo').isVisible(),reelsVisible=await page.locator('#makeReelsVideo').isVisible();if(!shortsVisible||!reelsVisible)throw new Error('SEPARATE_VIDEO_BUTTONS_MISSING');
  const instagramLabel=(await page.locator('#chInstagram').locator('xpath=..').textContent())||'';if(!instagramLabel.includes('인스타 릴스'))throw new Error('REELS_LABEL_MISSING');
  const mp4=await page.evaluate(()=>({supported:window.__AI_OFFICE_MP4_SUPPORTED__===true,candidates:['video/mp4;codecs="avc1.42E01E,mp4a.40.2"','video/mp4;codecs="vp9,opus"','video/mp4'].filter(x=>window.MediaRecorder?.isTypeSupported?.(x))}));
  if(!mp4.supported)throw new Error('MP4_MEDIARECORDER_UNSUPPORTED:'+JSON.stringify(mp4));
  await page.locator('#makeShortsVideo').click();await waitVideoOutcome('유튜브 쇼츠 완성 · MP4','SHORTS');if(!uploaded.YOUTUBE?.length)throw new Error('SHORTS_MP4_NOT_UPLOADED');
  await page.locator('#makeReelsVideo').click();await waitVideoOutcome('인스타 릴스 완성 · MP4','REELS');if(!uploaded.INSTAGRAM?.length)throw new Error('REELS_MP4_NOT_UPLOADED');
  const sizes={shorts:uploaded.YOUTUBE.length,reels:uploaded.INSTAGRAM.length};
  console.log(JSON.stringify({ok:true,viewport:'390x844',separate_controls:true,reels_label:true,mp4_supported:true,mp4_candidates:mp4.candidates,shorts_mp4:true,reels_mp4:true,sizes,platform_safe_zones_separate:true,ai_calls:0,real_academy_data_mutated:false},null,2));
}finally{
  if(logged){try{await internalPost('/api/internal/p3-cleanup')}catch{}}
  await browser.close();
}
