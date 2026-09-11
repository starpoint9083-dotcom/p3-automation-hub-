import { readFile, writeFile } from "node:fs/promises";

const logPath = process.argv[2] || "deploy.log";
const outPath = process.argv[3] || "deployment-receipt.json";
const log = await readFile(logPath, "utf8");

const versionMatch = log.match(/Current Version ID:\s*([A-Za-z0-9-]+)/i);
const urlMatch = log.match(/https:\/\/[A-Za-z0-9.-]+\.workers\.dev\b/i);

const deployUrl = process.env.DEPLOY_URL || urlMatch?.[0] || null;
const versionId = versionMatch?.[1] || null;

if (!deployUrl) {
  console.error("DEPLOYMENT RECEIPT FAILED: deploy URL not found");
  process.exit(1);
}
if (!versionId) {
  console.error("DEPLOYMENT RECEIPT FAILED: Cloudflare Version ID not found");
  process.exit(1);
}

const receipt = {
  schemaVersion: 1,
  project: "p3-automation-hub",
  status: "last-known-good",
  deployedAt: new Date().toISOString(),
  gitSha: process.env.GITHUB_SHA || null,
  gitRef: process.env.GITHUB_REF || null,
  workflowRunId: process.env.GITHUB_RUN_ID || null,
  workflowRunNumber: process.env.GITHUB_RUN_NUMBER || null,
  deployUrl,
  cloudflareVersionId: versionId
};

await writeFile(outPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
console.log(`DEPLOYMENT RECEIPT PASS ${outPath}`);
console.log(`Last-known-good: ${deployUrl} version=${versionId}`);
