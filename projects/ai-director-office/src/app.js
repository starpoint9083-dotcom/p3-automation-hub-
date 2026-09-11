import {bodyJson,HTML_HEADERS,HttpError,json,nowIso,sanitizePublicError} from './lib.js';
import {authState,isAuthConfigured,login,logout,requireAdmin} from './auth.js';
import {loginHtml} from './auth-ui.js';
import {addMetric,briefing,createLead,createStudent,growthReport,listLeads,listRisks,recruitmentContent,recruitmentPerformance,recruitmentPlan,recruitmentTargets,recordCampaignEvent,setRecruitmentTarget,studentCard,updateLeadStage} from './services.js';
import {appHtml} from './ui-v2.js';
import {CLIENT_JS} from './client-v2.js';

const match=(path,re)=>path.match(re);
const APP_HTML_HEADERS={...HTML_HEADERS,"content-security-policy":"default-src 'none'; style-src 'unsafe-inline'; script-src 'self'; connect-src 'self'; img-src 'self' data:; font-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"};
const JS_HEADERS={"content-type":"application/javascript; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff","referrer-policy":"no-referrer","strict-transport-security":"max-age=31536000; includeSubDomains"};
function securedAppHtml(csrf){
  const safe=String(csrf||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  return appHtml().replace('<meta name="csrf-token" content="">','<meta name="csrf-token" content="'+safe+'">');
}

export default {async fetch(request,env){
  try{
    const url=new URL(request.url), path=url.pathname;

    if((path==='/health'||path==='/healthz')&&request.method==='GET')return json({ok:true,service:'ai-director-office',version:env.APP_VERSION||'0.4.0',db:Boolean(env.DB),ai:Boolean(env.AI),auth:isAuthConfigured(env),timestamp:nowIso()});
    if(path==='/preflight'&&request.method==='GET'){
      const ok=Boolean(env.DB)&&Boolean(env.AI)&&isAuthConfigured(env);
      return json({ok,checks:{worker:true,d1:Boolean(env.DB),workersAI:Boolean(env.AI),adminAuth:isAuthConfigured(env)},version:env.APP_VERSION||'0.4.0'},ok?200:503);
    }

    if(path==='/auth/status'&&request.method==='GET')return json({ok:true,data:await authState(request,env)});
    if(path==='/auth/login'&&request.method==='POST')return await login(request,env);
    if(path==='/auth/logout'&&request.method==='POST')return logout();
    if(path==='/app.js'&&request.method==='GET')return new Response(CLIENT_JS,{status:200,headers:JS_HEADERS});

    if(path==='/'&&request.method==='GET'){
      const state=await authState(request,env);
      if(!state.configured)return new Response(loginHtml(false),{status:503,headers:HTML_HEADERS});
      if(!state.authenticated)return new Response(loginHtml(true),{status:200,headers:HTML_HEADERS});
      return new Response(securedAppHtml(state.csrf),{status:200,headers:APP_HTML_HEADERS});
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
