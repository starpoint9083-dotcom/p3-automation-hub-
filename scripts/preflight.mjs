import { access, readFile } from "node:fs/promises";

const required = [
  "package.json",
  "wrangler.jsonc",
  "src/index.js",
  "scripts/security-check.mjs",
  "scripts/safety-gate.mjs",
  "scripts/deployment-receipt.mjs",
  "scripts/operations-report.mjs",
  "scripts/failure-triage.mjs",
  "scripts/e2e.mjs",
  "scripts/p1-browser-factory.mjs",
  "scripts/p1-quality-gate.mjs",
  "config/p1-k-stella.json",
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
if (!wranglerText.includes('"P3_VERSION": "0.4.0"')) failures.push("p3-version");
if (!wranglerText.includes('"P1_BASE_URL": "https://k-stella-shorts-factory.k-stella-p1.workers.dev"')) failures.push("p1-base-url");
if (!wranglerText.includes('"P2_BASE_URL": "https://my-life-room-v13-live-0910.starpoint9083.workers.dev"')) failures.push("p2-base-url");

const worker = await readFile(new URL("../src/index.js", import.meta.url), "utf8");
for (const route of ["/health", "/healthz", "/preflight", "/projects/p1", "/projects/p1/health", "/projects/p2", "/projects/p2/health", "/projects/p2/cinema", "/projects/p2/quality", "/projects/p2/visual-qc", "/api/cinema/batch/quality-public", "/api/cinema/batch/visual-qc/latest-public"]) {
  if (!worker.includes(route)) failures.push(`route:${route}`);
}
for (const guard of ["ALLOWED_P1_HOST", "P1_BASE_URL_NOT_ALLOWED", "ALLOWED_P2_HOST", "P2_BASE_URL_NOT_ALLOWED", "AbortController", "paidVisualAIFromP3", "autoCinemaRegenerationFromP3", "p3TriggeredPaidVisualAI", "p3TriggeredRegeneration"]) {
  if (!worker.includes(guard)) failures.push(`bridge-guard:${guard}`);
}
if (!worker.includes("paid_visual_ai_triggered: false")) failures.push("p2-quality:canonical-paid-visual-ai-guard-field");
if (!worker.includes("paid_visual_ai_triggered_by_p3: false")) failures.push("p2-quality:backward-compatible-paid-visual-ai-guard-field");
if (worker.includes("/api/bootstrap/status")) failures.push("slow-probe:bootstrap-status");
if (worker.includes('method: "POST"') || worker.includes("method: 'POST'")) failures.push("p3-worker-must-remain-get-only");

const workflow = await readFile(new URL("../.github/workflows/deploy.yml", import.meta.url), "utf8");
for (const expected of [
  "npm run check",
  "npm run security",
  "npm run safety",
  "npm run preflight",
  "wrangler deploy --dry-run",
  "wrangler deploy",
  "scripts/e2e.mjs",
  "scripts/deployment-receipt.mjs",
  "scripts/operations-report.mjs",
  "npm run triage",
  "p3-repair-packet.json",
  "p3-repair-packet.md",
  "p3-repair-packet-",
  "STEP_E2E",
  "if: failure()",
  "p3-operations-report.json",
  "p3-operations-report.md",
  "GITHUB_STEP_SUMMARY",
  "actions/upload-artifact@v4",
  "p3-last-known-good-"
]) {
  if (!workflow.includes(expected)) failures.push(`workflow:${expected}`);
}

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
if (packageJson.scripts?.safety !== "node scripts/safety-gate.mjs") failures.push("package:safety-script");
if (packageJson.scripts?.receipt !== "node scripts/deployment-receipt.mjs") failures.push("package:receipt-script");
if (packageJson.scripts?.report !== "node scripts/operations-report.mjs") failures.push("package:report-script");
if (packageJson.scripts?.triage !== "node scripts/failure-triage.mjs") failures.push("package:triage-script");
if (packageJson.scripts?.["p1:quality"] !== "node scripts/p1-quality-gate.mjs") failures.push("package:p1-quality-script");

const failureTriage = await readFile(new URL("../scripts/failure-triage.mjs", import.meta.url), "utf8");
for (const expected of [
  "validated-self-development",
  "automaticCodeMutation: false",
  "automaticProductionRollback: false",
  "destructiveResourceMutation: false",
  "secretMutation: false",
  "p3-repair-packet.json",
  "p3-repair-packet.md"
]) {
  if (!failureTriage.includes(expected)) failures.push(`failure-triage:${expected}`);
}
if (failureTriage.includes("automaticCodeMutation: true")) failures.push("failure-triage:auto-code-mutation-must-remain-disabled");
if (failureTriage.includes("automaticProductionRollback: true")) failures.push("failure-triage:auto-production-rollback-must-remain-disabled");

const p1Config = JSON.parse(await readFile(new URL("../config/p1-k-stella.json", import.meta.url), "utf8"));
if (p1Config.repository !== "starpoint9083-dotcom/k-stella-way-p1") failures.push("p1-config:repository");
if (p1Config.worker !== "k-stella-shorts-factory") failures.push("p1-config:worker");
if (p1Config.deployUrl !== "https://k-stella-shorts-factory.k-stella-p1.workers.dev") failures.push("p1-config:deploy-url");
if (p1Config.resources?.d1?.name !== "k-stella-shorts-factory") failures.push("p1-config:d1");
if (p1Config.resources?.kv?.name !== "k-stella-shorts-assets-kv") failures.push("p1-config:kv");
if (p1Config.resources?.r2 !== null) failures.push("p1-config:no-r2");
if (p1Config.bridgeAuth?.mode !== "github-actions-oidc-to-p1-session") failures.push("p1-config:bridge-mode");
if (p1Config.bridgeAuth?.audience !== "k-stella-p1-p3-bridge") failures.push("p1-config:bridge-audience");
if (p1Config.bridgeAuth?.staticAdminPasswordInP3 !== false) failures.push("p1-config:no-static-admin-password");
if (p1Config.qualityPolicy?.source !== "existing-p1-engine-release-decision") failures.push("p1-config:quality-source");
if (p1Config.qualityPolicy?.releaseGate !== "failed-zero-and-hold-zero") failures.push("p1-config:quality-release-gate");
if (p1Config.qualityPolicy?.numericThresholdInventedByP3 !== false) failures.push("p1-config:no-invented-threshold");
if (p1Config.qualityPolicy?.classifyRegenerationCandidates !== true) failures.push("p1-config:regeneration-candidate-classifier");
if (p1Config.qualityPolicy?.autoRegeneration !== false) failures.push("p1-config:no-auto-regeneration");
if (p1Config.qualityPolicy?.paidVisualAIInCI !== false) failures.push("p1-config:no-paid-visual-ai");
if (p1Config.automationPolicy?.p1OwnsDeployment !== true) failures.push("p1-config:p1-owns-deploy");
if (p1Config.automationPolicy?.p3MayOperateFactory !== true) failures.push("p1-config:factory-operator");
if (p1Config.automationPolicy?.p3MayReplaceDeploymentPipeline !== false) failures.push("p1-config:deployment-guard");
if (p1Config.automationPolicy?.p3MayDeleteOrRecreateCloudflareResources !== false) failures.push("p1-config:destructive-guard");
if (p1Config.automationPolicy?.paidExternalGenerationFromP3 !== false) failures.push("p1-config:paid-external-guard");
if (p1Config.automationPolicy?.storagePolicy !== "kv-free-no-r2") failures.push("p1-config:storage-policy");

const p1QualityGate = await readFile(new URL("../scripts/p1-quality-gate.mjs", import.meta.url), "utf8");
for (const expected of ["failedCount === 0", "holdCount === 0", "regenerationCandidates", "autoRegenerationTriggered: false", "paidVisualAiTriggered: false", "stop-and-report"]) {
  if (!p1QualityGate.includes(expected)) failures.push(`p1-quality-gate:${expected}`);
}

const p2Config = JSON.parse(await readFile(new URL("../config/p2-my-life-room.json", import.meta.url), "utf8"));
if (p2Config.repository !== "starpoint9083-dotcom/my-life-room-v13-app") failures.push("p2-config:repository");
if (p2Config.worker !== "my-life-room-v13-live-0910") failures.push("p2-config:worker");
if (p2Config.resources?.d1?.name !== "my-life-room-v13") failures.push("p2-config:d1");
if (p2Config.resources?.r2?.name !== "my-life-room-assets-v13") failures.push("p2-config:r2");
if (p2Config.resources?.workflow?.name !== "my-life-room-cinema-v23") failures.push("p2-config:workflow");
if (p2Config.health?.cinemaQualityPublic !== "/api/cinema/batch/quality-public") failures.push("p2-config:quality-route");
if (p2Config.health?.cinemaVisualQcPublic !== "/api/cinema/batch/visual-qc/latest-public") failures.push("p2-config:visual-qc-route");
if (p2Config.qualityPolicy?.technicalManifest !== true) failures.push("p2-config:technical-manifest");
if (p2Config.qualityPolicy?.technicalScoreRequired !== 100) failures.push("p2-config:technical-score");
if (p2Config.qualityPolicy?.visualQcObservation !== "read-only-after-user-start") failures.push("p2-config:visual-qc-observation");
if (p2Config.qualityPolicy?.paidVisualAIInCI !== false) failures.push("p2-config:paid-visual-ai-guard");
if (p2Config.qualityPolicy?.autoRegeneration !== false) failures.push("p2-config:auto-regeneration-guard");
if (p2Config.automationPolicy?.mode !== "external-supervisor") failures.push("p2-config:mode");
if (p2Config.automationPolicy?.p2OwnsDeployment !== true) failures.push("p2-config:p2-owns-deploy");
if (p2Config.automationPolicy?.p3MayDeleteOrRecreateCloudflareResources !== false) failures.push("p2-config:destructive-guard");
if (p2Config.automationPolicy?.paidGenerationInCI !== false) failures.push("p2-config:paid-guard");
if (p2Config.automationPolicy?.paidVisualAIInCI !== false) failures.push("p2-config:paid-visual-ai-policy");
if (!(p2Config.automationPolicy?.paidEndpointsNeverAutoCall || []).includes("/api/cinema/batch/visual-qc/start")) failures.push("p2-config:visual-qc-paid-denylist");

const p2Supervisor = await readFile(new URL("../.github/workflows/p2-supervisor.yml", import.meta.url), "utf8");
for (const expected of [
  "workflow_dispatch",
  "schedule:",
  "deploy-cloudflare.yml",
  "git ls-remote",
  "/api/health",
  "/api/cinema/batch/latest-public",
  "/api/cinema/batch/quality-public",
  "/api/cinema/batch/visual-qc/latest-public",
  "Observe user-started Cinema visual QC",
  "P3 mode: read-only external supervisor",
  "Paid Cinema generation: NEVER triggered",
  "Paid visual AI QC: NEVER triggered",
  "Automatic Cinema regeneration: NEVER triggered"
]) {
  if (!p2Supervisor.includes(expected)) failures.push(`p2-supervisor:${expected}`);
}
for (const forbidden of ["/api/cinema/generate", "/api/cinema/batch/start", "/api/cinema/batch/visual-qc/start", "wrangler delete", "d1 delete", "r2 bucket delete"]) {
  if (p2Supervisor.includes(forbidden) && !p2Supervisor.includes(`paidEndpointsNeverAutoCall`)) {
    failures.push(`p2-supervisor:forbidden:${forbidden}`);
  }
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
  "npm run p1:quality",
  "P1 zero-cost quality gate",
  "p1_quality_gate.json",
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
console.log(`PREFLIGHT PASS (${required.length} required files + global destructive-operation safety gate + last-known-good deployment receipt + automatic operations report + validated failure-triage repair packets + independent P1/P2 protected project configs + P1 zero-cost quality gate/regeneration-candidate classification + P2 technical/visual QC observation + protected-resource guards + no-paid-Cinema/no-paid-visual-AI/no-auto-regeneration/no-auto-code-mutation CI + deployment pipeline invariants)`);
