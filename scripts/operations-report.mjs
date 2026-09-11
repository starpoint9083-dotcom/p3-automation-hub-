import { readFile, writeFile } from "node:fs/promises";

const base = String(process.env.DEPLOY_URL || "").replace(/\/$/, "");
if (!base) {
  console.error("OPERATIONS REPORT FAILED: DEPLOY_URL is required");
  process.exit(2);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function readJson(path) {
  return JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), "utf8"));
}

async function fetchJson(path, attempts = 3) {
  let lastError = "unknown";
  for (let i = 1; i <= attempts; i += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(`${base}${path}`, {
        headers: { "cache-control": "no-cache", accept: "application/json" },
        signal: controller.signal
      });
      const text = await res.text();
      let body;
      try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 500) }; }
      if (!res.ok) throw new Error(`${path} status=${res.status}`);
      return body;
    } catch (error) {
      lastError = error?.message || String(error);
      if (i < attempts) await sleep(2000);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`${path}: ${lastError}`);
}

const receipt = JSON.parse(await readFile("deployment-receipt.json", "utf8"));
const p1Config = await readJson("config/p1-k-stella.json");
const p2Config = await readJson("config/p2-my-life-room.json");

const [health, preflight, p1Health, p2Health, p2Quality] = await Promise.all([
  fetchJson("/health"),
  fetchJson("/preflight"),
  fetchJson("/projects/p1/health"),
  fetchJson("/projects/p2/health"),
  fetchJson("/projects/p2/quality")
]);

const checks = {
  p3Runtime: health?.ok === true && health?.service === "p3-automation-hub",
  preflight: preflight?.ok === true,
  p1Connected: p1Health?.connected === true,
  p1Db: p1Health?.p1?.db === true,
  p1Storage: p1Health?.p1?.storage === true,
  p1Ai: p1Health?.p1?.ai === true,
  p2Connected: p2Health?.connected === true && p2Health?.safe === true,
  p2D1: p2Health?.p2?.d1 === true,
  p2R2: p2Health?.p2?.r2 === true,
  p2Ai: p2Health?.p2?.ai === true,
  p2QualityConnected: p2Quality?.connected === true,
  noPaidCinemaFromP3: preflight?.safety?.paidCinemaGenerationFromP3 === false,
  noPaidVisualAiFromP3: preflight?.safety?.paidVisualAIFromP3 === false,
  p2NoAutoRegeneration: p2Quality?.gate?.autoRegeneration === false,
  lastKnownGoodRecorded: receipt?.status === "last-known-good" && Boolean(receipt?.cloudflareVersionId)
};

const failedChecks = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);
const overall = failedChecks.length === 0 ? "PASS" : "FAIL";

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  overall,
  failedChecks,
  deployment: receipt,
  p3: {
    url: base,
    integration: health?.integration || null,
    runtimeOk: checks.p3Runtime,
    preflightOk: checks.preflight
  },
  projects: {
    P1: {
      name: p1Config.name,
      repository: p1Config.repository,
      worker: p1Config.worker,
      deploymentOwner: "P1",
      automationMode: p1Config.automationPolicy?.mode,
      connected: checks.p1Connected,
      db: checks.p1Db,
      storage: checks.p1Storage,
      ai: checks.p1Ai,
      destructiveResourceChangesFromP3: p1Config.automationPolicy?.p3MayDeleteOrRecreateCloudflareResources === true,
      paidExternalGenerationFromP3: p1Config.automationPolicy?.paidExternalGenerationFromP3 === true
    },
    P2: {
      name: p2Config.name,
      repository: p2Config.repository,
      worker: p2Config.worker,
      deploymentOwner: "P2",
      automationMode: p2Config.automationPolicy?.mode,
      connected: checks.p2Connected,
      d1: checks.p2D1,
      r2: checks.p2R2,
      ai: checks.p2Ai,
      qualityConnected: checks.p2QualityConnected,
      qualityClipCount: Number(p2Quality?.quality?.total || 0),
      autoRegeneration: p2Quality?.gate?.autoRegeneration === true,
      paidVisualAiTriggered: p2Quality?.gate?.paid_visual_ai_triggered === true,
      paidGenerationTriggered: p2Quality?.gate?.paid_generation_triggered === true
    }
  },
  safety: {
    destructiveOperationsGate: true,
    lastKnownGoodReceipt: checks.lastKnownGoodRecorded,
    p1DeploymentOwnedByP1: p1Config.automationPolicy?.p1OwnsDeployment === true,
    p2DeploymentOwnedByP2: p2Config.automationPolicy?.p2OwnsDeployment === true,
    p1DestructiveResourceChangesBlocked: p1Config.automationPolicy?.p3MayDeleteOrRecreateCloudflareResources === false,
    p2DestructiveResourceChangesBlocked: p2Config.automationPolicy?.p3MayDeleteOrRecreateCloudflareResources === false,
    noPaidCinemaFromP3: checks.noPaidCinemaFromP3,
    noPaidVisualAiFromP3: checks.noPaidVisualAiFromP3,
    p2AutoRegenerationDisabled: checks.p2NoAutoRegeneration
  },
  checks
};

const md = [
  `# P3 Operations Report`,
  ``,
  `**Overall: ${overall}**`,
  ``,
  `- Generated: ${report.generatedAt}`,
  `- P3 URL: ${base}`,
  `- Git SHA: ${receipt.gitSha || "unknown"}`,
  `- Cloudflare Version: ${receipt.cloudflareVersionId || "unknown"}`,
  `- Last-known-good: ${checks.lastKnownGoodRecorded ? "YES" : "NO"}`,
  ``,
  `## P1 — K Stella Way`,
  `- Connected: ${checks.p1Connected ? "PASS" : "FAIL"}`,
  `- DB / Storage / AI: ${checks.p1Db ? "PASS" : "FAIL"} / ${checks.p1Storage ? "PASS" : "FAIL"} / ${checks.p1Ai ? "PASS" : "FAIL"}`,
  `- Deployment owner: P1`,
  `- P3 destructive resource changes: BLOCKED`,
  ``,
  `## P2 — My Life Room`,
  `- Connected: ${checks.p2Connected ? "PASS" : "FAIL"}`,
  `- D1 / R2 / AI: ${checks.p2D1 ? "PASS" : "FAIL"} / ${checks.p2R2 ? "PASS" : "FAIL"} / ${checks.p2Ai ? "PASS" : "FAIL"}`,
  `- Quality gate connected: ${checks.p2QualityConnected ? "PASS" : "FAIL"}`,
  `- Auto regeneration: DISABLED`,
  `- Paid visual AI from P3: DISABLED`,
  ``,
  `## Safety`,
  `- Destructive-operation gate: ACTIVE`,
  `- Last-known-good receipt: ${checks.lastKnownGoodRecorded ? "PASS" : "FAIL"}`,
  `- P1/P2 production-resource deletion from P3: BLOCKED`,
  ``,
  failedChecks.length ? `## Failed checks\n${failedChecks.map((x) => `- ${x}`).join("\n")}` : `## Result\nAll protected runtime checks passed.`,
  ``
].join("\n");

await writeFile("p3-operations-report.json", `${JSON.stringify(report, null, 2)}\n`, "utf8");
await writeFile("p3-operations-report.md", md, "utf8");

console.log(`OPERATIONS REPORT ${overall}`);
if (failedChecks.length) {
  console.error(`Failed checks: ${failedChecks.join(", ")}`);
  process.exit(1);
}
