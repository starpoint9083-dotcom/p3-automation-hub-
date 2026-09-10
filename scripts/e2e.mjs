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

await check("/health", b => b?.ok === true && b?.service === "p3-automation-hub" && b?.stage === "deployment-channel");
await check("/preflight", b => b?.ok === true && b?.checks?.workerRuntime === true);
console.log(`E2E COMPLETE ${base}`);
