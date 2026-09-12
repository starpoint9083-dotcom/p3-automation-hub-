const P1_BASE_URL=(process.env.P1_BASE_URL||'https://k-stella-shorts-factory.k-stella-p1.workers.dev').replace(/\/$/,'');
const OIDC_AUDIENCE='k-stella-p1-p3-bridge';
if(new URL(P1_BASE_URL).hostname!=='k-stella-shorts-factory.k-stella-p1.workers.dev')throw new Error('P1_BASE_URL host is not allowlisted.');
async function oidc(){const ru=String(process.env.ACTIONS_ID_TOKEN_REQUEST_URL||''),rt=String(process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN||'');if(!ru||!rt)throw new Error('GitHub OIDC environment is unavailable.');const u=new URL(ru);u.searchParams.set('audience',OIDC_AUDIENCE);const r=await fetch(u,{headers:{accept:'application/json',authorization:`Bearer ${rt}`},cache:'no-store'}),d=await r.json().catch(()=>({}));if(!r.ok||!d?.value)throw new Error(`OIDC token request failed (${r.status}).`);return String(d.value)}
function cookie(h){const m=String(h||'').match(/(?:^|[,;]\s*)kstella_session=([^;,\s]+)/);if(!m)throw new Error('P1 session cookie missing.');return `kstella_session=${m[1]}`}
const token=await oidc();
const s=await fetch(`${P1_BASE_URL}/api/session`,{method:'POST',headers:{accept:'application/json',authorization:`Bearer ${token}`},cache:'no-store'}),sd=await s.json().catch(()=>({}));if(!s.ok||!sd?.ok)throw new Error(`P1 OIDC session exchange failed (${s.status}).`);const ck=cookie(s.headers.get('set-cookie'));
async function api(path){const r=await fetch(new URL(path,`${P1_BASE_URL}/`),{headers:{accept:'application/json',cookie:ck},cache:'no-store'}),t=await r.text();let d;try{d=JSON.parse(t)}catch{d={raw:t.slice(0,1000)}}if(!r.ok)throw new Error(`GET ${path} failed (${r.status}): ${d?.error||JSON.stringify(d)}`);return d}
const data=await api('/api/assets?status=active');
const assets=Array.isArray(data?.assets)?data.assets:Array.isArray(data?.items)?data.items:Array.isArray(data)?data:[];
const clean=a=>({id:a.id,filename:a.filename||'',is_reference:Number(a.is_reference||0),character_role:a.character_role||'',character_name:a.character_name||'',tags:a.tags||'',notes:a.notes||'',source_type:a.source_type||'',status:a.status||'',object_key:a.object_key||''});
const refs=assets.filter(a=>Number(a?.is_reference||0)===1);
console.log(`REFERENCE_ASSET_DIAG active=${assets.length} references=${refs.length}`);
for(const a of refs)console.log('REFERENCE_ASSET '+JSON.stringify(clean(a)));
const groups=new Map();for(const a of refs){const k=`${a.character_role||'(none)'}|${a.character_name||'(none)'}`;groups.set(k,(groups.get(k)||0)+1)}
for(const [k,n] of [...groups.entries()].sort())console.log(`REFERENCE_GROUP ${k} count=${n}`);
const stella=assets.filter(a=>/stella|스텔라|별의전설|궁합여주|남주|여주|보조/i.test([a.character_role,a.character_name,a.tags,a.notes,a.filename].filter(Boolean).join(' ')));
console.log(`STELLA_CANDIDATE_DIAG count=${stella.length}`);
for(const a of stella.slice(0,200))console.log('STELLA_CANDIDATE '+JSON.stringify(clean(a)));
