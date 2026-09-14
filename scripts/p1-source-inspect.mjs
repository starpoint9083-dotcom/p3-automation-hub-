import zlib from 'node:zlib';
import crypto from 'node:crypto';

const base='https://raw.githubusercontent.com/starpoint9083-dotcom/k-stella-way-p1/main/src/chunks/';
const names=Array.from({length:11},(_,i)=>`index.js.gz.b64.part${String(i).padStart(2,'0')}`);
const parts=[];
for(const name of names){
  const r=await fetch(base+name,{headers:{accept:'text/plain'},cache:'no-store'});
  if(!r.ok)throw new Error(`P1 source chunk fetch failed ${r.status}: ${name}`);
  parts.push((await r.text()).trim());
}
const compressed=Buffer.from(parts.join(''),'base64');
const source=zlib.gunzipSync(compressed).toString('utf8');
const sha=crypto.createHash('sha256').update(source).digest('hex');
console.log(`P1 source assembled bytes=${Buffer.byteLength(source)} sha256=${sha}`);
const lines=source.split(/\r?\n/);
const needles=['/api/plan','/api/queue','/api/projects/','/api/video-plan','/api/lineups','ensureLineupProjects','lineup_items','createProjectPlan','recover-lineup-queues','rebuildMissingGenerationQueue'];
const printed=new Set();
for(let i=0;i<lines.length;i++){
  if(!needles.some(n=>lines[i].includes(n)))continue;
  const a=Math.max(0,i-8),b=Math.min(lines.length,i+18),key=`${a}:${b}`;
  if(printed.has(key))continue;
  printed.add(key);
  console.log(`--- CONTEXT ${i+1} ---`);
  for(let j=a;j<b;j++)console.log(`${j+1}: ${lines[j].slice(0,2000)}`);
}
