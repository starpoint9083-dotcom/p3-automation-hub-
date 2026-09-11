import { readFile, writeFile } from "node:fs/promises";

const input = process.env.P1_FACTORY_SUMMARY || process.argv[2] || "p1_factory_summary.json";
const output = process.env.P1_QUALITY_GATE_REPORT || process.argv[3] || "p1_quality_gate.json";

let summary;
try {
  summary = JSON.parse(await readFile(input, "utf8"));
} catch (error) {
  console.error(`P1 QUALITY GATE FAILED: cannot read ${input}: ${error?.message || error}`);
  process.exit(2);
}

const items = Array.isArray(summary?.items) ? summary.items : [];
const release = summary?.release || {};
const failedCount = Number(summary?.failed || 0);
const holdCount = Number(release?.hold || 0);
const reviewCount = Number(release?.review || 0);
const readyCount = Number(release?.ready || 0);

const hardFailStatuses = new Set(["fail", "failed", "hold", "blocked", "reject", "rejected"]);
const reviewStatuses = new Set(["review", "needs_review", "manual_review"]);

const candidates = [];
const observed = items.map((item) => {
  const status = String(item?.quality_status || "").trim().toLowerCase();
  const itemFailed = item?.ok === false || hardFailStatuses.has(status);
  const itemReview = !itemFailed && reviewStatuses.has(status);
  if (itemFailed) {
    candidates.push({
      slot_no: item?.slot_no ?? null,
      project_id: item?.project_id ?? null,
      video_id: item?.video_id ?? null,
      reason: item?.ok === false ? (item?.error || "production-failed") : `quality-status:${status}`,
      quality_status: item?.quality_status ?? null,
      quality_score: item?.quality_score ?? null,
      action: "regeneration-candidate"
    });
  }
  return {
    slot_no: item?.slot_no ?? null,
    project_id: item?.project_id ?? null,
    video_id: item?.video_id ?? null,
    ok: item?.ok !== false,
    quality_status: item?.quality_status ?? null,
    quality_score: item?.quality_score ?? null,
    gate: itemFailed ? "FAIL" : itemReview ? "REVIEW" : "OBSERVED"
  };
});

// Preserve P1's own release semantics instead of inventing a new numeric threshold.
// P1 currently defines a clean release as: no failed production items and no holds.
const pass = failedCount === 0 && holdCount === 0 && summary?.ok !== false;

const report = {
  schemaVersion: 1,
  project: "P1",
  gate: "existing-engine-release-gate",
  generatedAt: new Date().toISOString(),
  pass,
  decision: pass ? "PASS" : "BLOCK",
  sourceSummary: input,
  production: {
    completed: Number(summary?.completed || 0),
    failed: failedCount,
    lineup_id: summary?.lineup_id || null,
    production_run_id: summary?.production_run_id || null
  },
  release: {
    ready: readyCount,
    review: reviewCount,
    hold: holdCount
  },
  items: observed,
  regenerationCandidates: candidates,
  autoRegenerationTriggered: false,
  policy: {
    numericThresholdInventedByP3: false,
    p1ExistingReleaseSemanticsPreserved: true,
    autoRegeneration: false,
    paidVisualAiTriggered: false,
    onBlock: "stop-and-report"
  }
};

await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`P1 QUALITY GATE ${report.decision}: failed=${failedCount} hold=${holdCount} review=${reviewCount} regenerationCandidates=${candidates.length}`);

if (!pass) {
  console.error(`P1 QUALITY GATE BLOCKED RELEASE. See ${output}`);
  process.exit(1);
}
