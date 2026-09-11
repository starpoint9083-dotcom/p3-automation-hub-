const base=(process.env.DEPLOY_URL||"").replace(/\/$/,"");
const adminPassword=process.env.ADMIN_PASSWORD||"";
if(!base)throw new Error("DEPLOY_URL_REQUIRED");
if(adminPassword.length<12)throw new Error("ADMIN_PASSWORD_REQUIRED");

const attempts=Number(process.env.E2E_ATTEMPTS||8);
const delay=Number(process.env.E2E_DELAY_MS||4000);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const timedFetch=(url,opt={},ms=15000)=>fetch(url,{...opt,signal:AbortSignal.timeout(ms)});
const j=async(res)=>({status:res.status,ok:res.ok,body:await res.json().catch(()=>null),headers:res.headers});
const origin=new URL(base).origin;

async function waitUntilReady(){
  let last="";
  for(let i=1;i<=attempts;i++){
    try{
      const [rootRes,hRes,pRes,statusRes]=await Promise.all([
        timedFetch(`${base}/`,{cache:"no-store"},10000),
        timedFetch(`${base}/health`,{cache:"no-store"},10000),
        timedFetch(`${base}/preflight`,{cache:"no-store"},10000),
        timedFetch(`${base}/auth/status`,{cache:"no-store"},10000)
      ]);
      const root=await rootRes.text(), h=await j(hRes), p=await j(pRes), status=await j(statusRes);
      const ready=rootRes.ok&&root.includes("관리자 로그인")&&h.ok&&p.ok&&status.ok&&h.body?.ok&&p.body?.ok&&status.body?.ok&&h.body?.db&&h.body?.ai&&h.body?.auth&&h.body?.version==="0.3.0"&&status.body?.data?.configured===true&&status.body?.data?.authenticated===false;
      if(ready)return {attempt:i,health:h.body,preflight:p.body};
      last=JSON.stringify({root:rootRes.status,h:h.body,p:p.body,status:status.body});
    }catch(e){last=e?.message||String(e);}
    if(i<attempts)await sleep(delay);
  }
  throw new Error(`READINESS_FAILED:${last}`);
}

const ready=await waitUntilReady();

const unauth=await j(await timedFetch(`${base}/api/briefing`,{cache:"no-store"},10000));
if(unauth.status!==401||unauth.body?.error!=="AUTH_REQUIRED")throw new Error(`UNAUTH_GUARD_FAILED:${JSON.stringify(unauth.body)}`);

const badLogin=await j(await timedFetch(`${base}/auth/login`,{
  method:"POST",headers:{"content-type":"application/json","origin":origin},body:JSON.stringify({password:`${adminPassword}-wrong`})
},10000));
if(badLogin.status!==401||badLogin.body?.error!=="INVALID_CREDENTIALS")throw new Error(`BAD_LOGIN_GUARD_FAILED:${JSON.stringify(badLogin.body)}`);

const loginRes=await timedFetch(`${base}/auth/login`,{
  method:"POST",headers:{"content-type":"application/json","origin":origin},body:JSON.stringify({password:adminPassword})
},10000);
const login=await j(loginRes);
const setCookie=loginRes.headers.get('set-cookie')||'';
const cookie=setCookie.split(';')[0];
const csrf=login.body?.data?.csrf||'';
if(!(login.ok&&login.body?.ok&&cookie.startsWith('__Host-aiod_session=')&&csrf))throw new Error(`LOGIN_FAILED:${JSON.stringify(login.body)}`);

const authHeaders={cookie};
const writeHeaders={cookie,"x-csrf-token":csrf,"content-type":"application/json","origin":origin};

const status=await j(await timedFetch(`${base}/auth/status`,{headers:authHeaders,cache:"no-store"},10000));
if(!(status.ok&&status.body?.data?.authenticated&&status.body?.data?.csrf===csrf))throw new Error(`SESSION_STATUS_FAILED:${JSON.stringify(status.body)}`);

