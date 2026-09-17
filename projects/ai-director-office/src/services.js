import {academyId,bodyJson,clampNumber,HttpError,nowIso,numeric,optionalString,requiredString,riskFromMetrics,summarizeMetrics,uid} from './lib.js';

export async function ensureAcademy(env){
  const id=academyId(env);
  await env.DB.prepare(`INSERT INTO academies (id,name) VALUES (?,?) ON CONFLICT(id) DO NOTHING`).bind(id,'AI 원장실 테스트 학원').run();
  return id;
}

export async function runAI(env,system,user,maxTokens=900){
  if(!env.AI)throw new HttpError(503,'AI_NOT_BOUND');
  const model=env.AI_MODEL||'@cf/meta/llama-3.3-70b-instruct-fp8-fast';
  const result=await env.AI.run(model,{messages:[{role:'system',content:system},{role:'user',content:user}],max_tokens:maxTokens,temperature:.22});
  const text=typeof result==='string'?result:(result?.response??result?.result?.response??'');
  if(!text)throw new HttpError(502,'AI_EMPTY_RESPONSE');
  return text.trim();
}

async function latestMetrics(env,studentId,limit=16){
  const {results=[]}=await env.DB.prepare(`SELECT observed_on,attended,homework_pct,test_score,listening_score,reading_score,writing_score,concentration_score,teacher_note FROM student_metrics WHERE student_id=? ORDER BY observed_on DESC LIMIT ?`).bind(studentId,limit).all();
  return results;
}
async function lastParentContactDays(env,studentId){
  const row=await env.DB.prepare(`SELECT contacted_at FROM parent_contacts WHERE student_id=? ORDER BY contacted_at DESC LIMIT 1`).bind(studentId).first();
  if(!row?.contacted_at)return null;
  const ts=new Date(row.contacted_at).getTime();
  return Number.isFinite(ts)?Math.max(0,Math.floor((Date.now()-ts)/86400000)):null;
}
async function activeStudents(env){
  const {results=[]}=await env.DB.prepare(`SELECT id,name,grade,program,enrolled_at,status,parent_name,notes FROM students WHERE academy_id=? AND status='ACTIVE' ORDER BY name`).bind(academyId(env)).all();
  return results;
}
export async function riskForStudent(env,student){
  const metrics=await latestMetrics(env,student.id,16);
  const gap=await lastParentContactDays(env,student.id);
  return {student,...riskFromMetrics(metrics,gap)};
}
export async function listRisks(env){
  const students=await activeStudents(env); const rows=[];
  for(const student of students)rows.push(await riskForStudent(env,student));
  return rows.sort((a,b)=>b.score-a.score||a.student.name.localeCompare(b.student.name,'ko'));
}

export async function studentCard(env,studentId){
  const student=await env.DB.prepare(`SELECT id,name,grade,program,enrolled_at,status,parent_name,notes FROM students WHERE id=? AND academy_id=?`).bind(studentId,academyId(env)).first();
  if(!student)throw new HttpError(404,'STUDENT_NOT_FOUND');
  const metrics=await latestMetrics(env,studentId,24);
  const summary=summarizeMetrics(metrics);
  const risk=await riskForStudent(env,student);
  const {results:contacts=[]}=await env.DB.prepare(`SELECT contacted_at,channel,summary,sentiment,next_action FROM parent_contacts WHERE student_id=? ORDER BY contacted_at DESC LIMIT 5`).bind(studentId).all();
  return {student,summary,risk:{score:risk.score,band:risk.band,confidence:risk.confidence,reasons:risk.reasons,evidence:risk.evidence},recent_parent_contacts:contacts};
}

