import {bodyJson,html,HttpError,json,nowIso,sanitizePublicError} from './lib.js';
import {addMetric,briefing,createLead,createStudent,growthReport,listLeads,listRisks,recruitmentContent,recruitmentPerformance,recruitmentPlan,recruitmentTargets,recordCampaignEvent,setRecruitmentTarget,studentCard,updateLeadStage} from './services.js';
import {appHtml} from './ui.js';

const match=(path,re)=>path.match(re);

export default {async fetch(request,env){
  try{
    const url=new URL(request.url), path=url.pathname;
    if(path==='/'&&request.method==='GET')return html(appHtml());
    if((path==='/health'||path==='/healthz')&&request.method==='GET')return json({ok:true,service:'ai-director-office',version:env.APP_VERSION||'0.2.0',db:Boolean(env.DB),ai:Boolean(env.AI),timestamp:nowIso()});
    if(path==='/preflight'&&request.method==='GET'){
      const ok=Boolean(env.DB)&&Boolean(env.AI);
      return json({ok,checks:{worker:true,d1:Boolean(env.DB),workersAI:Boolean(env.AI)},version:env.APP_VERSION||'0.2.0'},ok?200:503);
    }
    if(!env.DB)throw new HttpError(503,'DB_NOT_BOUND');

    if(path==='/api/briefing'&&request.method==='GET')return json({ok:true,data:await briefing(env)});
    if(path==='/api/risks'&&request.method==='GET')return json({ok:true,data:await listRisks(env)});
    let m=match(path,/^\/api\/students\/([^/]+)$/);
    if(m&&request.method==='GET')return json({ok:true,data:await studentCard(env,decodeURIComponent(m[1]))});
    if(path==='/api/students'&&request.method==='POST')return json({ok:true,data:await createStudent(env,request)},201);
    m=match(path,/^\/api\/students\/([^/]+)\/metrics$/);
    if(m&&request.method==='POST')return json({ok:true,data:await addMetric(env,request,decodeURIComponent(m[1]))},201);
    if(path==='/api/growth-report'&&request.method==='POST')return json({ok:true,data:await growthReport(env,await bodyJson(request))},201);

    if(path==='/api/leads'&&request.method==='GET')return json({ok:true,data:await listLeads(env)});
    if(path==='/api/leads'&&request.method==='POST')return json({ok:true,data:await createLead(env,request)},201);
    m=match(path,/^\/api\/leads\/([^/]+)\/stage$/);
    if(m&&request.method==='POST')return json({ok:true,data:await updateLeadStage(env,request,decodeURIComponent(m[1]))});

    if(path==='/api/recruitment/targets'&&request.method==='GET')return json({ok:true,data:await recruitmentTargets(env)});
    if(path==='/api/recruitment/targets'&&request.method==='POST')return json({ok:true,data:await setRecruitmentTarget(env,request)},201);
    if(path==='/api/recruitment/plan'&&request.method==='POST')return json({ok:true,data:await recruitmentPlan(env,await bodyJson(request))},201);
    if(path==='/api/recruitment/content'&&request.method==='POST')return json({ok:true,data:await recruitmentContent(env,await bodyJson(request))},201);
    if(path==='/api/recruitment/event'&&request.method==='POST')return json({ok:true,data:await recordCampaignEvent(env,request)},201);
    if(path==='/api/recruitment/performance'&&request.method==='GET')return json({ok:true,data:await recruitmentPerformance(env)});

    return json({ok:false,error:'NOT_FOUND',path},404);
  }catch(error){const safe=sanitizePublicError(error);return json(safe.body,safe.status);}
}};
