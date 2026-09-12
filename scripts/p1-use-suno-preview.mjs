import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';

const P1_BASE_URL='https://k-stella-shorts-factory.k-stella-p1.workers.dev';
const OIDC_AUDIENCE='k-stella-p1-p3-bridge';
const PART_DIR='ops/suno-preview';
const EXPECTED_SHA256='b42916af36c76599c91cfae8d8b569e5e25f398d0fe8f94ca70403227df31be3';

async function oidc(){
  const u=String(process.env.ACTIONS_ID_TOKEN_REQUEST_URL||'');
  const t=String(process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN||'');
  if(!u||!t)throw new Error('GitHub OIDC environment unavailable');
  const url=new URL(u);url.searchParams.set('audience',OIDC_AUDIENCE);
  const r=await fetch(url,{headers:{authorization:`Bearer ${t}`,accept:'application/json'},cache:'no-store'});
  const d=await r.json();if(!r.ok||!d?.value)throw new Error(`OIDC request failed ${r.status}`);return d.value;
}

const token=await oidc();
const auth={authorization:`Bearer ${token}`,accept:'application/json'};
const list=await fetch(`${P1_BASE_URL}/api/audio?status=active&kind=music`,{headers:auth,cache:'no-store'});
const listData=await list.json().catch(()=>({}));
if(!list.ok)throw new Error(`P1 audio list failed ${list.status}: ${listData?.error||''}`);
if(Array.isArray(listData?.audio)&&listData.audio.length){
  console.log(`P1 existing music asset PASS: ${listData.audio.length} active music asset(s); no duplicate preview upload.`);
  process.exit(0);
}

const names=(await fs.readdir(PART_DIR)).filter(x=>/^part_\d+\.b64$/.test(x)).sort();
if(names.length!==3)throw new Error(`Expected 3 Suno preview chunks, found ${names.length}`);
const b64=(await Promise.all(names.map(n=>fs.readFile(path.join(PART_DIR,n),'utf8')))).join('').replace(/\s+/g,'');
const bytes=Buffer.from(b64,'base64');
const sha=crypto.createHash('sha256').update(bytes).digest('hex');
if(sha!==EXPECTED_SHA256)throw new Error(`Suno preview checksum mismatch: ${sha}`);
if(bytes.length<8000||bytes.subarray(0,4).toString('ascii')!=='OggS')throw new Error('Suno preview is not a valid-sized Ogg container');

const form=new FormData();
form.set('file',new Blob([bytes],{type:'audio/ogg'}),'K_STELLA_SUNO_PREVIEW_10s.ogg');
form.set('kind','music');
form.set('mood','romantic tense mysterious');
form.set('tempo_class','fast');
form.set('bpm','120');
form.set('energy','7');
form.set('tags','romantic,tense,mysterious,drama,suno,existing_asset');
form.set('notes','Existing Suno download from user Library; 10-second low-bitrate workflow preview copy for first video verification.');
form.set('license_status','unknown');
form.set('license_note','Existing Suno download; commercial-use entitlement not verified in this workflow.');
form.set('source_url','');
const up=await fetch(`${P1_BASE_URL}/api/audio/upload`,{method:'POST',headers:{authorization:`Bearer ${token}`,accept:'application/json'},body:form});
const data=await up.json().catch(()=>({}));
if(!up.ok||!data?.audio?.id)throw new Error(`P1 Suno upload failed ${up.status}: ${data?.error||JSON.stringify(data).slice(0,500)}`);
console.log(`P1 existing Suno music uploaded: id=${data.audio.id} filename=${data.audio.filename} license=${data.audio.license_status}`);
