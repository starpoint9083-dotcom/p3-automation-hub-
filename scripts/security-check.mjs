import { readFile, readdir } from "node:fs/promises";
import { relative } from "node:path";

const root = new URL("../", import.meta.url);
const ignored = new Set(["node_modules", ".git", "dist"]);
const patterns = [
  { name: "OpenAI-style secret", re: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  { name: "GitHub classic token", re: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g },
  { name: "Cloudflare token assignment", re: /CLOUDFLARE_API_TOKEN\s*[=:]\s*["'][^"']{20,}["']/g },
  { name: "Private key", re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g }
];

async function walk(dirUrl, out = []) {
  const entries = await readdir(dirUrl, { withFileTypes: true });
  for (const entry of entries) {
    if (ignored.has(entry.name)) continue;
    const child = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, dirUrl);
    if (entry.isDirectory()) await walk(child, out); else out.push(child);
  }
  return out;
}

const files = await walk(root);
const findings = [];
for (const file of files) {
  const path = file.pathname;
  if (/\.(png|jpe?g|gif|webp|zip|pdf)$/i.test(path)) continue;
  const text = await readFile(file, "utf8").catch(() => "");
  for (const p of patterns) {
    if (p.re.test(text)) findings.push(`${p.name}: ${relative(root.pathname, path)}`);
    p.re.lastIndex = 0;
  }
}

if (findings.length) {
  console.error("SECURITY CHECK FAILED");
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}
console.log(`SECURITY CHECK PASS (${files.length} files scanned)`);
