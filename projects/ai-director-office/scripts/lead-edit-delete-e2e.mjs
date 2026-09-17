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

try{
  await page.goto(base+'/',{waitUntil:'domcontentloaded',timeout:30000});
  await page.locator('#pw').fill(password);
  await Promise.all([page.waitForURL(base+'/',{timeout:30000}),page.locator('#login').click()]);
  logged=true;
  await page.waitForFunction(()=>window.__AI_OFFICE_READY__===true&&window.__AI_OFFICE_DATA_READY__===true,{timeout:30000});
  await internalPost('/api/internal/p3-cleanup');

  await page.locator('.mobilebar [data-view="leads"]').click();
  await page.locator('#leads').waitFor({state:'visible'});
  const form=page.locator('#leadCreate');
  if(!(await form.isVisible()))await page.locator('[data-toggle="leadCreate"]').click();
  await page.locator('#lName').fill('P3 상담수정삭제 검수');
  await page.locator('#lGrade').fill('초3');
  await page.locator('#lExperience').fill('파닉스 학습 경험');
  await page.locator('#lGoal').fill('읽기 상담');
  await page.locator('#lSource').fill('P3 최초유입');
  await page.locator('#createLead').click();
  await page.waitForFunction(()=>document.getElementById('leadList')?.textContent.includes('P3 상담수정삭제 검수'),{timeout:10000});

  let row=page.locator('#leadList .row').filter({hasText:'P3 상담수정삭제 검수'}).first();
  const edit= row.locator('[data-edit-lead]');
  const leadId=await edit.getAttribute('data-edit-lead');
  if(!leadId)throw new Error('LEAD_EDIT_ID_MISSING');
  await edit.click();
  const panel=row.locator('[data-lead-edit-panel]');
  await panel.waitFor({state:'visible'});
  await panel.locator('[data-edit-lead-grade]').fill('초4');
  await panel.locator('[data-edit-lead-goal]').fill('읽기·쓰기 상담');
  await panel.locator('[data-edit-lead-source]').fill('P3 수정유입');
  await panel.locator('[data-save-lead]').click();
  await page.waitForFunction(()=>document.getElementById('toast')?.textContent.includes('상담 정보를 수정했습니다.'),{timeout:10000});
  await page.waitForFunction(()=>document.getElementById('leadList')?.textContent.includes('P3 상담수정삭제 검수 · 초4'),{timeout:10000});

  const saved=await page.evaluate(async id=>{const r=await fetch('/api/leads',{cache:'no-store'});const j=await r.json();return (j?.data||[]).find(x=>x.id===id)||null},leadId);
  if(saved?.grade!=='초4'||saved?.goal!=='읽기·쓰기 상담'||saved?.source!=='P3 수정유입')throw new Error('LEAD_EDIT_NOT_PERSISTED:'+JSON.stringify(saved));

  row=page.locator(`[data-lead-row="${leadId}"]`);
  page.once('dialog',dialog=>dialog.accept());
  await row.locator('[data-delete-lead]').click();
  await page.waitForFunction(()=>!document.getElementById('leadList')?.textContent.includes('P3 상담수정삭제 검수'),{timeout:10000});
  const gone=await page.evaluate(async id=>{const r=await fetch('/api/leads',{cache:'no-store'});const j=await r.json();return !(j?.data||[]).some(x=>x.id===id)},leadId);
  if(!gone)throw new Error('LEAD_DELETE_NOT_PERSISTED');

  console.log(JSON.stringify({ok:true,viewport:'390x844',lead_edit:true,lead_edit_persisted:true,lead_delete:true,lead_delete_persisted:true,real_academy_data_mutated:false},null,2));
}finally{
  if(logged){try{await internalPost('/api/internal/p3-cleanup')}catch{}}
  await browser.close();
}
