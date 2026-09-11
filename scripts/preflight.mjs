import { access, readFile } from "node:fs/promises";

const required = [
  "package.json",
  "wrangler.jsonc",
  "src/index.js",
  "scripts/security-check.mjs",
  "scripts/e2e.mjs",
  ".github/workflows/deploy.yml"
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
for (const route of ["/health", "/healthz", "/preflight", "/projects/p1", "/projects/p1/health", "/projects/p1/bootstrap"]) {
  if (!worker.includes(route)) failures.push(`route:${route}`);
}
for (const guard of ["ALLOWED_P1_HOST", "P1_BASE_URL_NOT_ALLOWED", "AbortController"]) {
  if (!worker.includes(guard)) failures.push(`bridge-guard:${guard}`);
}

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

if (failures.length) {
  console.error("PREFLIGHT FAILED");
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}
console.log(`PREFLIGHT PASS (${required.length} required files + P1 bridge + deployment pipeline invariants)`);
