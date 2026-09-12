import {academyId,bodyJson,HttpError,optionalString,requiredString} from './lib.js';

export async function updateStudent(env,request,studentId){
  const id=String(studentId||'').trim();
  if(!id)throw new HttpError(400,'STUDENT_ID_REQUIRED');
  const student=await env.DB.prepare(`SELECT id FROM students WHERE id=? AND academy_id=?`).bind(id,academyId(env)).first();
  if(!student)throw new HttpError(404,'STUDENT_NOT_FOUND');
  const b=await bodyJson(request);
  const name=requiredString(b.name,'name',80);
  const grade=requiredString(b.grade,'grade',30);
  const program=requiredString(b.program,'program',20).toUpperCase();
  if(!['MUEM','NOPIGOM','BOTH'].includes(program))throw new HttpError(400,'INVALID_PROGRAM');
  const enrolledAt=optionalString(b.enrolled_at,30);
  const notes=optionalString(b.notes,1000);
  await env.DB.prepare(`UPDATE students SET name=?,grade=?,program=?,enrolled_at=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND academy_id=?`).bind(name,grade,program,enrolledAt,notes,id,academyId(env)).run();
  return {id,name,grade,program,enrolled_at:enrolledAt,notes,updated:true};
}

export async function deleteStudent(env,studentId){
  const id=String(studentId||'').trim();
  if(!id)throw new HttpError(400,'STUDENT_ID_REQUIRED');
  const student=await env.DB.prepare(`SELECT id,name FROM students WHERE id=? AND academy_id=?`).bind(id,academyId(env)).first();
  if(!student)throw new HttpError(404,'STUDENT_NOT_FOUND');
  await env.DB.prepare(`DELETE FROM students WHERE id=? AND academy_id=?`).bind(id,academyId(env)).run();
  return {id,name:student.name,deleted:true};
}
