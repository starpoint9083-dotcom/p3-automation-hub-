const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff"
};

const DEFAULT_P1_BASE_URL = "https://k-stella-shorts-factory.k-stella-p1.workers.dev";
const ALLOWED_P1_HOST = "k-stella-shorts-factory.k-stella-p1.workers.dev";
const DEFAULT_P2_BASE_URL = "https://my-life-room-v13-live-0910.starpoint9083.workers.dev";
const ALLOWED_P2_HOST = "my-life-room-v13-live-0910.starpoint9083.workers.dev";

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: JSON_HEADERS });
}

function strictBaseUrl(value, allowedHost, errorCode) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== allowedHost || url.username || url.password || url.pathname !== "/") {
    throw new Error(errorCode);
  }
  return url.origin;
}

function p1BaseUrl(env) {
  return strictBaseUrl(env.P1_BASE_URL || DEFAULT_P1_BASE_URL, ALLOWED_P1_HOST, "P1_BASE_URL_NOT_ALLOWED");
}

function p2BaseUrl(env) {
  return strictBaseUrl(env.P2_BASE_URL || DEFAULT_P2_BASE_URL, ALLOWED_P2_HOST, "P2_BASE_URL_NOT_ALLOWED");
}

function health(env) {
  return {
    ok: true,
    service: "p3-automation-hub",
    version: env.P3_VERSION || "0.3.0",
    mode: env.P3_MODE || "p1-p2-supervisor",
    stage: "deployment-channel",
    integration: "p1-p2-supervisor",
    timestamp: new Date().toISOString()
  };
}

function preflight(env) {
  let p1UrlValid = false;
  let p2UrlValid = false;
  try { p1BaseUrl(env); p1UrlValid = true; } catch {}
  try { p2BaseUrl(env); p2UrlValid = true; } catch {}
  return {
    ok: p1UrlValid && p2UrlValid,
    service: "p3-automation-hub",
    version: env.P3_VERSION || "0.3.0",
    checks: {
      workerRuntime: true,
      workersDev: true,
      p1BridgeConfigured: p1UrlValid,
      p2SupervisorConfigured: p2UrlValid,
      d1: Boolean(env.P3_DB),
      r2: Boolean(env.P3_ASSETS),
      workersAI: Boolean(env.AI)
    },
    safety: {
      p2Mode: "read-only-supervisor",
      p2OwnsDeployment: true,
      paidCinemaGenerationFromP3: false,
      resourceMutationFromP3: false
    },
    note: "P3 supervises P2 through strict allowlisted HTTPS GET probes. P2 keeps ownership of deployment and Cloudflare resources. Paid Cinema generation is never triggered by P3."
  };
}

async function upstreamJson(base, path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  const started = Date.now();
  try {
    const response = await fetch(`${base}${path}`, {
      method: "GET",
      headers: {
        "accept": "application/json",
        "cache-control": "no-cache",
        "user-agent": "p3-automation-hub/0.3"
      },
      signal: controller.signal
    });
    const text = await response.text();
    let body = null;
    try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 500) }; }
    return { ok: response.ok, status: response.status, latency_ms: Date.now() - started, body };
  } finally {
    clearTimeout(timer);
  }
}

function p1Descriptor(env) {
  let baseUrl = null;
  let configured = false;
  try { baseUrl = p1BaseUrl(env); configured = true; } catch {}
  return {
    ok: configured,
    project: "P1",
    service: "K Stella Way / k-stella-shorts-factory",
    repository: "starpoint9083-dotcom/k-stella-way-p1",
    base_url: baseUrl,
    bridge: configured ? "configured" : "invalid",
    probe: "/healthz",
    control: {
      enabled: false,
      reason: "Public bridge is health/status only. Operational control uses a separate explicit workflow."
    }
  };
}

