import worker from "../src/index.js";

const env = { P3_VERSION: "0.1.0", P3_MODE: "selftest" };
const cases = [
  ["https://local.test/health", 200, b => b.ok && b.service === "p3-automation-hub"],
  ["https://local.test/healthz", 200, b => b.ok && b.stage === "deployment-channel"],
  ["https://local.test/preflight", 200, b => b.ok && b.checks.workerRuntime === true],
  ["https://local.test/nope", 404, b => b.error === "NOT_FOUND"]
];

for (const [url, status, validate] of cases) {
  const res = await worker.fetch(new Request(url), env);
  const body = await res.json();
  if (res.status !== status || !validate(body)) {
    console.error("SELFTEST FAILED", url, res.status, body);
    process.exit(1);
  }
}
const post = await worker.fetch(new Request("https://local.test/health", { method: "POST" }), env);
if (post.status !== 405) {
  console.error("SELFTEST FAILED method guard", post.status);
  process.exit(1);
}
console.log("SELFTEST PASS (5/5)");
