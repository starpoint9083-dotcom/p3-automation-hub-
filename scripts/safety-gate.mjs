import { readFile, readdir } from "node:fs/promises";
import { relative } from "node:path";

const root = new URL("../", import.meta.url);
const scanRoots = [
  new URL("../.github/workflows/", import.meta.url),
  new URL("../scripts/", import.meta.url),
  new URL("../src/", import.meta.url)
];

// These files only inspect text/config and never execute shell/process commands.
// They intentionally contain forbidden-command signatures as detection rules.
const skippedBasenames = new Set([
  "safety-gate.mjs",
  "security-check.mjs",
  "preflight.mjs"
]);
const textExt = /\.(?:mjs|js|cjs|ts|tsx|json|jsonc|ya?ml|sh)$/i;

// P3 validated-self-development rule: destructive production operations are never
// allowed to enter an unattended execution path. High-risk actions require a
// separate, explicit human-approved procedure outside this pipeline.
const forbidden = [
  { name: "Worker delete", re: /\bwrangler\s+delete\b/i },
  { name: "D1 delete", re: /\bwrangler\s+d1\s+delete\b/i },
  { name: "R2 bucket delete", re: /\bwrangler\s+r2\s+bucket\s+delete\b/i },
  { name: "KV namespace delete", re: /\bwrangler\s+kv\s+namespace\s+delete\b/i },
  { name: "Secret delete", re: /\bwrangler\s+secret\s+delete\b/i },
  { name: "Force push", re: /\bgit\s+push\b[^\n]*(?:--force|-f)(?:\s|$)/i },
  { name: "Git hard reset", re: /\bgit\s+reset\s+--hard\b/i }
];

async function walk(dirUrl, out = []) {
  const entries = await readdir(dirUrl, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") continue;
    const child = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, dirUrl);
    if (entry.isDirectory()) await walk(child, out);
    else if (textExt.test(entry.name) && !skippedBasenames.has(entry.name)) out.push(child);
  }
  return out;
}

const files = [];
for (const dir of scanRoots) await walk(dir, files);

const findings = [];
for (const file of files) {
  const text = await readFile(file, "utf8").catch(() => "");
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    for (const rule of forbidden) {
      if (rule.re.test(lines[i])) {
        findings.push(`${rule.name}: ${relative(root.pathname, file.pathname)}:${i + 1}`);
      }
    }
  }
}

if (findings.length) {
  console.error("SAFETY GATE BLOCKED DEPLOYMENT");
  console.error("Validated self-development policy forbids unattended destructive operations.");
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

console.log(`SAFETY GATE PASS (${files.length} executable/config files scanned; destructive unattended operations blocked)`);
