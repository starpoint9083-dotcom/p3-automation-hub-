import fs from 'node:fs/promises';

const P1_BASE_URL='https://k-stella-shorts-factory.k-stella-p1.workers.dev';
const OIDC_AUDIENCE='k-stella-p1-p3-bridge';

const refs=[
  {
    path:'assets/p1-references/KSTELLA_REF_남주_별의전설.jpg',
    filename:'KSTELLA_REF_남주_별의전설.jpg',
    role:'남주',
    name:'별의전설',
    tags:'KSTELLA_STYLE_LOCK_V1,K 스텔라 웨이,캐릭터풍,남주,별의전설,MASTER_REFERENCE',
    notes:'K 스텔라 웨이 공식 MASTER CHARACTER 기준 얼굴 reference. Library 원본은 보존하고 연결용 사본만 등록.'
  },
  {
    path:'assets/p1-references/KSTELLA_REF_여주_궁합여주.jpg',
    filename:'KSTELLA_REF_여주_궁합여주.jpg',
    role:'여주',
    name:'궁합여주',
    tags:'KSTELLA_STYLE_LOCK_V1,K 스텔라 웨이,캐릭터풍,여주,궁합여주,MASTER_REFERENCE',
    notes:'K 스텔라 웨이 여주 단독 기준컷 reference. Library 원본은 보존하고 연결용 사본만 등록.'
  }
];

async function oidc(){
  const u=String(process.env.ACTIONS_ID_TOKEN_REQUEST_URL||'');
  const t=String(process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN||'');
  if(!u||!t)throw new Error('GitHub OIDC environment unavailable');
  const url=new URL(u);url.searchParams.set('audience',OIDC_AUDIENCE);
  const r=await fetch(url,{headers:{authorization:`Bearer ${t}`,accept:'application/json'},cache:'no-store'});
  const d=await r.json().catch(()=>({}));
  if(!r.ok||!d?.value)throw new Error(`OIDC request failed ${r.status}`);
  return d.value;
}

async function jsonFetch(url,opts={}){
  const r=await fetch(url,{cache:'no-store',...opts});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(`${opts.method||'GET'} ${url} failed ${r.status}: ${d?.error||JSON.stringify(d).slice(0,500)}`);
  return d;
}

function rowsFrom(d){
  if(Array.isArray(d?.assets))return d.assets;
  if(Array.isArray(d?.results))return d.results;
  if(Array.isArray(d?.rows))return d.rows;
  return [];
}

const token=await oidc();
const auth={authorization:`Bearer ${token}`,accept:'application/json'};

async function listActive(){
  const d=await jsonFetch(`${P1_BASE_URL}/api/assets?status=active`,{headers:auth});
  return rowsFrom(d);
}

async function ensureReference(spec){
  let assets=await listActive();
  let asset=assets.find(a=>String(a?.filename||'')===spec.filename && String(a?.character_role||'')===spec.role);
  if(!asset){
    const bytes=await fs.readFile(spec.path);
    if(bytes.length<10000)throw new Error(`${spec.filename} is unexpectedly small: ${bytes.length}`);
    const form=new FormData();
    form.set('file',new Blob([bytes],{type:'image/jpeg'}),spec.filename);
    form.set('character_role',spec.role);
    form.set('character_name',spec.name);
    form.set('location','');
    form.set('emotion','neutral');
    form.set('action','reference');
    form.set('framing','portrait');
    form.set('composition','single character master reference');
    form.set('tags',spec.tags);
    form.set('source','library-approved-reference');
    form.set('notes',spec.notes);
    const up=await jsonFetch(`${P1_BASE_URL}/api/assets/upload`,{
      method:'POST',
      headers:auth,
      body:form
    });
    asset=up?.asset||up?.row||up?.data?.asset||null;
    if(!asset?.id)throw new Error(`P1 reference upload returned no asset id for ${spec.filename}: ${JSON.stringify(up).slice(0,800)}`);
    console.log(`REFERENCE_UPLOAD role=${spec.role} id=${asset.id} filename=${spec.filename}`);
  }else{
    console.log(`REFERENCE_REUSE role=${spec.role} id=${asset.id} filename=${spec.filename}`);
  }

  if(Number(asset?.is_reference)!==1 && asset?.is_reference!==true){
    const mark=await jsonFetch(`${P1_BASE_URL}/api/assets/reference`,{
      method:'POST',
      headers:{...auth,'content-type':'application/json'},
      body:JSON.stringify({id:asset.id,value:true})
    });
    console.log(`REFERENCE_MARK role=${spec.role} id=${asset.id} ok=${Boolean(mark?.ok??true)}`);
  }
  return Number(asset.id);
}

const ids=[];
for(const spec of refs)ids.push(await ensureReference(spec));

const finalAssets=await listActive();
const verified=[];
for(let i=0;i<refs.length;i++){
  const spec=refs[i],id=ids[i];
  const a=finalAssets.find(x=>Number(x?.id)===id || (String(x?.filename||'')===spec.filename&&String(x?.character_role||'')===spec.role));
  const isRef=a&&(Number(a?.is_reference)===1||a?.is_reference===true);
  if(!isRef)throw new Error(`Reference verification failed for ${spec.role} id=${id}`);
  if(String(a?.character_role||'')!==spec.role)throw new Error(`Reference role mismatch for id=${id}: ${a?.character_role}`);
  verified.push({role:spec.role,name:spec.name,id:Number(a.id),filename:a.filename,is_reference:1});
}

const totalRefs=finalAssets.filter(a=>Number(a?.is_reference)===1||a?.is_reference===true);
console.log(`REFERENCE_IMPORT_PASS imported_or_reused=${verified.length} live_reference_total=${totalRefs.length}`);
for(const v of verified)console.log(`REFERENCE_VERIFIED role=${v.role} name=${v.name} id=${v.id} filename=${v.filename}`);
