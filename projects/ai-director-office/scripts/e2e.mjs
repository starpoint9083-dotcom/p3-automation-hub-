const base=(process.env.DEPLOY_URL||"").replace(/\/$/,"");
if(!base)throw new Error("DEPLOY_URL_REQUIRED");

const attempts=Number(process.env.E2E_ATTEMPTS||12);
const delay=Number(process.env.E2E_DELAY_MS||5000);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const timedFetch=(url,opt={},ms=15000)=>fetch(url,{...opt,signal:AbortSignal.timeout(ms)});
const j=async(res)=>({status:res.status,ok:res.ok,body:await res.json().catch(()=>null)});

async function waitUntilReady(){
  let last="";
  for(let i=1;i<=attempts;i++){
    try{
      const [rootRes,hRes,pRes,bRes]=await Promise.all([
        timedFetch(`${base}/`,{cache:"no-store"},10000),
        timedFetch(`${base}/health`,{cache:"no-store"},10000),
        timedFetch(`${base}/preflight`,{cache:"no-store"},10000),
        timedFetch(`${base}/api/briefing`,{cache:"no-store"},10000)
      ]);
      const root=await rootRes.text();
      const h=await j(hRes), p=await j(pRes), b=await j(bRes);
      const ready=rootRes.ok&&root.includes("AI 원장실")&&h.ok&&p.ok&&b.ok&&h.body?.ok&&p.body?.ok&&b.body?.ok&&h.body?.db&&h.body?.ai&&h.body?.version==="0.2.0";
      if(ready)return {attempt:i,health:h.body,preflight:p.body,briefing:b.body};
      last=JSON.stringify({root:rootRes.status,h,p,b,version:h.body?.version});
    }catch(e){last=e?.message||String(e);}
    if(i<attempts)await sleep(delay);
  }
  throw new Error(`READINESS_FAILED:${last}`);
}

const ready=await waitUntilReady();

const target=await j(await timedFetch(`${base}/api/recruitment/targets`,{
  method:"POST",
  headers:{"content-type":"application/json"},
  body:JSON.stringify({id:"e2e-target",segment:"배포 검증용",program:"MUEM",capacity:1,active_students:0,desired_new_students:1,priority:0})
},15000));
if(!(target.ok&&target.body?.ok&&target.body?.data?.open_seats===1))throw new Error(`TARGET_FAILED:${JSON.stringify(target)}`);

const targets=await j(await timedFetch(`${base}/api/recruitment/targets`,{cache:"no-store"},15000));
if(!(targets.ok&&targets.body?.ok&&Array.isArray(targets.body?.data)&&targets.body.data.some(x=>x.id==="e2e-target")))throw new Error(`TARGET_READ_FAILED:${JSON.stringify(targets)}`);

const plan=await j(await timedFetch(`${base}/api/recruitment/plan`,{
  method:"POST",
  headers:{"content-type":"application/json"},
  body:JSON.stringify({goal_students:1,target_segment:"배포 검증용 테스트 세그먼트",channels:["배포검증"]})
},60000));
const campaign=plan.body?.data;
if(!(plan.ok&&plan.body?.ok&&campaign?.id&&campaign?.plan_text))throw new Error(`PLAN_FAILED:${JSON.stringify(plan)}`);

const content=await j(await timedFetch(`${base}/api/recruitment/content`,{
  method:"POST",
  headers:{"content-type":"application/json"},
  body:JSON.stringify({campaign_id:campaign.id,channel:"배포검증",purpose:"상담 예약 유도 테스트"})
},60000));
if(!(content.ok&&content.body?.ok&&content.body?.data?.body&&content.body?.data?.tracking_code))throw new Error(`CONTENT_FAILED:${JSON.stringify(content)}`);

const perf=await j(await timedFetch(`${base}/api/recruitment/performance`,{cache:"no-store"},15000));
if(!(perf.ok&&perf.body?.ok&&Array.isArray(perf.body?.data?.campaigns)&&perf.body.data.campaigns.some(x=>x.id===campaign.id)))throw new Error(`PERFORMANCE_FAILED:${JSON.stringify(perf)}`);

console.log(JSON.stringify({
  ok:true,
  readiness_attempt:ready.attempt,
  base,
  ui:{ok:true,title:"AI 원장실"},
  health:ready.health,
  preflight:ready.preflight,
  database_briefing:{ok:true,counts:ready.briefing?.data?.counts??null},
  recruitment_target:{ok:true,id:target.body.data.id,open_seats:target.body.data.open_seats},
  workers_ai:{ok:true,campaign_id:campaign.id,plan_chars:campaign.plan_text.length,content_chars:content.body.data.body.length},
  performance:{ok:true,campaign_visible:true}
},null,2));
