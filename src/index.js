const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff"
};

const DEFAULT_P1_BASE_URL = "https://k-stella-shorts-factory.k-stella-p1.workers.dev";
const ALLOWED_P1_HOST = "k-stella-shorts-factory.k-stella-p1.workers.dev";

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: JSON_HEADERS });
}

function health(env) {
  return {
    ok: true,
    service: "p3-automation-hub",
    version: env.P3_VERSION || "0.2.0",
    mode: env.P3_MODE || "p1-bridge",
    stage: "deployment-channel",
    integration: "p1-bridge",
    timestamp: new Date().toISOString()
  };
}

function p1BaseUrl(env) {
  const value = env.P1_BASE_URL || DEFAULT_P1_BASE_URL;
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== ALLOWED_P1_HOST || url.username || url.password) {
    throw new Error("P1_BASE_URL_NOT_ALLOWED");
  }
  return url.origin;
}

function preflight(env) {
  let p1UrlValid = false;
  try {
    p1BaseUrl(env);
    p1UrlValid = true;
  } catch {}
  return {
    ok: p1UrlValid,
    service: "p3-automation-hub",
    version: env.P3_VERSION || "0.2.0",
    checks: {
      workerRuntime: true,
      workersDev: true,
      p1BridgeConfigured: p1UrlValid,
      d1: Boolean(env.P3_DB),
      r2: Boolean(env.P3_ASSETS),
      workersAI: Boolean(env.AI)
    },
    note: "P3 is connected to P1 through a strict allowlisted HTTPS bridge. Operational control remains disabled until dedicated secrets are configured."
  };
}

async function upstreamJson(env, path) {
  const base = p1BaseUrl(env);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  const started = Date.now();
  try {
    const response = await fetch(`${base}${path}`, {
      method: "GET",
      headers: {
        "accept": "application/json",
        "cache-control": "no-cache",
        "user-agent": "p3-automation-hub/0.2"
      },
      signal: controller.signal
    });
    const text = await response.text();
    let body = null;
    try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 500) }; }
    return {
      ok: response.ok,
      status: response.status,
      latency_ms: Date.now() - started,
      body
    };
  } finally {
    clearTimeout(timer);
  }
}

function p1Descriptor(env) {
  let baseUrl = null;
  let configured = false;
  try {
    baseUrl = p1BaseUrl(env);
    configured = true;
  } catch {}
  return {
    ok: configured,
    project: "P1",
    service: "K Stella Way / k-stella-shorts-factory",
    repository: "starpoint9083-dotcom/k-stella-way-p1",
    base_url: baseUrl,
    bridge: configured ? "configured" : "invalid",
    control: {
      enabled: false,
      reason: "P1 operational APIs require a dedicated admin bearer secret; public bridge is health/status only."
    }
  };
}

async function p1Health(env) {
  try {
    const upstream = await upstreamJson(env, "/healthz");
    const connected = upstream.ok && upstream.body?.ok === true;
    return json({
      ok: connected,
      project: "P1",
      connected,
      upstream_status: upstream.status,
      latency_ms: upstream.latency_ms,
      p1: connected ? {
        version: upstream.body?.version ?? null,
        db: Boolean(upstream.body?.db),
        storage: Boolean(upstream.body?.r2),
        ai: Boolean(upstream.body?.ai)
      } : upstream.body
    }, connected ? 200 : 502);
  } catch (error) {
    return json({
      ok: false,
      project: "P1",
      connected: false,
      error: error?.name === "AbortError" ? "P1_TIMEOUT" : (error?.message || "P1_UNREACHABLE")
    }, 502);
  }
}

async function p1Bootstrap(env) {
  try {
    const upstream = await upstreamJson(env, "/api/bootstrap/status");
    return json({
      ok: upstream.ok,
      project: "P1",
      connected: upstream.ok,
      upstream_status: upstream.status,
      latency_ms: upstream.latency_ms,
      bootstrap: upstream.body
    }, upstream.ok ? 200 : 502);
  } catch (error) {
    return json({
      ok: false,
      project: "P1",
      connected: false,
      error: error?.name === "AbortError" ? "P1_TIMEOUT" : (error?.message || "P1_UNREACHABLE")
    }, 502);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method !== "GET") return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
    if (url.pathname === "/" || url.pathname === "/health" || url.pathname === "/healthz") return json(health(env));
    if (url.pathname === "/preflight") return json(preflight(env));
    if (url.pathname === "/projects/p1") return json(p1Descriptor(env));
    if (url.pathname === "/projects/p1/health") return p1Health(env);
    if (url.pathname === "/projects/p1/bootstrap") return p1Bootstrap(env);
    return json({ ok: false, error: "NOT_FOUND", path: url.pathname }, 404);
  }
};
