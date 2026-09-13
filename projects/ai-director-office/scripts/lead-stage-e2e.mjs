import {chromium} from 'playwright';

const base=(process.env.DEPLOY_URL||'').replace(/\/$/,'');
const password=process.env.ADMIN_PASSWORD||'';
if(!base)throw new Error('DEPLOY_URL_REQUIRED');
if(password.length<12)throw new Error('ADMIN_PASSWORD_REQUIRED');

const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const page=await context.newPage();
let logged=false;

async function internalPost(path){
  return page.evaluate(async p=>{
    const csrf=document.querySelector('meta[name="csrf-token"]')?.content||'';
    const r=await fetch(p,{method:'POST',headers:{'content-type':'application/json','x-csrf-token':csrf},body:'{}'});
    return {status:r.status,body:await r.json().catch(()=>null)};
  },path);
}

async function createLead(name,grade='초5'){
  const form=page.locator('#leadCreate');
  if(!(await form.isVisible()))await page.locator('[data-toggle="leadCreate"]').click();
  await form.waitFor({state:'visible'});
  await page.locator('#lName').fill(name);
  await page.locator('#lGrade').fill(grade);
  await page.locator('#lGoal').fill('상담 단계 검수');
  await page.locator('#lSource').fill('P3 모바일 검수');
  await page.locator('#createLead').click();
  await page.waitForFunction(n=>document.getElementById('leadList')?.textContent.includes(n),name,{timeout:10000});
  return page.locator('#leadList .row').filter({hasText:name}).first();
}

async function clickStage(row,status,expected){
  const b=row.locator(`[data-lead-stage="${status}"]`);
  const id=await b.getAttribute('data-lead-id');
  if(!id)throw new Error('LEAD_ID_MISSING:'+status);
  const leadName=(await row.locator('b').innerText()).split(' · ')[0];
  await b.click();
  if(status==='ENROLLED'||status==='LOST'){
    await page.waitForFunction(n=>!document.getElementById('leadList')?.textContent.includes(n),leadName,{timeout:10000});
  }else{
    await page.waitForFunction(([leadId,text])=>{const r=document.querySelector(`[data-lead-row="${leadId}"]`);return r?.textContent.includes(text)},[id,expected],{timeout:10000});
  }
  const saved=await page.evaluate(async leadId=>{const r=await fetch('/api/leads',{cache:'no-store'});const j=await r.json();return (j?.data||[]).find(x=>x.id===leadId)||null},id);
  if(saved?.status!==status)throw new Error('LEAD_STAGE_NOT_PERSISTED:'+status+':'+JSON.stringify(saved));
  return id;
}

try{
  await page.goto(base+'/',{waitUntil:'domcontentloaded',timeout:30000});
  await page.locator('#pw').fill(password);
  await Promise.all([page.waitForURL(base+'/',{timeout:30000}),page.locator('#login').click()]);
  logged=true;
  await page.waitForFunction(()=>window.__AI_OFFICE_READY__===true&&window.__AI_OFFICE_DATA_READY__===true,{timeout:30000});
  await internalPost('/api/internal/p3-cleanup');

  await page.locator('.mobilebar [data-view="leads"]').click();
  await page.locator('#leads').waitFor({state:'visible'});

  let row=await createLead('P3 상담단계 검수');
  if(!(await row.textContent()).includes('신규문의'))throw new Error('LEAD_STATUS_NOT_KOREAN_NEW');
  let id=await clickStage(row,'CONTACTED','연락완료');
  row=page.locator(`[data-lead-row="${id}"]`);
  id=await clickStage(row,'CONSULTED','상담완료');
  row=page.locator(`[data-lead-row="${id}"]`);
  id=await clickStage(row,'TRIAL','체험중');
  row=page.locator(`[data-lead-row="${id}"]`);
  await clickStage(row,'ENROLLED','등록완료');

  row=await createLead('P3 상담종료 검수','초6');
  if(!(await row.textContent()).includes('신규문의'))throw new Error('LEAD_STATUS_NOT_KOREAN_SECOND');
  await clickStage(row,'LOST','종료');

  console.log(JSON.stringify({ok:true,viewport:'390x844',korean_status:true,contacted:true,consulted:true,trial:true,enrolled:true,lost:true,real_academy_data_mutated:false},null,2));
}finally{
  if(logged){try{await internalPost('/api/internal/p3-cleanup')}catch{}}
  await browser.close();
}
