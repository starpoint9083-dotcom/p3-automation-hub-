const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: JSON_HEADERS });
}

function health(env) {
  return {
    ok: true,
    service: "p3-automation-hub",
    version: env.P3_VERSION || "0.1.0",
    mode: env.P3_MODE || "skeleton",
    stage: "deployment-channel",
    timestamp: new Date().toISOString()
  };
}

function preflight(env) {
  return {
    ok: true,
    service: "p3-automation-hub",
    version: env.P3_VERSION || "0.1.0",
    checks: {
      workerRuntime: true,
      workersDev: true,
      d1: Boolean(env.P3_DB),
      r2: Boolean(env.P3_ASSETS),
      workersAI: Boolean(env.AI)
    },
    note: "V0.1 intentionally proves deployment first. D1/R2/Workers AI are attached after the live URL passes E2E."
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method !== "GET") return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
    if (url.pathname === "/" || url.pathname === "/health" || url.pathname === "/healthz") return json(health(env));
    if (url.pathname === "/preflight") return json(preflight(env));
    return json({ ok: false, error: "NOT_FOUND", path: url.pathname }, 404);
  }
};
