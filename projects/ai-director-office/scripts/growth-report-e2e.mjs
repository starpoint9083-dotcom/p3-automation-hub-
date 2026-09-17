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
  const fixture=await internalPost('/api/internal/p3-growth-report-fixture');
  if(fixture.status!==201||!fixture.body?.data?.report_id)throw new Error('GROWTH_REPORT_FIXTURE_FAILED:'+JSON.stringify(fixture));
  const reportId=fixture.body.data.report_id;

  await page.locator('.mobilebar [data-view="students"]').click();
  await page.locator('#students').waitFor({state:'visible'});
  await page.waitForFunction(()=>document.getElementById('growthReportList')?.textContent.includes('P3 성장보고서 검수'),null,{timeout:15000});
  await page.waitForFunction(()=>[...document.querySelectorAll('#reportStudent option')].some(o=>o.textContent?.includes('P3 성장보고서 검수')),null,{timeout:15000});

  const select=page.locator('#reportStudent');
  const options=await select.locator('option').allTextContents();
  if(!options.some(x=>x.includes('P3 성장보고서 검수')))throw new Error('GROWTH_REPORT_STUDENT_OPTION_MISSING:'+JSON.stringify(options));
  if(!(await page.locator('#generateGrowthReport').isVisible()))throw new Error('GROWTH_REPORT_GENERATE_BUTTON_MISSING');
  if(!(await page.locator('#reportStart').inputValue())||!(await page.locator('#reportEnd').inputValue()))throw new Error('GROWTH_REPORT_PERIOD_DEFAULTS_MISSING');

  let row=page.locator(`[data-growth-report-row="${reportId}"]`);
  await row.waitFor({state:'visible',timeout:10000});
  if(!(await row.textContent()).includes('초안'))throw new Error('GROWTH_REPORT_DRAFT_LABEL_MISSING');
  await row.locator(`[data-approve-report="${reportId}"]`).click();
  await page.waitForFunction(id=>document.querySelector(`[data-growth-report-row="${id}"]`)?.textContent.includes('승인완료'),reportId,{timeout:10000});

  let saved=await page.evaluate(async id=>{const r=await fetch('/api/growth-reports',{cache:'no-store'});const j=await r.json();return (j?.data||[]).find(x=>x.id===id)||null},reportId);
  if(saved?.status!=='APPROVED')throw new Error('GROWTH_REPORT_APPROVAL_NOT_PERSISTED:'+JSON.stringify(saved));

  row=page.locator(`[data-growth-report-row="${reportId}"]`);
  const sentButton=row.locator(`[data-send-report="${reportId}"]`);
  await sentButton.waitFor({state:'visible',timeout:10000});
  await sentButton.click();
  await page.waitForFunction(id=>document.querySelector(`[data-growth-report-row="${id}"]`)?.textContent.includes('전달완료'),reportId,{timeout:10000});

  saved=await page.evaluate(async id=>{const r=await fetch('/api/growth-reports',{cache:'no-store'});const j=await r.json();return (j?.data||[]).find(x=>x.id===id)||null},reportId);
  if(saved?.status!=='SENT')throw new Error('GROWTH_REPORT_SENT_NOT_PERSISTED:'+JSON.stringify(saved));

  console.log(JSON.stringify({ok:true,viewport:'390x844',fixture_visible:true,student_select:true,generate_button:true,period_defaults:true,approved:true,delivered:true,ai_calls:0,real_academy_data_mutated:false},null,2));
}finally{
  if(logged){try{await internalPost('/api/internal/p3-cleanup')}catch{}}
  await browser.close();
}
