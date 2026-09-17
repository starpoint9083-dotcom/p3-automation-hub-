import {academyId} from './lib.js';

export async function cleanupP3Fixtures(env){
  const academy=academyId(env);
  const {results:missions=[]}=await env.DB.prepare(`SELECT id FROM promo_missions WHERE academy_id=? AND target_segment LIKE 'P3 %'`).bind(academy).all();
  const missionIds=missions.map(x=>String(x.id));
  let deletedRuns=0;
  for(const missionId of missionIds){
    const {results:runs=[]}=await env.DB.prepare(`SELECT id FROM promo_production_runs WHERE academy_id=? AND mission_id=?`).bind(academy,missionId).all();
    for(const run of runs){
      await env.DB.prepare(`DELETE FROM promo_production_runs WHERE id=? AND academy_id=?`).bind(run.id,academy).run();
      deletedRuns++;
    }
  }
  const {results:assets=[]}=await env.DB.prepare(`SELECT id,object_key FROM promo_assets WHERE academy_id=? AND (purpose LIKE 'P3 %' OR mission_id IN (SELECT id FROM promo_missions WHERE academy_id=? AND target_segment LIKE 'P3 %'))`).bind(academy,academy).all();
  if(env.PROMO_ASSETS)for(const a of assets){try{await env.PROMO_ASSETS.delete(a.object_key)}catch{}}
  for(const a of assets)await env.DB.prepare(`DELETE FROM promo_assets WHERE id=? AND academy_id=?`).bind(a.id,academy).run();
  for(const m of missions){
    await env.DB.prepare(`DELETE FROM promo_posts WHERE mission_id=? AND academy_id=?`).bind(m.id,academy).run();
    await env.DB.prepare(`DELETE FROM promo_missions WHERE id=? AND academy_id=?`).bind(m.id,academy).run();
  }
  const {results:campaigns=[]}=await env.DB.prepare(`SELECT id FROM recruitment_campaigns WHERE academy_id=? AND (target_segment LIKE '배포 검증용%' OR target_segment LIKE 'P3 %')`).bind(academy).all();
  for(const c of campaigns)await env.DB.prepare(`DELETE FROM recruitment_campaigns WHERE id=? AND academy_id=?`).bind(c.id,academy).run();
  await env.DB.prepare(`DELETE FROM academy_targets WHERE academy_id=? AND (id LIKE 'e2e-%' OR segment LIKE '배포 검증용%' OR segment LIKE 'P3 %')`).bind(academy).run();
  await env.DB.prepare(`DELETE FROM students WHERE academy_id=? AND name LIKE 'P3 %'`).bind(academy).run();
  await env.DB.prepare(`DELETE FROM leads WHERE academy_id=? AND child_name LIKE 'P3 %'`).bind(academy).run();
  return {ok:true,deleted_assets:assets.length,deleted_missions:missions.length,deleted_runs:deletedRuns};
}
