import { access, readFile } from "node:fs/promises";

const required = [
  "package.json",
  "wrangler.jsonc",
  "src/index.js",
  "scripts/security-check.mjs",
  "scripts/e2e.mjs",
  "scripts/p1-browser-factory.mjs",
  ".github/workflows/deploy.yml",
  ".github/workflows/p1-browser-factory.yml"
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
if (!wranglerText.includes('"P3_MODE": "p1-bridge"')) failures.push("p1-mode");
if (!wranglerText.includes('"P1_BASE_URL": "https://k-stella-shorts-factory.k-stella-p1.workers.dev"')) failures.push("p1-base-url");

const worker = await readFile(new URL("../src/index.js", import.meta.url), "utf8");
for (const route of ["/health", "/healthz", "/preflight", "/projects/p1", "/projects/p1/health"]) {
  if (!worker.includes(route)) failures.push(`route:${route}`);
}
for (const guard of ["ALLOWED_P1_HOST", "P1_BASE_URL_NOT_ALLOWED", "AbortController"]) {
  if (!worker.includes(guard)) failures.push(`bridge-guard:${guard}`);
}
if (worker.includes("/api/bootstrap/status")) failures.push("slow-probe:bootstrap-status");

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

const factory = await readFile(new URL("../scripts/p1-browser-factory.mjs", import.meta.url), "utf8");
for (const expected of [
  "P1_ADMIN_TOKEN",
  "puppeteer-core",
  "/api/lineups/generate",
  "/api/lineups/plan-all",
  "/api/production/start",
  "processProductionItem",
  "/api/release/daily"
]) {
  if (!factory.includes(expected)) failures.push(`factory:${expected}`);
}
if (factory.includes("console.log(P1_ADMIN_TOKEN") || factory.includes("P1_ADMIN_TOKEN}")) failures.push("factory:secret-log-risk");

const factoryWorkflow = await readFile(new URL("../.github/workflows/p1-browser-factory.yml", import.meta.url), "utf8");
for (const expected of [
  "workflow_dispatch",
  "secrets.P1_ADMIN_TOKEN",
  "puppeteer-core",
  "Locate Chrome",
  "scripts/p1-browser-factory.mjs",
  "actions/upload-artifact@v4"
]) {
  if (!factoryWorkflow.includes(expected)) failures.push(`factory-workflow:${expected}`);
}
if (/schedule\s*:/.test(factoryWorkflow)) failures.push("factory-workflow:nightly-schedule-must-wait-for-live-test");

if (failures.length) {
  console.error("PREFLIGHT FAILED");
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}
console.log(`PREFLIGHT PASS (${required.length} required files + P1 bridge + browser factory + deployment pipeline invariants)`);