const appRes=await timedFetch(`${base}/`,{headers:authHeaders,cache:"no-store"},10000);
const appText=await appRes.text();
if(!(appRes.ok&&appText.includes("오늘 가장 먼저 할 일 3가지")&&appText.includes("x-csrf-token")))throw new Error(`AUTH_UI_FAILED:${appRes.status}`);

const briefing=await j(await timedFetch(`${base}/api/briefing`,{headers:authHeaders,cache:"no-store"},15000));
if(!(briefing.ok&&briefing.body?.ok))throw new Error(`BRIEFING_FAILED:${JSON.stringify(briefing.body)}`);

const noCsrf=await j(await timedFetch(`${base}/api/recruitment/targets`,{
  method:"POST",headers:{cookie,"content-type":"application/json","origin":origin},body:JSON.stringify({id:"e2e-csrf-block",segment:"차단검증",program:"MUEM",capacity:1,active_students:0,desired_new_students:1})
},10000));
if(noCsrf.status!==403||noCsrf.body?.error!=="CSRF_REJECTED")throw new Error(`CSRF_GUARD_FAILED:${JSON.stringify(noCsrf.body)}`);

const target=await j(await timedFetch(`${base}/api/recruitment/targets`,{
  method:"POST",headers:writeHeaders,
  body:JSON.stringify({id:"e2e-target",segment:"배포 검증용",program:"MUEM",capacity:1,active_students:0,desired_new_students:1,priority:0})
},15000));
if(!(target.ok&&target.body?.ok&&target.body?.data?.open_seats===1))throw new Error(`TARGET_FAILED:${JSON.stringify(target.body)}`);

const targets=await j(await timedFetch(`${base}/api/recruitment/targets`,{headers:authHeaders,cache:"no-store"},15000));
if(!(targets.ok&&targets.body?.ok&&Array.isArray(targets.body?.data)&&targets.body.data.some(x=>x.id==="e2e-target")))throw new Error(`TARGET_READ_FAILED:${JSON.stringify(targets.body)}`);

const plan=await j(await timedFetch(`${base}/api/recruitment/plan`,{
  method:"POST",headers:writeHeaders,
  body:JSON.stringify({goal_students:1,target_segment:"배포 검증용 테스트 세그먼트",channels:["배포검증"]})
},60000));
const campaign=plan.body?.data;
if(!(plan.ok&&plan.body?.ok&&campaign?.id&&campaign?.plan_text))throw new Error(`PLAN_FAILED:${JSON.stringify(plan.body)}`);

const content=await j(await timedFetch(`${base}/api/recruitment/content`,{
  method:"POST",headers:writeHeaders,
  body:JSON.stringify({campaign_id:campaign.id,channel:"배포검증",purpose:"상담 예약 유도 테스트"})
},60000));
if(!(content.ok&&content.body?.ok&&content.body?.data?.body&&content.body?.data?.tracking_code))throw new Error(`CONTENT_FAILED:${JSON.stringify(content.body)}`);

const perf=await j(await timedFetch(`${base}/api/recruitment/performance`,{headers:authHeaders,cache:"no-store"},15000));
if(!(perf.ok&&perf.body?.ok&&Array.isArray(perf.body?.data?.campaigns)&&perf.body.data.campaigns.some(x=>x.id===campaign.id)))throw new Error(`PERFORMANCE_FAILED:${JSON.stringify(perf.body)}`);

console.log(JSON.stringify({
  ok:true,
  readiness_attempt:ready.attempt,
  base,
  security:{admin_auth:true,unauth_blocked:true,bad_password_blocked:true,signed_session:true,csrf_blocked:true},
  ui:{ok:true,title:"AI 원장실",authenticated:true},
  health:ready.health,
  preflight:ready.preflight,
  database_briefing:{ok:true,counts:briefing.body?.data?.counts??null},
  recruitment_target:{ok:true,id:target.body.data.id,open_seats:target.body.data.open_seats},
  workers_ai:{ok:true,campaign_id:campaign.id,plan_chars:campaign.plan_text.length,content_chars:content.body.data.body.length},
  performance:{ok:true,campaign_visible:true}
},null,2));
