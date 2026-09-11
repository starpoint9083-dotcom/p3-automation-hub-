import { readFile, writeFile } from "node:fs/promises";

const accountId=(process.env.CLOUDFLARE_ACCOUNT_ID||"").trim();
const token=(process.env.CLOUDFLARE_API_TOKEN||"").trim();
if(!accountId || !token) throw new Error("CLOUDFLARE_CREDENTIALS_REQUIRED");
const dbName=process.env.AI_OFFICE_DB_NAME || "ai-director-office-db";
const API_BASE="https://api.cloudflare.com/client/v4";
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

class CfApiError extends Error{
  constructor(message,{status=0,retryable=false}={}){super(message);this.status=status;this.retryable=retryable;}
}

async function apiOnce(path,init={}){
  let res;
  try{
    res=await fetch(`${API_BASE}${path}`,{
      ...init,
      signal:AbortSignal.timeout(15000),
      headers:{"authorization":`Bearer ${token}`,"content-type":"application/json",...(init.headers||{})}
    });
  }catch(error){
    throw new CfApiError(`CF_NETWORK:${error?.code||error?.cause?.code||error?.message||String(error)}`,{retryable:true});
  }
  const text=await res.text();
  let data;
  try{data=text?JSON.parse(text):{};}catch{data={raw:text};}
  if(!res.ok || data.success===false){
    const retryable=res.status===429||res.status>=500;
    throw new CfApiError(`CF_API_${res.status}:${JSON.stringify(data.errors||data)}`,{status:res.status,retryable});
  }
  return data;
}

async function api(path,init={},maxAttempts=5){
  let last;
  for(let attempt=1;attempt<=maxAttempts;attempt++){
    try{return await apiOnce(path,init);}
    catch(error){
      last=error;
      if(!error?.retryable||attempt===maxAttempts)throw error;
      const wait=Math.min(800*2**(attempt-1),8000);
      console.warn(`CF_API_RETRY attempt=${attempt}/${maxAttempts} wait_ms=${wait} reason=${error.message}`);
      await sleep(wait);
    }
  }
  throw last;
}

const listDb=async()=>{
  const list=await api(`/accounts/${accountId}/d1/database?name=${encodeURIComponent(dbName)}`);
  return (list.result||[]).find(x=>x.name===dbName)||null;
};

let db=await listDb();
if(!db){
  let last;
  for(let attempt=1;attempt<=4&&!db;attempt++){
    try{
      const created=await apiOnce(`/accounts/${accountId}/d1/database`,{
        method:"POST",
        body:JSON.stringify({name:dbName,primary_location_hint:"apac"})
      });
      db=created.result;
    }catch(error){
      last=error;
      if(!error?.retryable)throw error;
      const wait=Math.min(1000*2**(attempt-1),8000);
      console.warn(`CF_D1_CREATE_RETRY attempt=${attempt}/4 wait_ms=${wait} reason=${error.message}`);
      await sleep(wait);
      db=await listDb();
    }
  }
  if(!db&&last)throw last;
}
if(!db?.uuid) throw new Error("D1_UUID_MISSING");

const template=JSON.parse(await readFile(new URL("../wrangler.template.jsonc",import.meta.url),"utf8"));
template.d1_databases=[{binding:"DB",database_name:dbName,database_id:db.uuid,migrations_dir:"migrations"}];
await writeFile(new URL("../wrangler.generated.jsonc",import.meta.url),JSON.stringify(template,null,2)+"\n");
console.log(`D1_READY name=${dbName} id=${db.uuid}`);
