import { readFile } from "node:fs/promises";

const logPath = process.argv[2];
if (!logPath) {
  console.error("Usage: node scripts/parse-deploy-url.mjs <deploy-log>");
  process.exit(2);
}
const text = await readFile(logPath, "utf8");
const matches = [...text.matchAll(/https:\/\/[^\s]+\.workers\.dev\/?/g)].map(m => m[0].replace(/[),.;]+$/, ""));
if (!matches.length) {
  console.error("No workers.dev URL found in deployment log");
  process.exit(1);
}
console.log(matches.at(-1));
