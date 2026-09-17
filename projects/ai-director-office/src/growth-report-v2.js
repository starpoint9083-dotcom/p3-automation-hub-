import {academyId,HttpError,requiredString,summarizeMetrics,uid} from './lib.js';
import {runAI} from './services.js';

function programLabel(program){
  const p=String(program||'').toUpperCase();
  if(p==='MUEM')return '뮤엠영어';
  if(p==='NOPIGOM')return '노피곰';
  if(p==='BOTH')return '뮤엠영어·노피곰';
  return String(program||'');
}

export async function growthReport(env,payload){
  const studentId=requiredString(payload.student_id,'student_id',120);
  const start=requiredString(payload.period_start,'period_start',30);
  const end=requiredString(payload.period_end,'period_end',30);
  const student=await env.DB.prepare(`SELECT id,name,grade,program,enrolled_at,status FROM students WHERE id=? AND academy_id=?`).bind(studentId,academyId(env)).first();
  if(!student)throw new HttpError(404,'STUDENT_NOT_FOUND');
  const {results:metrics=[]}=await env.DB.prepare(`SELECT observed_on,attended,homework_pct,test_score,listening_score,reading_score,writing_score,concentration_score,teacher_note FROM student_metrics WHERE student_id=? AND observed_on BETWEEN ? AND ? ORDER BY observed_on`).bind(studentId,start,end).all();
  const evidence=summarizeMetrics(metrics);
  if(evidence.observations===0)throw new HttpError(422,'NOT_ENOUGH_GROWTH_DATA','선택 기간의 학습 기록이 없습니다.');

  const system=`당신은 한국의 영어학원 원장이 학부모에게 직접 설명하는 월간 성장보고서를 작성하는 교육 운영 AI다.
반드시 제공된 관찰 데이터만 근거로 쓴다. 없는 성적, 능력, 태도, 성격, 미래 결과를 만들어내거나 단정하지 않는다. 성적 보장, 근거 없는 미래예측, 의학·심리 진단은 금지한다.

말투 원칙:
- 딱딱한 평가서가 아니라 원장이 부모님께 차분히 설명하는 편안한 존댓말로 쓴다.
- 부드럽고 따뜻하지만 가볍지 않으며, 기록을 근거로 신뢰감 있게 말한다.
- '나타났습니다', '시사합니다', '긍정적인 신호입니다', '제공된 데이터에서는' 같은 기계적인 평가서 표현을 반복하지 않는다.
- 대신 '꾸준히 참여하고 있습니다', '좋은 흐름으로 보고 있습니다', '현재 기록만으로는 판단하기 이릅니다', '조금 더 살펴보겠습니다'처럼 자연스럽게 쓴다.
- 같은 사실이나 수치를 여러 항목에서 반복하지 않는다. 한 근거는 가장 알맞은 한 항목에서만 설명한다.
- 칭찬을 억지로 만들지 않는다. 데이터가 부족하면 부족하다고 솔직하게 말하고, 다음에 무엇을 더 확인할지 안내한다.
- 문제점을 지적할 때도 낙인찍지 말고 '조금 더 살펴볼 부분', '함께 보완해갈 부분'처럼 설명한다.
- 교사나 학원 관점의 전문성을 유지하되 어려운 교육용어와 과장된 표현은 피한다.

구성은 반드시 다음 5개 제목을 이 순서로 사용한다:
1. 이번 기간의 모습
2. 잘하고 있는 점
3. 조금 더 살펴볼 점
4. 다음 지도 방향
5. 원장 한마디

각 항목은 1~3문장으로 짧게 쓴다. 전체는 약 450~650자 정도로 간결하게 마무리한다.`;

  const user=`학생: ${student.name}
학년: ${student.grade}
과정: ${programLabel(student.program)}
기간: ${start}~${end}
관찰 근거: ${JSON.stringify(evidence)}

위 근거만 사용해 학부모에게 바로 전달할 수 있는 한국어 성장보고서를 작성해줘. 같은 내용은 반복하지 말고, 데이터가 없는 부분은 추측하지 말고 '조금 더 기록이 쌓이면 구체적으로 살펴보겠습니다'처럼 자연스럽게 표현해줘.`;

  const reportText=await runAI(env,system,user,850);
  const id=uid('report');
  await env.DB.prepare(`INSERT INTO growth_reports (id,student_id,period_start,period_end,report_text,evidence_json) VALUES (?,?,?,?,?,?)`).bind(id,studentId,start,end,reportText,JSON.stringify(evidence)).run();
  return {id,student,period:{start,end},evidence,report_text:reportText,status:'DRAFT'};
}
