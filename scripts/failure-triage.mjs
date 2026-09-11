import { writeFile } from "node:fs/promises";

const ordered = [
  ["credentials", process.env.STEP_CREDENTIALS],
  ["install", process.env.STEP_INSTALL],
  ["syntax", process.env.STEP_SYNTAX],
  ["security", process.env.STEP_SECURITY],
  ["safety", process.env.STEP_SAFETY],
  ["selftest", process.env.STEP_SELFTEST],
  ["preflight", process.env.STEP_PREFLIGHT],
  ["dryrun", process.env.STEP_DRYRUN],
  ["deploy", process.env.STEP_DEPLOY],
  ["e2e", process.env.STEP_E2E],
  ["receipt", process.env.STEP_RECEIPT],
  ["report", process.env.STEP_REPORT],
  ["archive", process.env.STEP_ARCHIVE]
];

const normalize = (v) => String(v || "not-run").trim().toLowerCase();
const steps = Object.fromEntries(ordered.map(([name, value]) => [name, normalize(value)]));
const failedStages = ordered
  .map(([name, value]) => [name, normalize(value)])
  .filter(([, value]) => value === "failure")
  .map(([name]) => name);
const firstFailure = failedStages[0] || "unknown";

const guide = {
  credentials: {
    category: "credentials-or-account",
    risk: "high",
    autoApplyAllowed: false,
    inspect: ["GitHub repository secrets", "Cloudflare token account scope"],
    next: "Human verifies credentials/account scope. Never print or auto-rewrite secrets."
  },
  install: {
    category: "dependency-install",
    risk: "medium",
    autoApplyAllowed: false,
    inspect: ["package.json", "package-lock.json"],
    next: "Inspect dependency resolution before proposing a minimal pinned change."
  },
  syntax: {
    category: "code-syntax",
    risk: "low",
    autoApplyAllowed: false,
    inspect: ["src/", "scripts/", "package.json"],
    next: "Generate a minimal syntax repair candidate, then rerun the full validation chain."
  },
  security: {
    category: "secret-or-security-guard",
    risk: "high",
    autoApplyAllowed: false,
    inspect: ["scripts/security-check.mjs", "recent changed files"],
    next: "Treat as a hard stop. Remove the unsafe material; never weaken the security rule to make CI pass."
  },
  safety: {
    category: "destructive-operation-guard",
    risk: "high",
    autoApplyAllowed: false,
    inspect: ["scripts/safety-gate.mjs", ".github/workflows/", "scripts/", "src/"],
    next: "Treat as a hard stop. Determine whether the finding is a true destructive operation or a detector false positive. Never bypass the guard."
  },
  selftest: {
    category: "local-behavior-regression",
    risk: "medium",
    autoApplyAllowed: false,
    inspect: ["scripts/selftest.mjs", "src/index.js"],
    next: "Compare expected runtime contract with changed code and prepare the smallest compatible repair."
  },
  preflight: {
    category: "protected-invariant-regression",
    risk: "high",
    autoApplyAllowed: false,
    inspect: ["scripts/preflight.mjs", "config/", ".github/workflows/"],
    next: "Restore the protected invariant. Do not delete or relax a protection merely to pass CI."
  },
  dryrun: {
    category: "cloudflare-build-config",
    risk: "medium",
    autoApplyAllowed: false,
    inspect: ["wrangler.jsonc", "package.json", "src/index.js"],
    next: "Inspect Wrangler/build configuration and propose a backward-compatible fix."
  },
  deploy: {
    category: "cloudflare-deployment",
    risk: "high",
    autoApplyAllowed: false,
    inspect: ["wrangler.jsonc", "Cloudflare account/token scope", "deploy output"],
    next: "Diagnose deployment failure without deleting/recreating production resources. Human approval is required for account, permission, or destructive changes."
  },
  e2e: {
    category: "runtime-contract",
    risk: "medium",
    autoApplyAllowed: false,
    inspect: ["scripts/e2e.mjs", "src/index.js", "upstream P1/P2 response contracts"],
    next: "Compare the live response with the validator. Prefer backward-compatible field/contract repair over weakening the test."
  },
  receipt: {
    category: "deployment-observability",
    risk: "low",
    autoApplyAllowed: false,
    inspect: ["scripts/deployment-receipt.mjs", "deploy.log"],
    next: "Repair observability metadata without changing the deployed application behavior."
  },
  report: {
    category: "operations-reporting",
    risk: "low",
    autoApplyAllowed: false,
    inspect: ["scripts/operations-report.mjs", "P3 runtime response contracts"],
    next: "Repair report parsing/contract compatibility, then rerun full E2E."
  },
  archive: {
    category: "artifact-archiving",
    risk: "low",
    autoApplyAllowed: false,
    inspect: [".github/workflows/deploy.yml", "generated report paths"],
    next: "Repair artifact paths/settings; do not mark the run last-known-good until archiving succeeds."
  },
  unknown: {
    category: "unknown",
    risk: "medium",
    autoApplyAllowed: false,
    inspect: ["GitHub Actions job log"],
    next: "Inspect the failed job log before making any change."
  }
};

const recommendation = guide[firstFailure] || guide.unknown;
const packet = {
  schemaVersion: 1,
  kind: "p3-repair-packet",
  generatedAt: new Date().toISOString(),
  repository: process.env.GITHUB_REPOSITORY || null,
  gitSha: process.env.GITHUB_SHA || null,
  gitRef: process.env.GITHUB_REF || null,
  workflow: process.env.GITHUB_WORKFLOW || null,
  runId: process.env.GITHUB_RUN_ID || null,
  runNumber: process.env.GITHUB_RUN_NUMBER || null,
  firstFailure,
  failedStages,
  steps,
  diagnosis: recommendation,
  governance: {
    mode: "validated-self-development",
    automaticCodeMutation: false,
    automaticProductionRollback: false,
    destructiveResourceMutation: false,
    secretMutation: false,
    nextAction: "GPT/human reviews this packet, proposes the smallest repair, then the full safety/CI/E2E chain must pass before acceptance."
  }
};

const md = [
  "# P3 Repair Packet",
  "",
  `**First failure:** ${firstFailure}`,
  `**Category:** ${recommendation.category}`,
  `**Risk:** ${recommendation.risk}`,
  `**Automatic code mutation:** DISABLED`,
  "",
  "## Stage outcomes",
  ...Object.entries(steps).map(([name, value]) => `- ${name}: ${value}`),
  "",
  "## Inspect first",
  ...recommendation.inspect.map((item) => `- ${item}`),
  "",
  "## Recommended next action",
  recommendation.next,
  "",
  "## Safety rule",
  "Do not bypass security/safety/preflight gates, do not expose secrets, and do not delete/recreate production resources to make a failed run pass.",
  ""
].join("\n");

await writeFile("p3-repair-packet.json", `${JSON.stringify(packet, null, 2)}\n`, "utf8");
await writeFile("p3-repair-packet.md", md, "utf8");
console.log(`P3 REPAIR PACKET CREATED firstFailure=${firstFailure} risk=${recommendation.risk}`);
