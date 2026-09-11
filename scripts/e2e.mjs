const base = (process.env.DEPLOY_URL || process.argv[2] || "").replace(/\/$/, "");
if (!base) {
  console.error("DEPLOY_URL is required");
  process.exit(2);
}

const attempts = Number(process.env.E2E_ATTEMPTS || 12);
const delayMs = Number(process.env.E2E_DELAY_MS || 5000);
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function check(path, validator) {
  let lastError = "unknown";
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(`${base}${path}`, { headers: { "cache-control": "no-cache" } });
      const body = await res.json();
      if (res.ok && validator(body)) {
        console.log(`E2E PASS ${path} attempt=${i} status=${res.status}`);
        return body;
      }
      lastError = `status=${res.status} body=${JSON.stringify(body)}`;
    } catch (err) {
      lastError = err?.message || String(err);
    }
    console.log(`E2E RETRY ${path} attempt=${i}/${attempts}: ${lastError}`);
    if (i < attempts) await sleep(delayMs);
  }
  throw new Error(`E2E FAILED ${path}: ${lastError}`);
}

await check("/health", b => b?.ok === true && b?.service === "p3-automation-hub" && b?.integration === "p1-p2-supervisor");
await check("/preflight", b => b?.ok === true && b?.checks?.workerRuntime === true && b?.checks?.p1BridgeConfigured === true && b?.checks?.p2SupervisorConfigured === true && b?.checks?.p2TechnicalQualityGateConfigured === true && b?.safety?.paidCinemaGenerationFromP3 === false && b?.safety?.paidVisualAIFromP3 === false);
await check("/projects/p1", b => b?.ok === true && b?.project === "P1" && b?.bridge === "configured" && b?.probe === "/healthz");
await check("/projects/p1/health", b => b?.ok === true && b?.project === "P1" && b?.connected === true && b?.p1?.db === true && b?.p1?.storage === true && b?.p1?.ai === true);
await check("/projects/p2", b => b?.ok === true && b?.project === "P2" && b?.bridge === "configured" && b?.control?.mode === "read-only-supervisor" && b?.probes?.quality === "/api/cinema/batch/quality-public");
await check("/projects/p2/health", b => b?.ok === true && b?.project === "P2" && b?.connected === true && b?.safe === true && b?.p2?.d1 === true && b?.p2?.r2 === true && b?.p2?.ai === true && b?.p2?.cinemaBackground === true);
await check("/projects/p2/cinema", b => b?.ok === true && b?.project === "P2" && b?.connected === true && b?.cinema?.total === 9 && b?.paid_generation_triggered === false);
await check("/projects/p2/quality", b => b?.ok === true && b?.project === "P2" && b?.connected === true && b?.quality?.total === 9 && Array.isArray(b?.quality?.clips) && b?.gate?.autoRegeneration === false && b?.gate?.paid_visual_ai_triggered === false && b?.gate?.paid_generation_triggered === false);
const visual = await check("/projects/p2/visual-qc", b => b?.ok === true && b?.project === "P2" && b?.connected === true && b?.visualQc?.total === 9 && Array.isArray(b?.visualQc?.clips) && b?.safety?.p3TriggeredPaidVisualAI === false && b?.safety?.p3TriggeredRegeneration === false);
console.log(`P2 VISUAL QC SNAPSHOT status=${visual.visualQc.status} ready=${visual.visualQc.ready}/9 score=${visual.visualQc.visualScore} pass=${visual.visualQc.pass} candidates=${visual.visualQc.candidates.length}`);
for (const clip of visual.visualQc.clips || []) {
  const issues = Array.isArray(clip.issues) ? clip.issues.join(" | ") : "";
  console.log(`P2 VISUAL QC CLIP slot=${clip.slot} score=${clip.score} pass=${clip.pass} candidate=${clip.regenerationCandidate} issues=${issues}`);
}
console.log(`E2E COMPLETE ${base} P1_BRIDGE=CONNECTED P2_SUPERVISOR=CONNECTED P2_TECHNICAL_QC=CONNECTED P2_VISUAL_QC=OBSERVED PAID_CINEMA_TRIGGER=DISABLED PAID_VISUAL_AI_TRIGGER=DISABLED`);
