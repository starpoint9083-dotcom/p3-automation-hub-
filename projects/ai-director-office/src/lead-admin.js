import {academyId,bodyJson,HttpError,optionalString,requiredString} from './lib.js';

export async function updateLead(env,request,leadId){
  const id=String(leadId||'').trim();
  if(!id)throw new HttpError(400,'LEAD_ID_REQUIRED');
  const lead=await env.DB.prepare(`SELECT id FROM leads WHERE id=? AND academy_id=?`).bind(id,academyId(env)).first();
  if(!lead)throw new HttpError(404,'LEAD_NOT_FOUND');
  const b=await bodyJson(request);
  const childName=requiredString(b.child_name,'child_name',80);
  const grade=optionalString(b.grade,30);
  const experience=optionalString(b.english_experience,500);
  const goal=optionalString(b.goal,500);
  const source=optionalString(b.source,80);
  const due=optionalString(b.followup_due_at,40);
  const parentName=optionalString(b.parent_name,80);
  const parentContact=optionalString(b.parent_contact,80);
  const notes=optionalString(b.notes,1000);
  await env.DB.prepare(`UPDATE leads SET child_name=?,grade=?,english_experience=?,goal=?,source=?,followup_due_at=?,parent_name=?,parent_contact=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND academy_id=?`).bind(childName,grade,experience,goal,source,due,parentName,parentContact,notes,id,academyId(env)).run();
  return {id,child_name:childName,grade,english_experience:experience,goal,source,followup_due_at:due,parent_name:parentName,parent_contact:parentContact,notes,updated:true};
}

export async function deleteLead(env,leadId){
  const id=String(leadId||'').trim();
  if(!id)throw new HttpError(400,'LEAD_ID_REQUIRED');
  const lead=await env.DB.prepare(`SELECT id,child_name FROM leads WHERE id=? AND academy_id=?`).bind(id,academyId(env)).first();
  if(!lead)throw new HttpError(404,'LEAD_NOT_FOUND');
  await env.DB.prepare(`DELETE FROM leads WHERE id=? AND academy_id=?`).bind(id,academyId(env)).run();
  return {id,child_name:lead.child_name,deleted:true};
}
