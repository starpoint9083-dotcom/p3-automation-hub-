import {academyId,HttpError} from './lib.js';

export async function deleteStudent(env,studentId){
  const id=String(studentId||'').trim();
  if(!id)throw new HttpError(400,'STUDENT_ID_REQUIRED');
  const student=await env.DB.prepare(`SELECT id,name FROM students WHERE id=? AND academy_id=?`).bind(id,academyId(env)).first();
  if(!student)throw new HttpError(404,'STUDENT_NOT_FOUND');
  await env.DB.prepare(`DELETE FROM students WHERE id=? AND academy_id=?`).bind(id,academyId(env)).run();
  return {id,name:student.name,deleted:true};
}
