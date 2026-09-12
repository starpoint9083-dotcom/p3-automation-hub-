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

  await page.locator('.mobilebar [data-view="students"]').click();
  await page.locator('#students').waitFor({state:'visible'});
  const toggle=page.locator('[data-toggle="studentCreate"]');
  await toggle.click();
  await page.locator('#studentCreate').waitFor({state:'visible'});
  await page.locator('#sName').fill('P3 수정검수 학생');
  await page.locator('#sGrade').fill('초3');
  await page.locator('#sProgram').selectOption('MUEM');
  await page.locator('#sNotes').fill('수정 전 메모');
  await page.locator('#createStudent').click();
  await page.waitForFunction(()=>document.getElementById('studentRisks')?.textContent.includes('P3 수정검수 학생'),{timeout:10000});

  let row=page.locator('#studentRisks .row').filter({hasText:'P3 수정검수 학생'}).first();
  const editButton=row.locator('[data-edit-student]');
  const studentId=await editButton.getAttribute('data-edit-student');
  if(!studentId)throw new Error('STUDENT_EDIT_ID_MISSING');
  await editButton.click();
  const panel=row.locator('[data-student-edit-panel]');
  await panel.waitFor({state:'visible'});
  await panel.locator('[data-edit-grade]').fill('초4');
  await panel.locator('[data-edit-program]').selectOption('BOTH');
  await panel.locator('[data-edit-notes]').fill('수정 후 메모');
  await panel.locator('[data-save-student]').click();
  await page.waitForFunction(()=>document.getElementById('toast')?.textContent.includes('학생 정보를 수정했습니다.'),{timeout:10000});
  await page.waitForFunction(()=>document.getElementById('studentRisks')?.textContent.includes('P3 수정검수 학생 · 초4'),{timeout:10000});

  const saved=await page.evaluate(async id=>{
    const r=await fetch('/api/students/'+encodeURIComponent(id),{cache:'no-store'});
    return {status:r.status,body:await r.json()};
  },studentId);
  if(saved.status!==200)throw new Error('STUDENT_EDIT_GET_FAILED:'+saved.status);
  const student=saved.body?.data?.student;
  if(student?.grade!=='초4'||student?.program!=='BOTH'||student?.notes!=='수정 후 메모')throw new Error('STUDENT_EDIT_NOT_PERSISTED:'+JSON.stringify(student));

  row=page.locator('#studentRisks .row').filter({hasText:'P3 수정검수 학생'}).first();
  page.once('dialog',dialog=>dialog.accept());
  await row.locator('[data-delete-student]').click();
  await page.waitForFunction(()=>!document.getElementById('studentRisks')?.textContent.includes('P3 수정검수 학생'),{timeout:10000});

  console.log(JSON.stringify({ok:true,viewport:'390x844',student_edit:true,student_edit_persisted:true,student_delete_after_edit:true,real_academy_data_mutated:false},null,2));
}finally{
  if(logged){try{await internalPost('/api/internal/p3-cleanup')}catch{}}
  await browser.close();
}
