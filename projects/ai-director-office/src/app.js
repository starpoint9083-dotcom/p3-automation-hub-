import {bodyJson,html,HttpError,json,nowIso,sanitizePublicError} from './lib.js';
import {authState,isAuthConfigured,login,logout,requireAdmin} from './auth.js';
import {loginHtml} from './auth-ui.js';
import {addMetric,briefing,createLead,createStudent,growthReport,listLeads,listRisks,recruitmentContent,recruitmentPerformance,recruitmentPlan,recruitmentTargets,recordCampaignEvent,setRecruitmentTarget,studentCard,updateLeadStage} from './services.js';
import {appHtml} from './ui.js';

const match=(path,re)=>path.match(re);
function securedAppHtml(csrf){
  const token=JSON.stringify(csrf||'');
  const bridge=`<script>(function(){const csrf=${token};const raw=window.fetch.bind(window);window.fetch=function(input,init={}){const src=typeof input==='string'?input:input.url;const u=new URL(src,location.href);const method=String(init.method||(input instanceof Request?input.method:'GET')).toUpperCase();if(u.origin===location.origin&&!['GET','HEAD','OPTIONS'].includes(method)){const h=new Headers(init.headers||(input instanceof Request?input.headers:undefined));h.set('x-csrf-token',csrf);init={...init,headers:h};}return raw(input,init);};})();</script>`;
  return appHtml().replace('</head>',`${bridge}</head>`);
}

export default {async fetch(request,env){
  try{
    const url=new URL(request.url), path=url.pathname;

    if((path==='/health'||path==='/healthz')&&request.method==='GET')return json({ok:true,service:'ai-director-office',version:env.APP_VERSION||'0.3.0',db:Boolean(env.DB),ai:Boolean(env.AI),auth:isAuthConfigured(env),timestamp:nowIso()});
    if(path==='/preflight'&&request.method==='GET'){
      const ok=Boolean(env.DB)&&Boolean(env.AI)&&isAuthConfigured(env);
      return json({ok,checks:{worker:true,d1:Boolean(env.DB),workersAI:Boolean(env.AI),adminAuth:isAuthConfigured(env)},version:env.APP_VERSION||'0.3.0'},ok?200:503);
    }

    if(path==='/auth/status'&&request.method==='GET')return json({ok:true,data:await authState(request,env)});
    if(path==='/auth/login'&&request.method==='POST')return await login(request,env);
    if(path==='/auth/logout'&&request.method==='POST')return logout();

    if(path==='/'&&request.method==='GET'){
      const state=await authState(request,env);
      if(!state.configured)return html(loginHtml(false),503);
      if(!state.authenticated)return html(loginHtml(true));
      return html(securedAppHtml(state.csrf));
    }

    if(!env.DB)throw new HttpError(503,'DB_NOT_BOUND');
    if(path.startsWith('/api/'))await requireAdmin(request,env,{mutation:!['GET','HEAD'].includes(request.method)});

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
