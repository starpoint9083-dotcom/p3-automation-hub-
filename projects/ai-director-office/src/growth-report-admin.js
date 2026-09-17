import {academyId,HttpError,requiredString} from './lib.js';

export async function listGrowthReports(env,{limit=20}={}){
  const n=Math.max(1,Math.min(50,Number(limit)||20));
  const {results=[]}=await env.DB.prepare(`
    SELECT g.id,g.student_id,s.name student_name,s.grade,s.program,g.period_start,g.period_end,g.report_text,g.evidence_json,g.status,g.created_at
    FROM growth_reports g
    JOIN students s ON s.id=g.student_id
    WHERE s.academy_id=?
    ORDER BY g.created_at DESC
    LIMIT ?
  `).bind(academyId(env),n).all();
  return results.map(r=>({
    id:r.id,student_id:r.student_id,student_name:r.student_name,grade:r.grade,program:r.program,
    period_start:r.period_start,period_end:r.period_end,report_text:r.report_text,status:r.status,created_at:r.created_at,
    evidence:parseEvidence(r.evidence_json)
  }));
}

export async function updateGrowthReportStatus(env,reportId,statusValue){
  const id=String(reportId||'').trim();
  if(!id)throw new HttpError(400,'REPORT_ID_REQUIRED');
  const status=requiredString(statusValue,'status',20).toUpperCase();
  if(!['DRAFT','APPROVED','SENT'].includes(status))throw new HttpError(400,'INVALID_REPORT_STATUS');
  const row=await env.DB.prepare(`
    SELECT g.id FROM growth_reports g
    JOIN students s ON s.id=g.student_id
    WHERE g.id=? AND s.academy_id=?
  `).bind(id,academyId(env)).first();
  if(!row)throw new HttpError(404,'GROWTH_REPORT_NOT_FOUND');
  await env.DB.prepare(`UPDATE growth_reports SET status=? WHERE id=?`).bind(status,id).run();
  return {id,status};
}

function parseEvidence(value){
  try{return JSON.parse(value||'{}')}catch{return {}}
}
