const P1_BASE_URL = (process.env.P1_BASE_URL || 'https://k-stella-shorts-factory.k-stella-p1.workers.dev').replace(/\/$/, '');
const OIDC_AUDIENCE = 'k-stella-p1-p3-bridge';

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

async function api(path) {
  const response = await fetch(new URL(path, `${P1_BASE_URL}/`), {
    headers: { accept: 'application/json', cookie },
    cache: 'no-store'
  });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 1000) }; }
  if (!response.ok) throw new Error(`GET ${path} failed (${response.status}): ${data?.error || JSON.stringify(data)}`);
  return data;
}

const latest = await api('/api/lineups/latest');
const lineup = latest?.lineup || null;
const items = Array.isArray(latest?.items) ? latest.items : [];
const projectIds = new Set(items.map((item) => String(item?.project_id || '')).filter(Boolean));
console.log(`QUEUE_DIAG lineup=${lineup?.id || 'none'} items=${items.length} projects=${projectIds.size}`);

const statuses = ['waiting', 'generating', 'cancelled', 'linked'];
const allRows = [];
for (const status of statuses) {
  const result = await api(`/api/queue?status=${encodeURIComponent(status)}`);
  const rows = (Array.isArray(result?.queue) ? result.queue : []).filter((row) => projectIds.has(String(row?.project_id || '')));
  allRows.push(...rows.map((row) => ({ ...row, _queried_status: status })));
  const withGeneratedAsset = rows.filter((row) => row?.generated_asset_id).length;
  const withoutGeneratedAsset = rows.length - withGeneratedAsset;
  console.log(`QUEUE_DIAG status=${status} rows=${rows.length} generated_asset=${withGeneratedAsset} no_generated_asset=${withoutGeneratedAsset}`);
}

for (const projectId of projectIds) {
  const rows = allRows.filter((row) => String(row?.project_id || '') === projectId);
  const counts = Object.fromEntries(statuses.map((status) => [status, rows.filter((row) => row._queried_status === status).length]));
  const generated = rows.filter((row) => row?.generated_asset_id).length;
  console.log(`QUEUE_DIAG project=${projectId} waiting=${counts.waiting} generating=${counts.generating} cancelled=${counts.cancelled} linked=${counts.linked} generated_asset_rows=${generated} total=${rows.length}`);
}

const unknown = Math.max(0, projectIds.size * 10 - allRows.length);
console.log(`QUEUE_DIAG visible_rows=${allRows.length} expected_scene_rows~=${projectIds.size * 10} unaccounted~=${unknown}`);