export async function createStudent(env,request){
  const b=await bodyJson(request), id=uid('student'), academy=await ensureAcademy(env);
  const program=requiredString(b.program,'program',20).toUpperCase();
  if(!['MUEM','NOPIGOM','BOTH'].includes(program))throw new HttpError(400,'INVALID_PROGRAM');
  const status=(b.status||'ACTIVE').toUpperCase();
  if(!['LEAD','TRIAL','ACTIVE','PAUSED','LEFT'].includes(status))throw new HttpError(400,'INVALID_STUDENT_STATUS');
  await env.DB.prepare(`INSERT INTO students (id,academy_id,name,grade,program,enrolled_at,status,parent_name,parent_contact,notes) VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(id,academy,requiredString(b.name,'name',80),requiredString(b.grade,'grade',30),program,optionalString(b.enrolled_at,30),status,optionalString(b.parent_name,80),optionalString(b.parent_contact,80),optionalString(b.notes,1000)).run();
  return {id};
}
export async function addMetric(env,request,studentId){
  const student=await env.DB.prepare(`SELECT id FROM students WHERE id=? AND academy_id=?`).bind(studentId,academyId(env)).first();
  if(!student)throw new HttpError(404,'STUDENT_NOT_FOUND');
  const b=await bodyJson(request), observed=requiredString(b.observed_on||new Date().toISOString().slice(0,10),'observed_on',30);
  const attendance=b.attended===undefined||b.attended===null?null:(b.attended?1:0);
  await env.DB.prepare(`INSERT INTO student_metrics (student_id,observed_on,attended,homework_pct,test_score,listening_score,reading_score,writing_score,concentration_score,teacher_note) VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(studentId,observed,attendance,clampNumber(b.homework_pct,0,100),clampNumber(b.test_score,0,100),clampNumber(b.listening_score,0,100),clampNumber(b.reading_score,0,100),clampNumber(b.writing_score,0,100),clampNumber(b.concentration_score,0,100),optionalString(b.teacher_note,1000)).run();
  return {ok:true};
}

export async function growthReport(env,payload){
  const studentId=requiredString(payload.student_id,'student_id',120), start=requiredString(payload.period_start,'period_start',30), end=requiredString(payload.period_end,'period_end',30);
  const student=await env.DB.prepare(`SELECT id,name,grade,program,enrolled_at,status FROM students WHERE id=? AND academy_id=?`).bind(studentId,academyId(env)).first();
  if(!student)throw new HttpError(404,'STUDENT_NOT_FOUND');
  const {results:metrics=[]}=await env.DB.prepare(`SELECT observed_on,attended,homework_pct,test_score,listening_score,reading_score,writing_score,concentration_score,teacher_note FROM student_metrics WHERE student_id=? AND observed_on BETWEEN ? AND ? ORDER BY observed_on`).bind(studentId,start,end).all();
  const evidence=summarizeMetrics(metrics);
  if(evidence.observations===0)throw new HttpError(422,'NOT_ENOUGH_GROWTH_DATA','선택 기간의 학습 기록이 없습니다.');
  const system=`당신은 한국의 영어학원 원장을 돕는 교육 운영 AI다. 제공된 관찰 데이터만 근거로 학부모가 이해하기 쉬운 성장보고서를 작성한다. 학생을 낙인찍거나 성격·능력을 단정하지 않는다. 근거 없는 미래예측, 성적보장, 의학·심리 진단을 금지한다. 데이터가 없는 항목은 평가하지 않는다. 문체는 따뜻하지만 구체적이고 전문적이어야 한다. 구성은 '이번 달 변화 / 잘하고 있는 점 / 보완할 점 / 다음 달 지도방향 / 원장 한마디' 순서다.`;
  const user=`학생 ${student.name}, ${student.grade}, 과정 ${student.program}. 기간 ${start}~${end}. 관찰 근거: ${JSON.stringify(evidence)}. 450~650자 한국어 보고서로 작성하라.`;
  const reportText=await runAI(env,system,user,850), id=uid('report');
  await env.DB.prepare(`INSERT INTO growth_reports (id,student_id,period_start,period_end,report_text,evidence_json) VALUES (?,?,?,?,?,?)`).bind(id,studentId,start,end,reportText,JSON.stringify(evidence)).run();
  return {id,student,period:{start,end},evidence,report_text:reportText,status:'DRAFT'};
}

export async function createLead(env,request){
  const b=await bodyJson(request), id=uid('lead'); await ensureAcademy(env);
  const status=(b.status||'NEW').toUpperCase();
  if(!['NEW','CONTACTED','CONSULTED','TRIAL','ENROLLED','LOST'].includes(status))throw new HttpError(400,'INVALID_LEAD_STATUS');
  await env.DB.prepare(`INSERT INTO leads (id,academy_id,child_name,grade,english_experience,reading_level,goal,available_days,source,parent_name,parent_contact,status,followup_due_at,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,academyId(env),requiredString(b.child_name,'child_name',80),optionalString(b.grade,30),optionalString(b.english_experience,500),optionalString(b.reading_level,300),optionalString(b.goal,500),optionalString(b.available_days,200),optionalString(b.source,80),optionalString(b.parent_name,80),optionalString(b.parent_contact,80),status,optionalString(b.followup_due_at,40),optionalString(b.notes,1000)).run();
  await env.DB.prepare(`INSERT INTO lead_events (id,lead_id,event_type,channel,note) VALUES (?,?,?,?,?)`).bind(uid('le'),id,'CREATED',optionalString(b.source,80),optionalString(b.notes,500)).run();
  return {id};
}
export async function listLeads(env){
  const {results=[]}=await env.DB.prepare(`SELECT id,child_name,grade,english_experience,reading_level,goal,available_days,source,status,followup_due_at,last_contact_at,created_at FROM leads WHERE academy_id=? ORDER BY CASE status WHEN 'NEW' THEN 0 WHEN 'CONTACTED' THEN 1 WHEN 'CONSULTED' THEN 2 WHEN 'TRIAL' THEN 3 ELSE 4 END, COALESCE(followup_due_at,created_at)`).bind(academyId(env)).all();
  return results;
}
export async function updateLeadStage(env,request,leadId){
  const b=await bodyJson(request), stage=requiredString(b.status,'status',30).toUpperCase();
  if(!['CONTACTED','CONSULTED','TRIAL','ENROLLED','LOST'].includes(stage))throw new HttpError(400,'INVALID_LEAD_STAGE');
  const lead=await env.DB.prepare(`SELECT id FROM leads WHERE id=? AND academy_id=?`).bind(leadId,academyId(env)).first();
  if(!lead)throw new HttpError(404,'LEAD_NOT_FOUND');
  const when=nowIso(), due=optionalString(b.followup_due_at,40), channel=optionalString(b.channel,50), note=optionalString(b.note,800);
  await env.DB.prepare(`UPDATE leads SET status=?,last_contact_at=?,followup_due_at=?,notes=COALESCE(?,notes),updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(stage,when,due,note,leadId).run();
  await env.DB.prepare(`INSERT INTO lead_events (id,lead_id,event_type,channel,note,occurred_at) VALUES (?,?,?,?,?,?)`).bind(uid('le'),leadId,stage,channel,note,when).run();
  return {id:leadId,status:stage,followup_due_at:due};
}

export async function setRecruitmentTarget(env,request){
  const b=await bodyJson(request), id=optionalString(b.id,120)||uid('target'); await ensureAcademy(env);
  const program=b.program?requiredString(b.program,'program',20).toUpperCase():null;
  if(program&&!['MUEM','NOPIGOM','BOTH'].includes(program))throw new HttpError(400,'INVALID_PROGRAM');
  const capacity=Math.max(0,Math.floor(numeric(b.capacity)??0)), active=Math.max(0,Math.floor(numeric(b.active_students)??0)), desired=Math.max(0,Math.floor(numeric(b.desired_new_students)??0)), priority=Math.max(0,Math.min(100,Math.floor(numeric(b.priority)??50)));
  await env.DB.prepare(`INSERT INTO academy_targets (id,academy_id,segment,program,capacity,active_students,desired_new_students,priority,is_active,updated_at) VALUES (?,?,?,?,?,?,?,?,1,CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET segment=excluded.segment,program=excluded.program,capacity=excluded.capacity,active_students=excluded.active_students,desired_new_students=excluded.desired_new_students,priority=excluded.priority,is_active=1,updated_at=CURRENT_TIMESTAMP`).bind(id,academyId(env),requiredString(b.segment,'segment',120),program,capacity,active,desired,priority).run();
  return {id,open_seats:Math.max(0,capacity-active)};
}
export async function recruitmentTargets(env){
  const {results=[]}=await env.DB.prepare(`SELECT id,segment,program,capacity,active_students,desired_new_students,priority,MAX(capacity-active_students,0) open_seats,updated_at FROM academy_targets WHERE academy_id=? AND is_active=1 ORDER BY priority DESC, open_seats DESC`).bind(academyId(env)).all();
  return results;
}

async function funnelBySource(env){
  const {results=[]}=await env.DB.prepare(`SELECT COALESCE(source,'unknown') source,COUNT(*) inquiries,SUM(CASE WHEN status IN ('CONSULTED','TRIAL','ENROLLED') THEN 1 ELSE 0 END) consultations,SUM(CASE WHEN status='ENROLLED' THEN 1 ELSE 0 END) enrollments FROM leads WHERE academy_id=? GROUP BY COALESCE(source,'unknown') ORDER BY enrollments DESC,inquiries DESC`).bind(academyId(env)).all();
  return results.map(r=>({...r,consultation_rate:Number(r.inquiries)?Math.round(Number(r.consultations)/Number(r.inquiries)*1000)/10:0,enrollment_rate:Number(r.inquiries)?Math.round(Number(r.enrollments)/Number(r.inquiries)*1000)/10:0}));
}
export async function recruitmentPlan(env,payload){
  const goal=Math.max(1,Math.min(50,Math.floor(numeric(payload.goal_students)??5)));
  const configured=await recruitmentTargets(env), passed=Array.isArray(payload.seats)?payload.seats:[];
  const seats=passed.length?passed:configured;
  const candidates=seats.map(s=>({...s,open_seats:Math.max(0,numeric(s.open_seats)??Math.max(0,(numeric(s.capacity)??0)-(numeric(s.active_students)??0)))})).filter(s=>s.open_seats>0).sort((a,b)=>(numeric(b.priority)??50)-(numeric(a.priority)??50)||b.open_seats-a.open_seats);
  const target=optionalString(payload.target_segment,120)||candidates[0]?.segment||'신규 모집 여유가 있는 학년';
  const channels=Array.isArray(payload.channels)&&payload.channels.length?payload.channels.slice(0,8).map(String):['네이버 블로그','당근','인스타그램','기존 상담자 후속'];
  const funnel=await funnelBySource(env);
  const system=`당신은 한국의 소규모 영어학원 전문 AI 모집실장이다. 목표는 조회수가 아니라 상담 예약과 신규 등록이다. 뮤엠영어·노피곰의 공식 교육내용을 임의로 만들어내지 말고 제공된 운영정보만 사용한다. 성적 보장, 허위 희소성, 과장광고, 불안 조장 표현을 금지한다. 실행계획에는 1) 우선 모집대상과 이유 2) 핵심 메시지 3) 채널별 역할 4) 콘텐츠 주제 5) 상담 전환장치 6) 1일·3일·7일 후속 흐름 7) 상담예약·등록 중심 KPI를 반드시 포함한다. 원장이 오늘 바로 실행할 수 있을 만큼 구체적으로 작성한다.`;
  const user=`신규 등록 목표 ${goal}명. 우선 타깃 ${target}. 자리현황 ${JSON.stringify(seats)}. 현재 유입 퍼널 ${JSON.stringify(funnel)}. 사용할 채널 ${JSON.stringify(channels)}. 900~1300자 실행계획을 작성하라.`;
  const planText=await runAI(env,system,user,1500), id=uid('campaign'), trackingBase=crypto.randomUUID().slice(0,8);
  const plan={goal_students:goal,target_segment:target,channels,funnel,seats,plan_text:planText,tracking_base:trackingBase};
  await env.DB.prepare(`INSERT INTO recruitment_campaigns (id,academy_id,goal_students,target_segment,channels_json,plan_json) VALUES (?,?,?,?,?,?)`).bind(id,academyId(env),goal,target,JSON.stringify(channels),JSON.stringify(plan)).run();
  return {id,...plan,status:'DRAFT'};
}
export async function recruitmentContent(env,payload){
  const campaignId=requiredString(payload.campaign_id,'campaign_id',140), channel=requiredString(payload.channel,'channel',50);
  const campaign=await env.DB.prepare(`SELECT id,goal_students,target_segment,channels_json,plan_json FROM recruitment_campaigns WHERE id=? AND academy_id=?`).bind(campaignId,academyId(env)).first();
  if(!campaign)throw new HttpError(404,'CAMPAIGN_NOT_FOUND');
  const purpose=optionalString(payload.purpose,200)||'상담 예약 유도';
  const system=`당신은 학원 광고 카피라이터가 아니라 상담 전환을 설계하는 모집실장이다. 채널 문법에 맞는 실제 게시 초안을 만든다. 과장, 성적보장, 가짜 마감임박, 경쟁학원 비방, 확인되지 않은 브랜드 교육효과 주장을 금지한다. 개인정보를 넣지 않는다. 반드시 자연스러운 상담 유도 문장을 마지막에 포함한다.`;
  const user=`채널: ${channel}. 목적: ${purpose}. 캠페인: ${JSON.stringify({goal_students:campaign.goal_students,target_segment:campaign.target_segment,plan:JSON.parse(campaign.plan_json||'{}').plan_text})}. 바로 게시 전 검토 가능한 완성 초안을 작성하라.`;
  const body=await runAI(env,system,user,1200), id=uid('content'), trackingCode=`${campaignId.slice(-6)}-${crypto.randomUUID().slice(0,6)}`;
  await env.DB.prepare(`INSERT INTO content_items (id,campaign_id,channel,title,body,tracking_code) VALUES (?,?,?,?,?,?)`).bind(id,campaignId,channel,`${campaign.target_segment} · ${channel}`,body,trackingCode).run();
  return {id,campaign_id:campaignId,channel,title:`${campaign.target_segment} · ${channel}`,body,tracking_code:trackingCode,status:'DRAFT'};
}
export async function recordCampaignEvent(env,request){
  const b=await bodyJson(request), type=requiredString(b.event_type,'event_type',30).toUpperCase();
  if(!['PUBLISHED','INQUIRY','CONSULTATION','TRIAL','ENROLLMENT'].includes(type))throw new HttpError(400,'INVALID_CAMPAIGN_EVENT');
  const campaignId=requiredString(b.campaign_id,'campaign_id',140);
  const campaign=await env.DB.prepare(`SELECT id FROM recruitment_campaigns WHERE id=? AND academy_id=?`).bind(campaignId,academyId(env)).first();
  if(!campaign)throw new HttpError(404,'CAMPAIGN_NOT_FOUND');
  const contentId=optionalString(b.content_id,140), leadId=optionalString(b.lead_id,140), source=optionalString(b.source,80);
  await env.DB.prepare(`INSERT INTO campaign_events (id,campaign_id,content_id,event_type,source,lead_id) VALUES (?,?,?,?,?,?)`).bind(uid('ce'),campaignId,contentId,type,source,leadId).run();
  if(contentId){const col=type==='INQUIRY'?'inquiries':type==='CONSULTATION'?'consultations':type==='ENROLLMENT'?'enrollments':null;if(col)await env.DB.prepare(`UPDATE content_items SET ${col}=${col}+1 WHERE id=? AND campaign_id=?`).bind(contentId,campaignId).run();}
  return {ok:true};
}
export async function recruitmentPerformance(env){
  const {results:campaigns=[]}=await env.DB.prepare(`SELECT id,goal_students,target_segment,status,created_at FROM recruitment_campaigns WHERE academy_id=? ORDER BY created_at DESC LIMIT 20`).bind(academyId(env)).all();
  const out=[];
  for(const c of campaigns){
    const counts=await env.DB.prepare(`SELECT SUM(CASE WHEN event_type='INQUIRY' THEN 1 ELSE 0 END) inquiries,SUM(CASE WHEN event_type='CONSULTATION' THEN 1 ELSE 0 END) consultations,SUM(CASE WHEN event_type='TRIAL' THEN 1 ELSE 0 END) trials,SUM(CASE WHEN event_type='ENROLLMENT' THEN 1 ELSE 0 END) enrollments FROM campaign_events WHERE campaign_id=?`).bind(c.id).first();
    const inquiries=Number(counts?.inquiries||0), consultations=Number(counts?.consultations||0), enrollments=Number(counts?.enrollments||0);
    out.push({...c,inquiries,consultations,trials:Number(counts?.trials||0),enrollments,consultation_rate:inquiries?Math.round(consultations/inquiries*1000)/10:0,enrollment_rate:inquiries?Math.round(enrollments/inquiries*1000)/10:0,goal_progress:c.goal_students?Math.round(enrollments/Number(c.goal_students)*1000)/10:0});
  }
  return {campaigns:out,source_funnel:await funnelBySource(env)};
}

export async function briefing(env){
  const risks=await listRisks(env), leads=await listLeads(env), targets=await recruitmentTargets(env), now=Date.now();
  const due=leads.filter(l=>l.followup_due_at&&new Date(l.followup_due_at).getTime()<=now&&!['ENROLLED','LOST'].includes(l.status));
  const red=risks.filter(r=>r.band==='RED'), yellow=risks.filter(r=>r.band==='YELLOW');
  const actions=[];
  for(const r of red.slice(0,3))actions.push({priority:100,kind:'RETENTION',title:`${r.student.name} 학부모 상담`,detail:r.reasons.join(', ')||'최근 변화를 확인하세요.',entity_id:r.student.id,confidence:r.confidence});
  for(const l of due.slice(0,3))actions.push({priority:90,kind:'LEAD_FOLLOWUP',title:`${l.child_name} 상담 후속 연락`,detail:`${l.grade||'학년 미입력'} · ${l.status} · ${l.source||'유입경로 미상'}`,entity_id:l.id});
  const urgentTarget=targets.filter(t=>Number(t.open_seats)>0).sort((a,b)=>Number(b.priority)-Number(a.priority)||Number(b.open_seats)-Number(a.open_seats))[0];
  if(urgentTarget)actions.push({priority:75,kind:'RECRUITMENT',title:`${urgentTarget.segment} 모집 콘텐츠 준비`,detail:`현재 ${urgentTarget.open_seats}자리 여유 · 목표 ${urgentTarget.desired_new_students}명`,entity_id:urgentTarget.id});
  if(!actions.length&&yellow.length)actions.push({priority:70,kind:'CARE',title:`${yellow[0].student.name} 변화 확인`,detail:yellow[0].reasons.join(', ')||'관찰 데이터를 한 번 더 확인하세요.',entity_id:yellow[0].student.id,confidence:yellow[0].confidence});
  actions.sort((a,b)=>b.priority-a.priority);
  const counts={students:risks.length,risk_red:red.length,risk_yellow:yellow.length,open_leads:leads.filter(l=>!['ENROLLED','LOST'].includes(l.status)).length,followups_due:due.length,open_seats:targets.reduce((s,t)=>s+Number(t.open_seats||0),0)};
  return {generated_at:nowIso(),counts,top_actions:actions.slice(0,3),risks:risks.slice(0,10),due_followups:due.slice(0,10),recruitment_targets:targets.slice(0,10)};
}
