import fs from 'node:fs/promises';

const P1_BASE_URL='https://k-stella-shorts-factory.k-stella-p1.workers.dev';
const OIDC_AUDIENCE='k-stella-p1-p3-bridge';
const SUMMARY='p1_factory_summary.json';
const OUTPUT='p1_preview.webm';

async function oidc(){
  const u=String(process.env.ACTIONS_ID_TOKEN_REQUEST_URL||'');
  const t=String(process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN||'');
  if(!u||!t)throw new Error('GitHub OIDC environment unavailable');
  const url=new URL(u);url.searchParams.set('audience',OIDC_AUDIENCE);
  const r=await fetch(url,{headers:{authorization:`Bearer ${t}`,accept:'application/json'},cache:'no-store'});
  const d=await r.json();if(!r.ok||!d?.value)throw new Error(`OIDC request failed ${r.status}`);return d.value;
}

let summary;
try{summary=JSON.parse(await fs.readFile(SUMMARY,'utf8'));}catch{console.log('No factory summary available; preview download skipped.');process.exit(0);}
const item=[...(summary?.items||[])].reverse().find(x=>x?.ok&&x?.video_id);
if(!item?.video_id){console.log('No successful video id in factory summary; preview download skipped.');process.exit(0);}
const token=await oidc();
const r=await fetch(`${P1_BASE_URL}/rendered/${encodeURIComponent(item.video_id)}`,{headers:{authorization:`Bearer ${token}`},cache:'no-store'});
if(!r.ok)throw new Error(`Rendered preview download failed ${r.status}`);
const bytes=Buffer.from(await r.arrayBuffer());
if(bytes.length<50000)throw new Error(`Rendered preview unexpectedly small: ${bytes.length} bytes`);
await fs.writeFile(OUTPUT,bytes);
await fs.writeFile('p1_preview.json',JSON.stringify({video_id:item.video_id,slot_no:item.slot_no,project_id:item.project_id,quality_status:item.quality_status,quality_score:item.quality_score,size_bytes:bytes.length,mime_type:r.headers.get('content-type')||'video/webm'},null,2));
console.log(`P1 rendered preview downloaded: ${OUTPUT} video=${item.video_id} bytes=${bytes.length}`);
