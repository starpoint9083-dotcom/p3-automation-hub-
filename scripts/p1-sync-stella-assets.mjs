import fs from 'node:fs';
import path from 'node:path';

const P1_BASE_URL=(process.env.P1_BASE_URL||'https://k-stella-shorts-factory.k-stella-p1.workers.dev').replace(/\/$/,'');
const OIDC_AUDIENCE='k-stella-p1-p3-bridge';
const SEED_DIR=process.env.P1_STELLA_ASSET_DIR||'/tmp/kstella-seed';
const SUMMARY=process.env.P1_ASSET_SYNC_SUMMARY||'p1_asset_sync_summary.json';
if(new URL(P1_BASE_URL).hostname!=='k-stella-shorts-factory.k-stella-p1.workers.dev')throw new Error('P1_BASE_URL host is not allowlisted.');

async function oidc(){
  const ru=String(process.env.ACTIONS_ID_TOKEN_REQUEST_URL||''),rt=String(process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN||'');
  if(!ru||!rt)throw new Error('GitHub OIDC environment is unavailable.');
  const u=new URL(ru);u.searchParams.set('audience',OIDC_AUDIENCE);
  const r=await fetch(u,{headers:{accept:'application/json',authorization:`Bearer ${rt}`},cache:'no-store'});
  const d=await r.json().catch(()=>({}));
  if(!r.ok||!d?.value)throw new Error(`OIDC token request failed (${r.status}).`);
  return String(d.value);
}
function sessionCookie(h){const m=String(h||'').match(/(?:^|[,;]\s*)kstella_session=([^;,\s]+)/);if(!m)throw new Error('P1 session cookie missing.');return `kstella_session=${m[1]}`;}
const token=await oidc();
const session=await fetch(`${P1_BASE_URL}/api/session`,{method:'POST',headers:{accept:'application/json',authorization:`Bearer ${token}`},cache:'no-store'});
const sd=await session.json().catch(()=>({}));
if(!session.ok||!sd?.ok)throw new Error(`P1 OIDC session exchange failed (${session.status}).`);
const ck=sessionCookie(session.headers.get('set-cookie'));

async function jsonApi(route,{method='GET',body}={}){
  const headers={accept:'application/json',cookie:ck};
  if(body!==undefined)headers['content-type']='application/json';
  const r=await fetch(new URL(route,`${P1_BASE_URL}/`),{method,headers,body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});
  const text=await r.text();let d;try{d=JSON.parse(text)}catch{d={raw:text.slice(0,1000)}}
  if(!r.ok||d?.ok===false)throw new Error(`${method} ${route} failed (${r.status}): ${d?.error||JSON.stringify(d)}`);
  return d;
}
async function upload(entry){
  const filePath=path.resolve(SEED_DIR,entry.path);
  if(!filePath.startsWith(path.resolve(SEED_DIR)+path.sep))throw new Error(`Unsafe asset path: ${entry.path}`);
  const bytes=fs.readFileSync(filePath);
  if(bytes.length<1000)throw new Error(`Asset too small: ${entry.path}`);
  const fd=new FormData();
  fd.append('file',new Blob([bytes],{type:'image/jpeg'}),path.basename(filePath));
  fd.append('character_role',String(entry.role||''));
  fd.append('character_name',String(entry.name||''));
  fd.append('tags',(entry.tags||[]).join(','));
  fd.append('source','imported');
  fd.append('notes',String(entry.notes||'KSTELLA_STYLE_LOCK_V1 imported approved asset'));
  const r=await fetch(`${P1_BASE_URL}/api/assets/upload`,{method:'POST',headers:{accept:'application/json',cookie:ck},body:fd,cache:'no-store'});
  const text=await r.text();let d;try{d=JSON.parse(text)}catch{d={raw:text.slice(0,1000)}}
  if(!r.ok||d?.ok===false||!d?.asset?.id)throw new Error(`asset upload failed ${entry.path} (${r.status}): ${d?.error||JSON.stringify(d)}`);
  const id=Number(d.asset.id);
  // Duplicate uploads may point to an older row. Force the approved metadata every time.
  await jsonApi('/api/assets/update',{method:'POST',body:{id,character_role:entry.role||'',character_name:entry.name||'',tags:(entry.tags||[]).join(','),notes:entry.notes||'KSTELLA_STYLE_LOCK_V1 imported approved asset',source:'imported'}});
  if(entry.reference)await jsonApi('/api/assets/reference',{method:'POST',body:{id,value:true}});
  return {id,duplicate:Boolean(d.duplicate),path:entry.path,role:entry.role,name:entry.name,reference:Boolean(entry.reference),bytes:bytes.length};
}

const manifestPath=path.join(SEED_DIR,'manifest.json');
if(!fs.existsSync(manifestPath))throw new Error(`Missing manifest: ${manifestPath}`);
const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
if(manifest?.policy?.style!=='K 스텔라 웨이 캐릭터풍')throw new Error('Seed style policy mismatch.');
if(manifest?.policy?.never_guess_missing_reference!==true)throw new Error('Seed must prohibit guessing missing references.');
const entries=[...(manifest.references||[]),...(manifest.scenes||[])];
if(!entries.length)throw new Error('No approved assets in seed.');
const allowedRoles=new Set(['남주','여주','남주 친구','여주 친구','새로운 남자']);
for(const e of entries)if(!allowedRoles.has(String(e.role||'')))throw new Error(`Unapproved character role in seed: ${e.role}`);

const uploaded=[];
for(const entry of entries){
  const row=await upload(entry);uploaded.push(row);
  console.log(`ASSET_SYNC role=${row.role} reference=${row.reference?1:0} id=${row.id} duplicate=${row.duplicate?1:0} file=${row.path}`);
}

const live=await jsonApi('/api/assets?status=active');
const assets=Array.isArray(live?.assets)?live.assets:[];
const requiredRefs=['남주','여주','남주 친구','여주 친구'];
const refCounts={};
for(const r of ['남주','여주','남주 친구','여주 친구','새로운 남자'])refCounts[r]=assets.filter(a=>Number(a.is_reference||0)===1&&String(a.character_role||'')===r).length;
for(const role of requiredRefs)if(refCounts[role]<1)throw new Error(`Reference sync verification failed: ${role}=0`);
// The 2026-09-07 #3 new-man face was explicitly rejected by the user. Never auto-promote it.
const unresolved=Array.isArray(manifest.unresolved)?manifest.unresolved:[];
const newManUnresolved=unresolved.some(x=>x.role==='새로운 남자');
if(newManUnresolved&&refCounts['새로운 남자']>0)console.log('NOTICE: a pre-existing new-man reference exists; this sync did not create one. Review before use.');

const summary={ok:true,seed_version:manifest.version||'',style:manifest.policy.style,uploaded_count:uploaded.length,uploaded,reference_counts:refCounts,unresolved,catalog_only:manifest.catalog_only||{},existing_active_assets:assets.length,finished_at:new Date().toISOString()};
fs.writeFileSync(SUMMARY,JSON.stringify(summary,null,2));
console.log(`ASSET_SYNC_COMPLETE uploaded=${uploaded.length} refs=${JSON.stringify(refCounts)} unresolved=${unresolved.map(x=>x.role).join(',')||'none'}`);
