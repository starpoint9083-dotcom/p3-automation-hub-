const base=(process.env.DEPLOY_URL||"").replace(/\/$/,"");
if(!base)throw new Error("DEPLOY_URL_REQUIRED");
const attempts=Number(process.env.E2E_ATTEMPTS||12);
const delay=Number(process.env.E2E_DELAY_MS||5000);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let last="";
for(let i=1;i<=attempts;i++){
  try{
    const [h,p]=await Promise.all([fetch(`${base}/health`,{cache:"no-store"}),fetch(`${base}/preflight`,{cache:"no-store"})]);
    const hj=await h.json();const pj=await p.json();
    if(h.ok&&p.ok&&hj.ok&&pj.ok&&hj.db&&hj.ai){console.log(JSON.stringify({ok:true,attempt:i,base,health:hj,preflight:pj},null,2));process.exit(0);}
    last=JSON.stringify({hs:h.status,ps:p.status,hj,pj});
  }catch(e){last=e.message;}
  await sleep(delay);
}
throw new Error(`E2E_FAILED:${last}`);
