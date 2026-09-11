const P1_BASE_URL=(process.env.P1_BASE_URL||'https://k-stella-shorts-factory.k-stella-p1.workers.dev').replace(/\/$/,'');
const OIDC_AUDIENCE='k-stella-p1-p3-bridge';
if(new URL(P1_BASE_URL).hostname!=='k-stella-shorts-factory.k-stella-p1.workers.dev')throw new Error('P1_BASE_URL host is not allowlisted.');

async function oidc(){
  const requestUrl=String(process.env.ACTIONS_ID_TOKEN_REQUEST_URL||''),requestToken=String(process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN||'');
  if(!requestUrl||!requestToken)throw new Error('GitHub OIDC environment is unavailable.');
  const url=new URL(requestUrl);url.searchParams.set('audience',OIDC_AUDIENCE);
  const r=await fetch(url,{headers:{accept:'application/json',authorization:`Bearer ${requestToken}`},cache:'no-store'}),d=await r.json().catch(()=>({}));
  if(!r.ok||!d?.value)throw new Error(`OIDC token request failed (${r.status}).`);return String(d.value);
}
function cookieFrom(setCookie){const m=String(setCookie||'').match(/(?:^|[,;]\s*)kstella_session=([^;,\s]+)/);if(!m)throw new Error('P1 session cookie missing.');return `kstella_session=${m[1]}`;}
const token=await oidc();
const sr=await fetch(`${P1_BASE_URL}/api/session`,{method:'POST',headers:{accept:'application/json',authorization:`Bearer ${token}`},cache:'no-store'}),sd=await sr.json().catch(()=>({}));
if(!sr.ok||!sd?.ok)throw new Error(`P1 session exchange failed (${sr.status}).`);
const cookie=cookieFrom(sr.headers.get('set-cookie'));

async function api(path){const r=await fetch(new URL(path,`${P1_BASE_URL}/`),{headers:{accept:'application/json',cookie},cache:'no-store'});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(`GET ${path} failed (${r.status}): ${d?.error||'unknown'}`);return d;}

const latest=await api('/api/lineups/latest');
const items=Array.isArray(latest?.items)?latest.items:[];
if(!latest?.lineup?.id||items.length!==10)throw new Error(`Latest lineup is not ready: items=${items.length}`);

const selected=[];
for(const item of items){
  const projectId=String(item?.project_id||'');if(!projectId)continue;
  const p=await api(`/api/projects/${encodeURIComponent(projectId)}`);
  for(const scene of (Array.isArray(p?.scenes)?p.scenes:[])){
    const key=String(scene?.asset_object_key||'');
    if(scene?.selected_asset_id&&key)selected.push({project_id:projectId,scene_no:Number(scene.scene_no||0),asset_id:Number(scene.selected_asset_id),key});
  }
}
const unique=[...new Map(selected.map(x=>[x.key,x])).values()];
console.log(`MEDIA_AUDIT lineup=${latest.lineup.id} selected_scenes=${selected.length} unique_keys=${unique.length}`);

let storage={};
try{storage=await api('/api/storage/audit');console.log(`MEDIA_AUDIT storage_objects=${Number(storage?.r2_objects||0)} db_references=${Number(storage?.db_references||0)} missing_references=${Number(storage?.missing_count||0)} orphan_count=${Number(storage?.orphan_count||0)}`);}catch(e){console.log(`MEDIA_AUDIT storage_audit_warning=${String(e?.message||e).slice(0,500)}`);}

const results=[];
const concurrency=8;
for(let i=0;i<unique.length;i+=concurrency){
  const batch=unique.slice(i,i+concurrency);
  const out=await Promise.all(batch.map(async row=>{
    const url=new URL(`/media/${encodeURIComponent(row.key)}`,`${P1_BASE_URL}/`);
    try{
      const r=await fetch(url,{method:'HEAD',headers:{cookie},cache:'no-store',redirect:'manual'});
      return {...row,status:r.status,ok:r.ok,content_type:r.headers.get('content-type')||''};
    }catch(e){return {...row,status:0,ok:false,error:String(e?.message||e).slice(0,300)};}
  }));
  results.push(...out);
}
const present=results.filter(x=>x.ok),missing=results.filter(x=>!x.ok);
const missingSet=new Set(missing.map(x=>x.key));
const affectedScenes=selected.filter(x=>missingSet.has(x.key));
console.log(`MEDIA_AUDIT result present_keys=${present.length} missing_keys=${missing.length} affected_scenes=${affectedScenes.length}`);
if(missing.length)console.log(`MEDIA_AUDIT missing_sample=${JSON.stringify(missing.slice(0,30))}`);
if(affectedScenes.length)console.log(`MEDIA_AUDIT affected_sample=${JSON.stringify(affectedScenes.slice(0,30))}`);
if(missing.length)throw new Error(`P1 pre-render media audit failed: ${missing.length}/${unique.length} selected media keys are unavailable; affected_scenes=${affectedScenes.length}`);
console.log('MEDIA_AUDIT PASS: every selected scene asset is readable through the live authenticated /media route.');
