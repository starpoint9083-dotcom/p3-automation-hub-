import { access, readFile } from "node:fs/promises";

const required = [
  "package.json",
  "wrangler.jsonc",
  "src/index.js",
  "scripts/security-check.mjs",
  "scripts/e2e.mjs",
  "scripts/p1-browser-factory.mjs",
  "config/p2-my-life-room.json",
  "ops/P2_P3_SUPERVISOR_CONTRACT.md",
  ".github/workflows/deploy.yml",
  ".github/workflows/p1-browser-factory.yml",
  ".github/workflows/p2-supervisor.yml"
];

const failures = [];
for (const file of required) {
  try { await access(new URL(`../${file}`, import.meta.url)); }
  catch { failures.push(`missing:${file}`); }
}

const wranglerText = await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8");
if (!wranglerText.includes('"name": "p3-automation-hub"')) failures.push("worker-name");
if (!wranglerText.includes('"compatibility_date": "2026-09-11"')) failures.push("compatibility-date");
if (!wranglerText.includes('"workers_dev": true')) failures.push("workers-dev");
if (!wranglerText.includes('"P3_MODE": "p1-p2-supervisor"')) failures.push("supervisor-mode");
if (!wranglerText.includes('"P1_BASE_URL": "https://k-stella-shorts-factory.k-stella-p1.workers.dev"')) failures.push("p1-base-url");
if (!wranglerText.includes('"P2_BASE_URL": "https://my-life-room-v13-live-0910.starpoint9083.workers.dev"')) failures.push("p2-base-url");

const worker = await readFile(new URL("../src/index.js", import.meta.url), "utf8");
for (const route of ["/health", "/healthz", "/preflight", "/projects/p1", "/projects/p1/health", "/projects/p2", "/projects/p2/health", "/projects/p2/cinema"]) {
  if (!worker.includes(route)) failures.push(`route:${route}`);
}
for (const guard of ["ALLOWED_P1_HOST", "P1_BASE_URL_NOT_ALLOWED", "ALLOWED_P2_HOST", "P2_BASE_URL_NOT_ALLOWED", "AbortController"]) {
  if (!worker.includes(guard)) failures.push(`bridge-guard:${guard}`);
}
if (worker.includes("/api/bootstrap/status")) failures.push("slow-probe:bootstrap-status");
if (worker.includes('method: "POST"') || worker.includes("method: 'POST'")) failures.push("p3-worker-must-remain-get-only");

const workflow = await readFile(new URL("../.github/workflows/deploy.yml", import.meta.url), "utf8");
for (const expected of [
  "npm run check",
  "npm run security",
  "npm run preflight",
  "wrangler deploy --dry-run",
  "wrangler deploy",
  "scripts/e2e.mjs"
]) {
  if (!workflow.includes(expected)) failures.push(`workflow:${expected}`);
}

const p2Config = JSON.parse(await readFile(new URL("../config/p2-my-life-room.json", import.meta.url), "utf8"));
if (p2Config.repository !== "starpoint9083-dotcom/my-life-room-v13-app") failures.push("p2-config:repository");
if (p2Config.worker !== "my-life-room-v13-live-0910") failures.push("p2-config:worker");
if (p2Config.resources?.d1?.name !== "my-life-room-v13") failures.push("p2-config:d1");
if (p2Config.resources?.r2?.name !== "my-life-room-assets-v13") failures.push("p2-config:r2");
if (p2Config.resources?.workflow?.name !== "my-life-room-cinema-v23") failures.push("p2-config:workflow");
if (p2Config.automationPolicy?.mode !== "external-supervisor") failures.push("p2-config:mode");
if (p2Config.automationPolicy?.p2OwnsDeployment !== true) failures.push("p2-config:p2-owns-deploy");
if (p2Config.automationPolicy?.p3MayDeleteOrRecreateCloudflareResources !== false) failures.push("p2-config:destructive-guard");
if (p2Config.automationPolicy?.paidGenerationInCI !== false) failures.push("p2-config:paid-guard");

