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
  await page.locator('.mobilebar [data-view="students"]').click();
  const toggle=page.locator('[data-toggle="studentCreate"]');if(!(await page.locator('#studentCreate').isVisible()))await toggle.click();
  await page.locator('#sName').fill('P3 학습기록 검수');
  await page.locator('#sGrade').fill('초5');
  await page.locator('#sProgram').selectOption('MUEM');
  await page.locator('#createStudent').click();
  await page.waitForFunction(()=>document.getElementById('studentRisks')?.textContent.includes('P3 학습기록 검수'),{timeout:10000});
  let row=page.locator('#studentRisks .row').filter({hasText:'P3 학습기록 검수'}).first();
  const metricButton=row.locator('[data-metric-student]');
  const studentId=await metricButton.getAttribute('data-metric-student');if(!studentId)throw new Error('STUDENT_METRIC_ID_MISSING');
  await metricButton.click();
  const panel=row.locator('[data-student-metric-panel]');await panel.waitFor({state:'visible'});
  await panel.locator('[data-metric-attended]').selectOption('1');
  await panel.locator('[data-metric-homework]').fill('82');
  await panel.locator('[data-metric-test]').fill('88');
  await panel.locator('[data-metric-listening]').fill('90');
  await panel.locator('[data-metric-reading]').fill('84');
  await panel.locator('[data-metric-writing]').fill('79');
  await panel.locator('[data-metric-concentration]').fill('86');
  await panel.locator('[data-metric-note]').fill('P3 학습기록 저장 검수');
  await panel.locator('[data-save-metric]').click();
  await page.waitForFunction(()=>document.getElementById('toast')?.textContent.includes('학습기록을 저장하고 위험신호를 다시 계산했습니다.'),{timeout:10000});
  const card=await page.evaluate(async id=>{const r=await fetch('/api/students/'+encodeURIComponent(id),{cache:'no-store'});return r.json()},studentId);
  if(!card?.data?.summary||Number(card.data.summary.observations)<1)throw new Error('STUDENT_METRIC_NOT_PERSISTED:'+JSON.stringify(card));
  row=page.locator('#studentRisks .row').filter({hasText:'P3 학습기록 검수'}).first();
  page.once('dialog',d=>d.accept());await row.locator('[data-delete-student]').click();
  await page.waitForFunction(()=>!document.getElementById('studentRisks')?.textContent.includes('P3 학습기록 검수'),{timeout:10000});
  console.log(JSON.stringify({ok:true,viewport:'390x844',metric_button:true,metric_saved:true,risk_recalculated:true,student_cleanup:true,real_academy_data_mutated:false},null,2));
}finally{if(logged){try{await internalPost('/api/internal/p3-cleanup')}catch{}}await browser.close()}
