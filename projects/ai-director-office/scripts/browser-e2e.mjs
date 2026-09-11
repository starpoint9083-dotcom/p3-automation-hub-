import {chromium} from 'playwright';

const base=(process.env.DEPLOY_URL||'').replace(/\/$/,'');
const password=process.env.ADMIN_PASSWORD||'';
if(!base)throw new Error('DEPLOY_URL_REQUIRED');
if(password.length<12)throw new Error('ADMIN_PASSWORD_REQUIRED');

const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
const page=await context.newPage();
const pageErrors=[];
page.on('pageerror',e=>pageErrors.push(e.message||String(e)));

try{
  await page.goto(base+'/',{waitUntil:'domcontentloaded',timeout:30000});
  await page.locator('#pw').fill(password);
  await Promise.all([
    page.waitForURL(base+'/',{timeout:30000}),
    page.locator('#login').click()
  ]);
  await page.waitForFunction(()=>window.__AI_OFFICE_READY__===true,{timeout:20000});
  await page.waitForFunction(()=>window.__AI_OFFICE_DATA_READY__===true,{timeout:30000});

  const system=await page.locator('#systemStatus').innerText();
  if(!system.includes('연결 정상'))throw new Error('SYSTEM_STATUS_NOT_READY:'+system);
  const studentsCount=(await page.locator('#kStudents').innerText()).trim();
  if(!studentsCount||studentsCount==='…'||studentsCount==='-')throw new Error('KPI_NOT_LOADED:'+studentsCount);

  await page.locator('.mobilebar [data-view="students"]').click();
  await page.locator('#students').waitFor({state:'visible',timeout:10000});
  await page.locator('[data-toggle="studentCreate"]').click();
  await page.locator('#studentCreate').waitFor({state:'visible',timeout:10000});
  await page.locator('#sName').fill('P3 UI 검수');
  await page.locator('#sGrade').fill('초3');

  await page.locator('.mobilebar [data-view="leads"]').click();
  await page.locator('#leads').waitFor({state:'visible',timeout:10000});
  await page.locator('[data-toggle="leadCreate"]').click();
  await page.locator('#leadCreate').waitFor({state:'visible',timeout:10000});
  await page.locator('#lName').fill('P3 상담 검수');

  await page.locator('.mobilebar [data-view="recruitment"]').click();
  await page.locator('#recruitment').waitFor({state:'visible',timeout:10000});
  await page.locator('[data-toggle="targetCreate"]').click();
  await page.locator('#targetCreate').waitFor({state:'visible',timeout:10000});
  await page.locator('#targetSegment').fill('P3 모바일 UI 검수');
  await page.locator('#goalStudents').fill('1');
  await page.locator('#makePlan').click();
  await page.waitForFunction(()=>{
    const el=document.getElementById('planResult');
    return el&&el.style.display!=='none'&&el.textContent.length>120&&!el.textContent.includes('분석하고 있습니다')&&!el.textContent.includes('생성 실패');
  },{timeout:70000});
  await page.locator('#contentMaker').waitFor({state:'visible',timeout:10000});

  await page.locator('.mobilebar [data-view="today"]').click();
  await page.locator('#today').waitFor({state:'visible',timeout:10000});
  if(pageErrors.length)throw new Error('BROWSER_JS_ERRORS:'+JSON.stringify(pageErrors));

  console.log(JSON.stringify({ok:true,base,viewport:'390x844',login:true,js_ready:true,data_ready:true,tabs:{today:true,students:true,leads:true,recruitment:true},forms:{student:true,lead:true,target:true},ai_plan_button:true,system_status:system,kpi_students:studentsCount},null,2));
}finally{
  await browser.close();
}
