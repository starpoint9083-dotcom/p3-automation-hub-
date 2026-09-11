const base=(process.env.DEPLOY_URL||"").replace(/\/$/,"");
if(!base)throw new Error("DEPLOY_URL_REQUIRED");
const attempts=Number(process.env.E2E_ATTEMPTS||12);
const delay=Number(process.env.E2E_DELAY_MS||5000);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let last="";
for(let i=1;i<=attempts;i++){
  try{
    const [h,p,b]=await Promise.all([
      fetch(`${base}/health`,{cache:"no-store"}),
      fetch(`${base}/preflight`,{cache:"no-store"}),
      fetch(`${base}/api/briefing`,{cache:"no-store"})
    ]);
    const hj=await h.json();
    const pj=await p.json();
    const bj=await b.json();
    if(!(h.ok&&p.ok&&b.ok&&hj.ok&&pj.ok&&bj.ok&&hj.db&&hj.ai)){
      last=JSON.stringify({hs:h.status,ps:p.status,bs:b.status,hj,pj,bj});
      await sleep(delay);
      continue;
    }

    const a=await fetch(`${base}/api/recruitment/plan`,{
      method:"POST",
      headers:{"content-type":"application/json"},
      body:JSON.stringify({
        goal_students:1,
        target_segment:"배포 검증용 테스트 세그먼트",
        channels:["배포검증"]
      })
    });
    const aj=await a.json();
    if(a.ok&&aj.ok&&aj.data?.plan_text){
      console.log(JSON.stringify({
        ok:true,
        attempt:i,
        base,
        health:hj,
        preflight:pj,
        database_briefing:{ok:bj.ok,counts:bj.data?.counts??null},
        workers_ai:{ok:true,campaign_id:aj.data?.id??null,plan_chars:aj.data.plan_text.length}
      },null,2));
      process.exit(0);
    }
    last=JSON.stringify({ai_status:a.status,ai:aj});
  }catch(e){last=e.message;}
  await sleep(delay);
}
throw new Error(`E2E_FAILED:${last}`);