const p2Supervisor = await readFile(new URL("../.github/workflows/p2-supervisor.yml", import.meta.url), "utf8");
for (const expected of [
  "workflow_dispatch",
  "schedule:",
  "deploy-cloudflare.yml",
  "git ls-remote",
  "/api/health",
  "/api/cinema/batch/latest-public",
  "P3 mode: read-only external supervisor",
  "Paid Cinema generation: NEVER triggered"
]) {
  if (!p2Supervisor.includes(expected)) failures.push(`p2-supervisor:${expected}`);
}
for (const forbidden of ["/api/cinema/generate", "/api/cinema/batch/start", "wrangler delete", "d1 delete", "r2 bucket delete"]) {
  if (p2Supervisor.includes(forbidden)) failures.push(`p2-supervisor:forbidden:${forbidden}`);
}

const factory = await readFile(new URL("../scripts/p1-browser-factory.mjs", import.meta.url), "utf8");
for (const expected of [
  "ACTIONS_ID_TOKEN_REQUEST_URL",
  "ACTIONS_ID_TOKEN_REQUEST_TOKEN",
  "k-stella-p1-p3-bridge",
  "/api/session",
  "credentials: 'same-origin'",
  "puppeteer-core",
  "BROWSER_PROTOCOL_TIMEOUT = 20 * 60 * 1000",
  "API_REQUEST_TIMEOUT = 8 * 60 * 1000",
  "RENDER_ITEM_TIMEOUT = 15 * 60 * 1000",
  "protocolTimeout: BROWSER_PROTOCOL_TIMEOUT",
  "page.setDefaultTimeout(BROWSER_PROTOCOL_TIMEOUT)",
  "page.cookies(P1_BASE_URL)",
  "cookie: sessionCookieHeader",
  "new AbortController()",
  "api_transport: 'node-fetch-with-session-cookie'",
  "lineup_mode: null",
  "/api/system/policy",
  "/api/lineups/latest",
  "Resuming today's lineup",
  "/api/lineups/generate",
  "/api/lineups/plan-all",
  "/api/production/start",
  "processProductionItem",
  "/api/release/daily"
]) {
  if (!factory.includes(expected)) failures.push(`factory:${expected}`);
}
if (factory.includes("P1_ADMIN_TOKEN")) failures.push("factory:legacy-admin-secret-dependency");
if (/console\.log\([^\n]*(?:ACTIONS_ID_TOKEN_REQUEST_TOKEN|oidcToken|sessionCookieHeader)/.test(factory)) failures.push("factory:secret-log-risk");

const factoryWorkflow = await readFile(new URL("../.github/workflows/p1-browser-factory.yml", import.meta.url), "utf8");
for (const expected of [
  "workflow_dispatch",
  "id-token: write",
  "ACTIONS_ID_TOKEN_REQUEST_URL",
  "ACTIONS_ID_TOKEN_REQUEST_TOKEN",
  "puppeteer-core",
  "Locate Chrome",
  "scripts/p1-browser-factory.mjs",
  "actions/upload-artifact@v4",
  "cancel-in-progress: true"
]) {
  if (!factoryWorkflow.includes(expected)) failures.push(`factory-workflow:${expected}`);
}
if (factoryWorkflow.includes("secrets.P1_ADMIN_TOKEN") || factoryWorkflow.includes("P1_ADMIN_TOKEN:")) failures.push("factory-workflow:legacy-admin-secret-dependency");
if (/schedule\s*:/.test(factoryWorkflow)) failures.push("factory-workflow:nightly-schedule-must-wait-for-live-test");

if (failures.length) {
  console.error("PREFLIGHT FAILED");
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}
console.log(`PREFLIGHT PASS (${required.length} required files + P1 daily resume/quota visibility + P1 bridge + P2 read-only supervisor + protected-resource guards + no-paid-Cinema CI + deployment pipeline invariants)`);
