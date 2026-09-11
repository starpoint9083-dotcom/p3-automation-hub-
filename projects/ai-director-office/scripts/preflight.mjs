import {readFile} from "node:fs/promises";
const required=[
  "README.md","package.json","wrangler.template.jsonc",
  "src/lib.js","src/auth.js","src/auth-ui.js","src/services.js","src/ui-v2.js","src/client-v2.js","src/app.js",
  "migrations/0001_init.sql","migrations/0002_growth_recruitment.sql",
  "scripts/selftest.mjs","scripts/prepare-wrangler.mjs","scripts/e2e.mjs","scripts/browser-e2e.mjs"
];
for(const f of required)await readFile(new URL(`../${f}`,import.meta.url),"utf8");
const pkg=JSON.parse(await readFile(new URL("../package.json",import.meta.url),"utf8"));
if(pkg.version!=="0.4.0")throw new Error("VERSION_NOT_V0_4");
if(pkg.devDependencies?.wrangler!=="4.130.0")throw new Error("WRANGLER_NOT_PINNED");
if(!pkg.devDependencies?.playwright)throw new Error("PLAYWRIGHT_NOT_PINNED");
if(pkg.scripts?.["verify:browser"]!=="node scripts/browser-e2e.mjs")throw new Error("BROWSER_VERIFY_SCRIPT_MISSING");
const config=JSON.parse(await readFile(new URL("../wrangler.template.jsonc",import.meta.url),"utf8"));
if(config.main!=="src/app.js")throw new Error("WRONG_WORKER_ENTRYPOINT");
if(config.name!=="ai-director-office")throw new Error("WRONG_WORKER_NAME");
if(config.vars?.APP_VERSION!=="0.4.0")throw new Error("WRONG_APP_VERSION");
if(!config.ai?.binding)throw new Error("WORKERS_AI_BINDING_MISSING");
if(!Array.isArray(config.secrets?.required)||!config.secrets.required.includes("ADMIN_PASSWORD"))throw new Error("ADMIN_SECRET_NOT_REQUIRED");
const app=await readFile(new URL("../src/app.js",import.meta.url),"utf8");
const routes=["/health","/preflight","/auth/status","/auth/login","/auth/logout","/app.js","/api/briefing","/api/risks","/api/growth-report","/api/leads","/api/recruitment/targets","/api/recruitment/plan","/api/recruitment/content","/api/recruitment/event","/api/recruitment/performance"];
for(const route of routes)if(!app.includes(route))throw new Error(`MISSING_ROUTE:${route}`);
for(const guard of ["requireAdmin","isAuthConfigured","securedAppHtml","script-src 'self'"])if(!app.includes(guard))throw new Error(`MISSING_AUTH_GUARD:${guard}`);
if(!app.includes("return await login(request,env)"))throw new Error("LOGIN_MUST_BE_AWAITED_INSIDE_ERROR_BOUNDARY");
const auth=await readFile(new URL("../src/auth.js",import.meta.url),"utf8");
for(const guard of ["HttpOnly","SameSite=Strict","Secure","CSRF_REJECTED","AUTH_REQUIRED","ADMIN_PASSWORD","MAX_SECRET_INPUT"])if(!auth.includes(guard))throw new Error(`MISSING_AUTH_CONTROL:${guard}`);
const ui=await readFile(new URL("../src/ui-v2.js",import.meta.url),"utf8");
for(const label of ["오늘 가장 먼저 할 일 3가지","학생 성장관리","상담 파이프라인","AI 모집실장","모집 성과","/app.js"])if(!ui.includes(label))throw new Error(`MISSING_UI:${label}`);
const client=await readFile(new URL("../src/client-v2.js",import.meta.url),"utf8");
for(const signal of ["__AI_OFFICE_READY__","__AI_OFFICE_DATA_READY__","data-view","makePlan","x-csrf-token"])if(!client.includes(signal))throw new Error(`MISSING_CLIENT_SIGNAL:${signal}`);
const browser=await readFile(new URL("../scripts/browser-e2e.mjs",import.meta.url),"utf8");
for(const action of ["chromium","mobilebar","studentCreate","leadCreate","targetCreate","makePlan"])if(!browser.includes(action))throw new Error(`MISSING_BROWSER_GATE:${action}`);
const services=await readFile(new URL("../src/services.js",import.meta.url),"utf8");
for(const guard of ["성적 보장","허위 희소성","낙인","NOT_ENOUGH_GROWTH_DATA"])if(!services.includes(guard))throw new Error(`MISSING_SAFETY_GUARD:${guard}`);
console.log(JSON.stringify({ok:true,version:pkg.version,required_files:required.length,routes:routes.length,wrangler:pkg.devDependencies.wrangler,entrypoint:config.main,admin_auth:true,admin_secret_required:true,external_client:true,real_browser_gate:true},null,2));