function p2Descriptor(env) {
  let baseUrl = null;
  let configured = false;
  try { baseUrl = p2BaseUrl(env); configured = true; } catch {}
  return {
    ok: configured,
    project: "P2",
    service: "My Life Room / Cinema Room V23",
    repository: "starpoint9083-dotcom/my-life-room-v13-app",
    base_url: baseUrl,
    bridge: configured ? "configured" : "invalid",
    probes: {
      health: "/api/health",
      cinema: "/api/cinema/batch/latest-public"
    },
    protected_resources: [
      "worker:my-life-room-v13-live-0910",
      "d1:my-life-room-v13",
      "r2:my-life-room-assets-v13",
      "workflow:my-life-room-cinema-v23"
    ],
    control: {
      enabled: false,
      mode: "read-only-supervisor",
      reason: "P2 owns deployment and mutations. P3 never auto-calls paid Cinema generation endpoints."
    }
  };
}

async function p1Health(env) {
  try {
    const upstream = await upstreamJson(p1BaseUrl(env), "/healthz");
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
    return json({ ok: false, project: "P1", connected: false, error: error?.name === "AbortError" ? "P1_TIMEOUT" : (error?.message || "P1_UNREACHABLE") }, 502);
  }
}

async function p2Health(env) {
  try {
    const upstream = await upstreamJson(p2BaseUrl(env), "/api/health");
    const connected = upstream.ok && upstream.body?.ok === true;
    const b = upstream.body || {};
    return json({
      ok: connected,
      project: "P2",
      connected,
      upstream_status: upstream.status,
      latency_ms: upstream.latency_ms,
      p2: connected ? {
        d1: Boolean(b.d1),
        r2: Boolean(b.r2),
        ai: Boolean(b.ai),
        model: b.model ?? null,
        lifeEngine: Boolean(b.lifeEngine),
        cinemaEngine: b.cinemaEngine ?? null,
        cinemaBackground: Boolean(b.cinemaBackground)
      } : b,
      safe: connected && Boolean(b.d1) && Boolean(b.r2) && Boolean(b.ai) && Boolean(b.cinemaBackground)
    }, connected ? 200 : 502);
  } catch (error) {
    return json({ ok: false, project: "P2", connected: false, error: error?.name === "AbortError" ? "P2_TIMEOUT" : (error?.message || "P2_UNREACHABLE") }, 502);
  }
}

async function p2Cinema(env) {
  try {
    const upstream = await upstreamJson(p2BaseUrl(env), "/api/cinema/batch/latest-public");
    const connected = upstream.ok && upstream.body?.ok === true;
    const b = upstream.body || {};
    return json({
      ok: connected,
      project: "P2",
      connected,
      upstream_status: upstream.status,
      latency_ms: upstream.latency_ms,
      cinema: connected ? {
        status: b.status ?? "unknown",
        ready: Number(b.ready ?? 0),
        total: Number(b.total ?? 9),
        complete: Boolean(b.complete),
        error: b.error ?? null,
        updatedAt: b.updatedAt ?? null
      } : b,
      paid_generation_triggered: false
    }, connected ? 200 : 502);
  } catch (error) {
    return json({ ok: false, project: "P2", connected: false, error: error?.name === "AbortError" ? "P2_CINEMA_TIMEOUT" : (error?.message || "P2_CINEMA_UNREACHABLE") }, 502);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method !== "GET") return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
    if (url.pathname === "/" || url.pathname === "/health" || url.pathname === "/healthz") return json(health(env));
    if (url.pathname === "/preflight") return json(preflight(env));
    if (url.pathname === "/projects") return json({ ok: true, projects: [p1Descriptor(env), p2Descriptor(env)] });
    if (url.pathname === "/projects/p1") return json(p1Descriptor(env));
    if (url.pathname === "/projects/p1/health") return p1Health(env);
    if (url.pathname === "/projects/p2") return json(p2Descriptor(env));
    if (url.pathname === "/projects/p2/health") return p2Health(env);
    if (url.pathname === "/projects/p2/cinema") return p2Cinema(env);
    return json({ ok: false, error: "NOT_FOUND", path: url.pathname }, 404);
  }
};
