const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff"
};

const DEFAULT_P1_BASE_URL = "https://k-stella-shorts-factory.k-stella-p1.workers.dev";
const ALLOWED_P1_HOST = "k-stella-shorts-factory.k-stella-p1.workers.dev";
const DEFAULT_P2_BASE_URL = "https://my-life-room-v13-live-0910.starpoint9083.workers.dev";
const ALLOWED_P2_HOST = "my-life-room-v13-live-0910.starpoint9083.workers.dev";
const P2_FLOW_MANIFEST_PATH = "/assets/cinema_flow_manifest_v1.json";
const P2_FLOW_BASELINE = "P2 Cinema Pilot Baseline v1";

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
    version: env.P3_VERSION || "0.4.0",
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
    version: env.P3_VERSION || "0.4.0",
    checks: {
      workerRuntime: true,
      workersDev: true,
      p1BridgeConfigured: p1UrlValid,
      p2SupervisorConfigured: p2UrlValid,
      p2TechnicalQualityGateConfigured: p2UrlValid,
      p2VisualQualityObservationConfigured: p2UrlValid,
      p2MotionQualityObservationConfigured: p2UrlValid,
      p2FlowManifestObservationConfigured: p2UrlValid,
      d1: Boolean(env.P3_DB),
      r2: Boolean(env.P3_ASSETS),
      workersAI: Boolean(env.AI)
    },
    safety: {
      p2Mode: "read-only-supervisor",
      p2OwnsDeployment: true,
      p2OwnsPlayback: true,
      p2CinemaBaselineLocked: true,
      paidCinemaGenerationFromP3: false,
      paidVisualAIFromP3: false,
      paidMotionAIFromP3: false,
      autoCinemaRegenerationFromP3: false,
      resourceMutationFromP3: false
    },
    note: "P3 supervises P2 through strict allowlisted HTTPS GET probes, including the locked 9-clip/27-flow Cinema manifest. P3 never starts paid AI, playback mutations, regeneration, or resource changes."
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
        "user-agent": "p3-automation-hub/0.4"
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
      cinema: "/api/cinema/batch/latest-public",
      quality: "/api/cinema/batch/quality-public",
      visualQc: "/api/cinema/batch/visual-qc/latest-public",
      motionQc: "/api/cinema/batch/motion-qc/latest-public",
      flows: P2_FLOW_MANIFEST_PATH
    },
    cinema_flow: {
      baseline: P2_FLOW_BASELINE,
      baselineLocked: true,
      clipSlots: 9,
      logicalCombinations: 27,
      p2OwnsPlayback: true,
      p3ReadOnlySupervisor: true
    },
    protected_resources: [
      "worker:my-life-room-v13-live-0910",
      "d1:my-life-room-v13",
      "r2:my-life-room-assets-v13",
      "workflow:my-life-room-cinema-v23"
    ],
    quality_gate: {
      technical: "automatic-read-only",
      visual: "user-started-paid-qc-read-only-observation",
      motion: "user-started-paid-four-checkpoint-qc-read-only-observation",
      autoRegeneration: false
    },
    control: {
      enabled: false,
      mode: "read-only-supervisor",
      reason: "P2 owns deployment, playback, and mutations. P3 never auto-calls paid Cinema generation, visual AI, sampled-motion AI, or regeneration endpoints."
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

async function p2Quality(env) {
  try {
    const upstream = await upstreamJson(p2BaseUrl(env), "/api/cinema/batch/quality-public");
    const connected = upstream.ok && upstream.body?.ok === true;
    const b = upstream.body || {};
    const clips = Array.isArray(b.clips) ? b.clips.map(c => ({
      slot: String(c?.slot || ""),
      frame: Boolean(c?.frame),
      video: Boolean(c?.video),
      bytes: Number(c?.bytes || 0),
      duration: Number(c?.duration || 0),
      contentType: c?.contentType ?? null,
      model: c?.model ?? null,
      technicalOk: Boolean(c?.technicalOk)
    })) : [];
    const technicalPass = Boolean(b.technicalPass);
    const technicalScore = Number(b.technicalScore || 0);
    const ready = Number(b.ready || 0);
    const total = Number(b.total || 9);
    return json({
      ok: connected,
      project: "P2",
      connected,
      upstream_status: upstream.status,
      latency_ms: upstream.latency_ms,
      quality: connected ? {
        status: b.status ?? "unknown",
        ready,
        total,
        technicalPass,
        technicalScore,
        visualReview: b.visualReview ?? "pending",
        clips,
        updatedAt: b.updatedAt ?? null
      } : b,
      gate: {
        technical: connected && ready === total && total === 9 && technicalPass && technicalScore === 100,
        visual: b.visualReview ?? "pending",
        visualCriteria: ["face-consistency","hands-limbs","pet-count-form","room-continuity","camera-motion","morphing-flicker"],
        autoRegeneration: false,
        paid_visual_ai_triggered: false,
        paid_visual_ai_triggered_by_p3: false,
        paid_generation_triggered: false
      }
    }, connected ? 200 : 502);
  } catch (error) {
    return json({ ok: false, project: "P2", connected: false, error: error?.name === "AbortError" ? "P2_QUALITY_TIMEOUT" : (error?.message || "P2_QUALITY_UNREACHABLE") }, 502);
  }
}

async function p2VisualQc(env) {
  try {
    const upstream = await upstreamJson(p2BaseUrl(env), "/api/cinema/batch/visual-qc/latest-public");
    const connected = upstream.ok && upstream.body?.ok === true;
    const b = upstream.body || {};
    const clips = Array.isArray(b.clips) ? b.clips.map(c => {
      const scored = c?.scored === true;
      return {
        slot: String(c?.slot || ""),
        scored,
        score: scored && c?.score !== null && c?.score !== undefined ? Number(c.score) : null,
        pass: scored && Boolean(c?.pass),
        regenerationCandidate: scored && Boolean(c?.regenerationCandidate),
        issues: Array.isArray(c?.issues) ? c.issues.map(x=>String(x).slice(0,180)).slice(0,5) : [],
        error: scored ? null : (c?.error ? String(c.error).slice(0,180) : null)
      };
    }) : [];
    const scoredCount = Number.isFinite(Number(b.scoredCount)) ? Number(b.scoredCount) : clips.filter(c=>c.scored).length;
    const visualScore = b.visualScore === null || b.visualScore === undefined ? null : Number(b.visualScore);
    return json({
      ok: connected,
      project: "P2",
      connected,
      upstream_status: upstream.status,
      latency_ms: upstream.latency_ms,
      visualQc: connected ? {
        status: b.status ?? "unknown",
        ready: Number(b.ready || 0),
        scoredCount,
        total: Number(b.total || 9),
        complete: Boolean(b.complete),
        visualScore,
        pass: Boolean(b.pass),
        error: b.error ?? null,
        model: b.model ?? null,
        candidates: Array.isArray(b.candidates) ? b.candidates.map(String).slice(0,9) : [],
        clips,
        motionReview: b.motionReview ?? "pending-sampled-motion-pass",
        updatedAt: b.updatedAt ?? null
      } : b,
      safety: {
        p3TriggeredPaidVisualAI: false,
        p3TriggeredRegeneration: false,
        observationOnly: true
      }
    }, connected ? 200 : 502);
  } catch (error) {
    return json({ ok: false, project: "P2", connected: false, error: error?.name === "AbortError" ? "P2_VISUAL_QC_TIMEOUT" : (error?.message || "P2_VISUAL_QC_UNREACHABLE") }, 502);
  }
}

async function p2MotionQc(env) {
  try {
    const upstream = await upstreamJson(p2BaseUrl(env), "/api/cinema/batch/motion-qc/latest-public");
    const connected = upstream.ok && upstream.body?.ok === true;
    const b = upstream.body || {};
    const clips = Array.isArray(b.clips) ? b.clips.map(c => {
      const scored = c?.scored === true;
      return {
        slot: String(c?.slot || ""),
        scored,
        score: scored && c?.score !== null && c?.score !== undefined ? Number(c.score) : null,
        pass: scored && Boolean(c?.pass),
        regenerationCandidate: scored && Boolean(c?.regenerationCandidate),
        issues: Array.isArray(c?.issues) ? c.issues.map(x=>String(x).slice(0,180)).slice(0,5) : [],
        error: scored ? null : (c?.error ? String(c.error).slice(0,180) : null)
      };
    }) : [];
    const scoredCount = Number.isFinite(Number(b.scoredCount)) ? Number(b.scoredCount) : clips.filter(c=>c.scored).length;
    const motionScore = b.motionScore === null || b.motionScore === undefined ? null : Number(b.motionScore);
    return json({
      ok: connected,
      project: "P2",
      connected,
      upstream_status: upstream.status,
      latency_ms: upstream.latency_ms,
      motionQc: connected ? {
        status: b.status ?? "unknown",
        ready: Number(b.ready || 0),
        scoredCount,
        total: Number(b.total || 9),
        complete: Boolean(b.complete),
        motionScore,
        pass: Boolean(b.pass),
        error: b.error ?? null,
        model: b.model ?? null,
        sampling: b.sampling ?? "4-checkpoint-contact-sheet",
        candidates: Array.isArray(b.candidates) ? b.candidates.map(String).slice(0,9) : [],
        clips,
        updatedAt: b.updatedAt ?? null
      } : b,
      safety: {
        p3TriggeredPaidMotionAI: false,
        p3TriggeredRegeneration: false,
        observationOnly: true
      }
    }, connected ? 200 : 502);
  } catch (error) {
    return json({ ok: false, project: "P2", connected: false, error: error?.name === "AbortError" ? "P2_MOTION_QC_TIMEOUT" : (error?.message || "P2_MOTION_QC_UNREACHABLE") }, 502);
  }
}

function validateFlowManifest(b) {
  const slots = Array.isArray(b?.clipSlots) ? b.clipSlots.map(String) : [];
  const flows = Array.isArray(b?.flows) ? b.flows : [];
  const bases = Array.isArray(b?.axes?.base) ? b.axes.base.map(String) : [];
  const states = Array.isArray(b?.axes?.state) ? b.axes.state.map(String) : [];
  const actions = Array.isArray(b?.axes?.action) ? b.axes.action.map(String) : [];
  const uniqueSlots = new Set(slots);
  const ids = flows.map(f => String(f?.id || ""));
  const uniqueIds = new Set(ids);
  const expectedIds = new Set(bases.flatMap(base => states.flatMap(state => actions.map(action => `${base}.${state}.${action}`))));
  const allExpected = ids.length === expectedIds.size && ids.every(id => expectedIds.has(id));
  const policy = b?.runtimePolicy || {};
  const qc = b?.qcBaseline || {};
  const safe = b?.version === "1.0.0" && b?.baseline === P2_FLOW_BASELINE && b?.locked === true &&
    slots.length === 9 && uniqueSlots.size === 9 && bases.length === 3 && states.length === 3 && actions.length === 3 &&
    Number(b?.logicalCombinations) === 27 && flows.length === 27 && uniqueIds.size === 27 && allExpected &&
    policy.reuseExistingNineClips === true && policy.autoRegeneration === false && policy.paidGenerationOnRuntime === false &&
    policy.p2OwnsPlayback === true && policy.p3ReadOnlySupervisor === true && qc.technical === "pass" && qc.visual === "pass" && qc.motion === "pass";
  return { safe, slots, flows, bases, states, actions, ids, policy, qc };
}

async function p2Flows(env) {
  try {
    const upstream = await upstreamJson(p2BaseUrl(env), P2_FLOW_MANIFEST_PATH);
    const connected = upstream.ok && upstream.body && typeof upstream.body === "object";
    const b = upstream.body || {};
    const v = validateFlowManifest(b);
    return json({
      ok: connected && v.safe,
      project: "P2",
      connected,
      upstream_status: upstream.status,
      latency_ms: upstream.latency_ms,
      cinemaFlow: connected ? {
        version: b.version ?? null,
        baseline: b.baseline ?? null,
        baselineLocked: b.locked === true,
        clipSlots: v.slots,
        clipSlotCount: v.slots.length,
        logicalCombinations: Number(b.logicalCombinations || 0),
        axes: { base: v.bases, state: v.states, action: v.actions },
        flowIds: v.ids,
        qcBaseline: v.qc,
        runtimePolicy: v.policy
      } : b,
      safe: connected && v.safe,
      safety: {
        p2OwnsPlayback: v.policy?.p2OwnsPlayback === true,
        p3ReadOnlySupervisor: v.policy?.p3ReadOnlySupervisor === true,
        p3TriggeredPaidGeneration: false,
        p3TriggeredRegeneration: false,
        observationOnly: true
      }
    }, connected && v.safe ? 200 : 502);
  } catch (error) {
    return json({ ok: false, project: "P2", connected: false, error: error?.name === "AbortError" ? "P2_FLOWS_TIMEOUT" : (error?.message || "P2_FLOWS_UNREACHABLE") }, 502);
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
    if (url.pathname === "/projects/p2/quality") return p2Quality(env);
    if (url.pathname === "/projects/p2/visual-qc") return p2VisualQc(env);
    if (url.pathname === "/projects/p2/motion-qc") return p2MotionQc(env);
    if (url.pathname === "/projects/p2/flows") return p2Flows(env);
    return json({ ok: false, error: "NOT_FOUND", path: url.pathname }, 404);
  }
};