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
