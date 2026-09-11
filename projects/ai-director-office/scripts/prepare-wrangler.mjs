import { readFile, writeFile } from "node:fs/promises";

const accountId=(process.env.CLOUDFLARE_ACCOUNT_ID||"").trim();
const token=(process.env.CLOUDFLARE_API_TOKEN||"").trim();
if(!accountId || !token) throw new Error("CLOUDFLARE_CREDENTIALS_REQUIRED");
const dbName=process.env.AI_OFFICE_DB_NAME || "ai-director-office-db";

const api=async(path,init={})=>{
  const res=await fetch(`https://api.cloudflare.com/client/v4${path}`,{
    ...init,
    headers:{"authorization":`Bearer ${token}`,"content-type":"application/json",...(init.headers||{})}
  });
  const data=await res.json();
  if(!res.ok || data.success===false) throw new Error(`CF_API_${res.status}:${JSON.stringify(data.errors||data)}`);
  return data;
};

let list=await api(`/accounts/${accountId}/d1/database?name=${encodeURIComponent(dbName)}`);
let db=(list.result||[]).find(x=>x.name===dbName);
if(!db){
  const created=await api(`/accounts/${accountId}/d1/database`,{
    method:"POST",
    body:JSON.stringify({name:dbName,primary_location_hint:"apac"})
  });
  db=created.result;
}
if(!db?.uuid) throw new Error("D1_UUID_MISSING");

const template=JSON.parse(await readFile(new URL("../wrangler.template.jsonc",import.meta.url),"utf8"));
template.d1_databases=[{binding:"DB",database_name:dbName,database_id:db.uuid,migrations_dir:"migrations"}];
await writeFile(new URL("../wrangler.generated.jsonc",import.meta.url),JSON.stringify(template,null,2)+"\n");
console.log(`D1_READY name=${dbName} id=${db.uuid}`);
