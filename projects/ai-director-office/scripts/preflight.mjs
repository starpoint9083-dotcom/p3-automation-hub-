import { readFile } from "node:fs/promises";
const required=["README.md","package.json","wrangler.template.jsonc","src/index.js","migrations/0001_init.sql","scripts/selftest.mjs","scripts/prepare-wrangler.mjs","scripts/e2e.mjs"];
for(const f of required){await readFile(new URL(`../${f}`,import.meta.url),"utf8");}
const pkg=JSON.parse(await readFile(new URL("../package.json",import.meta.url),"utf8"));
if(pkg.devDependencies?.wrangler!=="4.130.0")throw new Error("WRANGLER_NOT_PINNED");
const src=await readFile(new URL("../src/index.js",import.meta.url),"utf8");
for(const route of ["/health","/preflight","/api/briefing","/api/risks","/api/growth-report","/api/recruitment/plan"]){if(!src.includes(route))throw new Error(`MISSING_ROUTE:${route}`);}
console.log(JSON.stringify({ok:true,required_files:required.length,wrangler:pkg.devDependencies.wrangler},null,2));
