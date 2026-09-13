import {academyId} from './lib.js';
import {ensureAcademy} from './services.js';

export async function setupP3MobileFixture(env){
  await ensureAcademy(env);
  const academy=academyId(env),missionId='p3-ui-mission',runId='p3-ui-run',itemId='p3-ui-item';
  await env.DB.prepare(`DELETE FROM promo_production_runs WHERE id=? AND academy_id=?`).bind(runId,academy).run();
  await env.DB.prepare(`DELETE FROM promo_missions WHERE id=? AND academy_id=?`).bind(missionId,academy).run();
  const channels=['YOUTUBE','NAVER_BLOG','INSTAGRAM','DAANGN'];
  const needs=[
    {kind:'IMAGE',channel:'YOUTUBE',purpose:'P3 유튜브 쇼츠 커버',width:1080,height:1920,required:true,prompt_hint:'P3 모바일 UI 검수용'},
    {kind:'IMAGE',channel:'INSTAGRAM',purpose:'P3 인스타 릴스 커버',width:1080,height:1920,required:false,prompt_hint:'P3 모바일 UI 검수용'}
  ];
  const missionText='P3 모바일 검수용 임시 홍보작전입니다. 실제 AI를 호출하지 않고 모바일 화면의 유튜브·인스타·네이버 블로그·당근 채널 선택, 제작 필요 목록, 전체 제작 시작 버튼, 제작 큐 상태 표시가 정상 연결되는지만 확인합니다. 이 데이터는 P3 cleanup에서 자동 삭제되며 실제 학원 운영정보나 기존 프로필을 변경하지 않습니다.';
  await env.DB.prepare(`INSERT INTO promo_missions (id,academy_id,goal_students,target_segment,channels_json,needs_json,mission_text,status) VALUES (?,?,?,?,?,?,?,'READY')`).bind(missionId,academy,1,'P3 모바일 검수',JSON.stringify(channels),JSON.stringify(needs),missionText).run();
  await env.DB.prepare(`INSERT INTO promo_production_runs (id,academy_id,mission_id,status,total_items,done_items,failed_items) VALUES (?,?,?,'QUEUED',1,0,0)`).bind(runId,academy,missionId).run();
  await env.DB.prepare(`INSERT INTO promo_production_items (id,run_id,academy_id,mission_id,item_type,channel,purpose,payload_json,status,result_ref,attempt_count) VALUES (?,?,?,?,?,?,?,?, 'READY',?,0)`).bind(itemId,runId,academy,missionId,'SHORTS_SCRIPT','YOUTUBE','P3 quota-free ready item','{}','p3-fixture-ready').run();
  return {ok:true,mission_id:missionId,run_id:runId,item_id:itemId,channels,needs,ai_calls:0};
}

export async function setupP3GrowthReportFixture(env){
  await ensureAcademy(env);
  const academy=academyId(env),studentId='p3-growth-student',reportId='p3-growth-report';
  await env.DB.prepare(`DELETE FROM students WHERE id=? AND academy_id=?`).bind(studentId,academy).run();
  await env.DB.prepare(`INSERT INTO students (id,academy_id,name,grade,program,enrolled_at,status,notes) VALUES (?,?,?,?,?,?,'ACTIVE',?)`).bind(studentId,academy,'P3 성장보고서 검수','초4','MUEM','2026-09-01','자동검수 후 cleanup에서 삭제').run();
  const rows=[
    ['2026-09-03',1,90,82,84,80,78,85,'숙제를 꾸준히 수행함'],
    ['2026-09-07',1,95,86,87,84,82,88,'읽기 속도와 집중도가 좋아짐'],
    ['2026-09-11',1,100,89,90,88,86,91,'수업 참여가 안정적임']
  ];
  for(const r of rows)await env.DB.prepare(`INSERT INTO student_metrics (student_id,observed_on,attended,homework_pct,test_score,listening_score,reading_score,writing_score,concentration_score,teacher_note) VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(studentId,...r).run();
  const evidence={observations:3,attendance_rate:100,homework_avg:95,test_avg:85.7,listening_avg:87,reading_avg:84,writing_avg:82,concentration_avg:88};
  const reportText='이번 달에는 출석과 숙제 수행이 안정적으로 이어졌고, 읽기와 집중도도 조금씩 좋아졌습니다. 잘하고 있는 점은 수업 참여와 과제 습관이 꾸준하다는 점입니다. 보완할 점은 쓰기 표현을 조금 더 충분히 연습하는 것입니다. 다음 달에는 읽기에서 확인한 표현을 짧은 문장 쓰기로 연결해 정확도를 높이겠습니다. 원장실에서는 결과보다 매 수업의 작은 변화를 계속 기록하며 지도하겠습니다.';
  await env.DB.prepare(`INSERT INTO growth_reports (id,student_id,period_start,period_end,report_text,evidence_json,status) VALUES (?,?,?,?,?,?,'DRAFT')`).bind(reportId,studentId,'2026-09-01','2026-09-12',reportText,JSON.stringify(evidence)).run();
  return {ok:true,student_id:studentId,report_id:reportId,ai_calls:0};
}
