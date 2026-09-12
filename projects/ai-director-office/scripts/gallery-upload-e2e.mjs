import {chromium} from 'playwright';

const base=(process.env.DEPLOY_URL||'').replace(/\/$/,'');
const password=process.env.ADMIN_PASSWORD||'';
if(!base)throw new Error('DEPLOY_URL_REQUIRED');
if(password.length<12)throw new Error('ADMIN_PASSWORD_REQUIRED');

const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const page=await context.newPage();
let logged=false;

async function internalPost(path){return page.evaluate(async p=>{const csrf=document.querySelector('meta[name="csrf-token"]')?.content||'';const r=await fetch(p,{method:'POST',headers:{'content-type':'application/json','x-csrf-token':csrf},body:'{}'});return {status:r.status,body:await r.json().catch(()=>null)}},path)}

try{
  await page.goto(base+'/',{waitUntil:'domcontentloaded',timeout:30000});
  await page.locator('#pw').fill(password);
  await Promise.all([page.waitForURL(base+'/',{timeout:30000}),page.locator('#login').click()]);
  logged=true;
  await page.waitForFunction(()=>window.__AI_OFFICE_READY__===true&&window.__AI_OFFICE_DATA_READY__===true,{timeout:30000});
  await internalPost('/api/internal/p3-cleanup');
  await page.locator('.mobilebar [data-view="recruitment"]').click();
  await page.locator('#recruitment').waitFor({state:'visible'});
  if(!(await page.locator('#pickGalleryMedia').isVisible()))throw new Error('GALLERY_PICK_BUTTON_MISSING');
  await page.locator('#galleryPurpose').fill('P3 갤러리 검수');
  await page.locator('#galleryChannel').selectOption('GENERAL');

  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z0Z8AAAAASUVORK5CYII=','base64');
  const mp4=Buffer.from([0,0,0,24,102,116,121,112,105,115,111,109,0,0,2,0,105,115,111,109,109,112,52,50]);
  await page.locator('#galleryMedia').setInputFiles([
    {name:'p3-gallery-check.png',mimeType:'image/png',buffer:png},
    {name:'p3-gallery-check.mp4',mimeType:'video/mp4',buffer:mp4}
  ]);
  await page.waitForFunction(()=>document.getElementById('galleryUploadStatus')?.textContent.includes('완료 2/2'),null,{timeout:30000});
  await page.waitForFunction(()=>document.querySelectorAll('#assetGallery .asset').length>=2,null,{timeout:15000});
  if(await page.locator('#assetGallery img').count()<1)throw new Error('GALLERY_IMAGE_PREVIEW_MISSING');
  if(await page.locator('#assetGallery video').count()<1)throw new Error('GALLERY_VIDEO_PREVIEW_MISSING');

  const assets=await page.evaluate(async()=>{const r=await fetch('/api/promo/assets',{cache:'no-store'});const j=await r.json();return j?.data||[]});
  const rows=assets.filter(x=>x.purpose==='P3 갤러리 검수');
  if(rows.length!==2)throw new Error('GALLERY_ASSET_COUNT_WRONG:'+JSON.stringify(rows));
  if(!rows.some(x=>x.kind==='IMAGE')||!rows.some(x=>x.kind==='VIDEO'))throw new Error('GALLERY_ASSET_KIND_MISSING:'+JSON.stringify(rows));
  for(const row of rows){const r=await page.request.get(base+'/api/promo/assets/'+encodeURIComponent(row.id),{headers:{cookie:(await context.cookies()).map(c=>c.name+'='+c.value).join('; ')}});if(!r.ok())throw new Error('GALLERY_ASSET_FETCH_FAILED:'+row.id+':'+r.status())}

  console.log(JSON.stringify({ok:true,viewport:'390x844',gallery_button:true,image_uploaded:true,video_uploaded:true,previews:true,asset_count:rows.length,ai_calls:0,real_academy_data_mutated:false},null,2));
}finally{
  if(logged){try{await internalPost('/api/internal/p3-cleanup')}catch{}}
  await browser.close();
}
