import {academyId} from './lib.js';
import {processPromoProductionRun} from './promo-engine.js';

export async function processPendingPromoRuns(env,{max_runs=3,max_items_per_run=1}={}){
  const limit=Math.max(1,Math.min(10,Number(max_runs)||3));
  const {results:runs=[]}=await env.DB.prepare(`SELECT id,status,updated_at FROM promo_production_runs WHERE academy_id=? AND status IN ('QUEUED','RUNNING','PAUSED') AND id NOT LIKE 'p3-%' ORDER BY CASE status WHEN 'RUNNING' THEN 0 WHEN 'QUEUED' THEN 1 ELSE 2 END, updated_at, created_at LIMIT ?`).bind(academyId(env),limit).all();
  const results=[];
  for(const run of runs){
    try{const out=await processPromoProductionRun(env,run.id,{max_items:max_items_per_run});results.push({run_id:run.id,ok:true,status:out.status,done_items:out.done_items,total_items:out.total_items,failed_items:out.failed_items});}
    catch(error){results.push({run_id:run.id,ok:false,error:String(error?.message||error).slice(0,500)});}
  }
  return {ok:true,checked:runs.length,results};
}
