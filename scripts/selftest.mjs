import worker from "../src/index.js";

const env = {
  P3_VERSION: "0.3.0",
  P3_MODE: "p1-p2-supervisor",
  P1_BASE_URL: "https://k-stella-shorts-factory.k-stella-p1.workers.dev",
  P2_BASE_URL: "https://my-life-room-v13-live-0910.starpoint9083.workers.dev"
};
const cases = [
  ["https://local.test/health", 200, b => b.ok && b.service === "p3-automation-hub" && b.integration === "p1-p2-supervisor"],
  ["https://local.test/healthz", 200, b => b.ok && b.stage === "deployment-channel"],
  ["https://local.test/preflight", 200, b => b.ok && b.checks.workerRuntime === true && b.checks.p2SupervisorConfigured === true],
  ["https://local.test/projects", 200, b => b.ok && Array.isArray(b.projects) && b.projects.some(p => p.project === "P2")],
  ["https://local.test/projects/p2", 200, b => b.ok && b.project === "P2" && b.control?.mode === "read-only-supervisor"],
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
const post = await worker.fetch(new Request("https://local.test/projects/p2", { method: "POST" }), env);
if (post.status !== 405) {
  console.error("SELFTEST FAILED method guard", post.status);
  process.exit(1);
}
console.log("SELFTEST PASS (7/7)");
