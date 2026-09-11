const P1_BASE_URL = (process.env.P1_BASE_URL || 'https://k-stella-shorts-factory.k-stella-p1.workers.dev').replace(/\/$/, '');
const OIDC_AUDIENCE = 'k-stella-p1-p3-bridge';
const API_TIMEOUT_MS = 4 * 60 * 1000;
const MAX_PASSES = 3;

if (new URL(P1_BASE_URL).hostname !== 'k-stella-shorts-factory.k-stella-p1.workers.dev') {
  throw new Error('P1_BASE_URL host is not allowlisted.');
}

async function requestGitHubOidcToken() {
  const requestUrl = String(process.env.ACTIONS_ID_TOKEN_REQUEST_URL || '');
  const requestToken = String(process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN || '');
  if (!requestUrl || !requestToken) throw new Error('GitHub OIDC environment is unavailable.');
  const url = new URL(requestUrl);
  url.searchParams.set('audience', OIDC_AUDIENCE);
  const response = await fetch(url, {
    headers: { accept: 'application/json', authorization: `Bearer ${requestToken}` },
    cache: 'no-store'
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.value) throw new Error(`OIDC token request failed (${response.status}).`);
  return String(data.value);
}

function sessionCookieFrom(setCookie) {
  const match = String(setCookie || '').match(/(?:^|[,;]\s*)kstella_session=([^;,\s]+)/);
  if (!match) throw new Error('P1 session cookie missing from OIDC exchange.');
  return `kstella_session=${match[1]}`;
}

const oidcToken = await requestGitHubOidcToken();
const sessionResponse = await fetch(`${P1_BASE_URL}/api/session`, {
  method: 'POST',
  headers: { accept: 'application/json', authorization: `Bearer ${oidcToken}` },
  cache: 'no-store'
});
const sessionBody = await sessionResponse.json().catch(() => ({}));
if (!sessionResponse.ok || !sessionBody?.ok) {
  throw new Error(`P1 OIDC session exchange failed (${sessionResponse.status}): ${sessionBody?.error || 'unknown'}`);
}
const cookie = sessionCookieFrom(sessionResponse.headers.get('set-cookie'));

async function api(path, { method = 'GET', body, timeoutMs = API_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = { accept: 'application/json', cookie };
    if (body !== undefined) headers['content-type'] = 'application/json';
    const response = await fetch(new URL(path, `${P1_BASE_URL}/`), {
      method,
      headers,
      cache: 'no-store',
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal
    });
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 1000) }; }
    if (!response.ok) throw new Error(`${method} ${path} failed (${response.status}): ${data?.error || JSON.stringify(data)}`);
    return data;
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error(`${method} ${path} timed out after ${Math.round(timeoutMs / 1000)}s`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

const latest = await api('/api/lineups/latest', { timeoutMs: 60 * 1000 });
const lineup = latest?.lineup || null;
const items = Array.isArray(latest?.items) ? latest.items : [];
if (!lineup?.id || items.length !== 10) {
  throw new Error(`P1 latest lineup is not ready for queue processing: lineup=${lineup?.id || 'none'} items=${items.length}`);
}

const planned = await api('/api/lineups/plan-all', {
  method: 'POST',
  body: { lineup_id: String(lineup.id) },
  timeoutMs: 8 * 60 * 1000
});
console.log(`QUEUE_PROCESS planned lineup=${lineup.id} projects=${Array.isArray(planned?.planned) ? planned.planned.length : 0}`);

const production = await api('/api/production/start', {
  method: 'POST',
  body: { lineup_id: String(lineup.id) },
  timeoutMs: 2 * 60 * 1000
});
const productionItems = Array.isArray(production?.items) ? production.items : [];
const projectIds = new Set(productionItems.map((item) => String(item?.project_id || '')).filter(Boolean));
if (!projectIds.size) throw new Error('P1 production start returned no project ids.');
console.log(`QUEUE_PROCESS start lineup=${lineup.id} run=${production?.run?.id || production?.id || 'unknown'} projects=${projectIds.size}`);

// production/start may normalize or clear generation_queue state. Recover missing-scene
// queues only after the production run exists so the rebuilt waiting rows survive into processing.
const recovery = await api('/api/maintenance/recover-lineup-queues', {
  method: 'POST',
  body: { lineup_id: String(lineup.id) },
  timeoutMs: 4 * 60 * 1000
});
const recoveryProjects = Array.isArray(recovery?.projects) ? recovery.projects : [];
if (!recovery?.ok || Number(recovery?.project_count || recoveryProjects.length) !== 10) {
  throw new Error(`P1 explicit lineup recovery returned an invalid project count: ${recovery?.project_count ?? recoveryProjects.length}`);
}
const recoveryMissing = recoveryProjects.reduce((sum, row) => sum + Number(row?.missing || 0), 0);
const recoveryWaiting = recoveryProjects.reduce((sum, row) => sum + Number(row?.waiting || 0), 0);
console.log(`QUEUE_RECOVERY lineup=${lineup.id} projects=${recoveryProjects.length} rebuilt=${Number(recovery?.rebuilt || 0)} reconciled=${Number(recovery?.reconciled || 0)} missing=${recoveryMissing} waiting=${recoveryWaiting} detail=${JSON.stringify(recoveryProjects).slice(0, 6000)}`);
if (recoveryMissing > 0 && recoveryWaiting === 0) {
  throw new Error(`P1 explicit lineup recovery left missing scenes without waiting queues: missing=${recoveryMissing}`);
}

let processed = 0;
let reused = 0;
let failed = 0;
const failures = [];

for (let pass = 1; pass <= MAX_PASSES; pass++) {
  const waitingResponse = await api('/api/queue?status=waiting', { timeoutMs: 60 * 1000 });
  const waiting = (Array.isArray(waitingResponse?.queue) ? waitingResponse.queue : [])
    .filter((row) => projectIds.has(String(row?.project_id || '')));
  console.log(`QUEUE_PROCESS pass=${pass} waiting=${waiting.length}`);
  if (!waiting.length) break;

  let passSuccess = 0;
  for (let i = 0; i < waiting.length; i++) {
    const row = waiting[i];
    try {
      const result = await api('/api/queue/generate', {
        method: 'POST',
        body: { id: Number(row.id) },
        timeoutMs: API_TIMEOUT_MS
      });
      processed += 1;
      passSuccess += 1;
      if (result?.reused || result?.reused_due_to_free_limit) reused += 1;
      console.log(`QUEUE_PROCESS item=${i + 1}/${waiting.length} queue=${row.id} project=${row.project_id} scene=${row.scene_no} ok reused=${Boolean(result?.reused || result?.reused_due_to_free_limit)}`);
    } catch (error) {
      failed += 1;
      const message = String(error?.message || error).slice(0, 700);
      failures.push({ id: row.id, project_id: row.project_id, scene_no: row.scene_no, error: message });
      console.log(`QUEUE_PROCESS item=${i + 1}/${waiting.length} queue=${row.id} project=${row.project_id} scene=${row.scene_no} FAIL ${message}`);
    }
  }

  if (!passSuccess) break;
}

const remainingResponse = await api('/api/queue?status=waiting', { timeoutMs: 60 * 1000 });
const remaining = (Array.isArray(remainingResponse?.queue) ? remainingResponse.queue : [])
  .filter((row) => projectIds.has(String(row?.project_id || '')));

let missingScenes = 0;
for (const projectId of projectIds) {
  const project = await api(`/api/projects/${encodeURIComponent(projectId)}`, { timeoutMs: 60 * 1000 });
  const scenes = Array.isArray(project?.scenes) ? project.scenes : [];
  const missing = scenes.filter((scene) => !scene?.selected_asset_id || Number(scene?.missing || 0) === 1).length;
  missingScenes += missing;
  console.log(`QUEUE_PROCESS verify project=${projectId} scenes=${scenes.length} missing=${missing}`);
}

console.log(`QUEUE_PROCESS complete processed=${processed} reused=${reused} failed_calls=${failed} remaining_waiting=${remaining.length} missing_scenes=${missingScenes}`);
if (failures.length) console.log(`QUEUE_PROCESS failures=${JSON.stringify(failures).slice(0, 5000)}`);

if (remaining.length || missingScenes) {
  throw new Error(`P1 queue processing incomplete: remaining_waiting=${remaining.length}, missing_scenes=${missingScenes}, failed_calls=${failed}`);
}
