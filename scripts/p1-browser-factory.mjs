import fs from 'node:fs/promises';
import process from 'node:process';
import puppeteer from 'puppeteer-core';

const P1_BASE_URL = (process.env.P1_BASE_URL || 'https://k-stella-shorts-factory.k-stella-p1.workers.dev').replace(/\/$/, '');
const CHROME_PATH = String(process.env.CHROME_PATH || '');
const TARGET_DURATION = Math.max(50, Math.min(70, Number(process.env.P1_TARGET_DURATION || 60)));
const SUMMARY_PATH = process.env.P1_FACTORY_SUMMARY || 'p1_factory_summary.json';
const OIDC_AUDIENCE = 'k-stella-p1-p3-bridge';
const BROWSER_PROTOCOL_TIMEOUT = 20 * 60 * 1000;

if (!CHROME_PATH) throw new Error('CHROME_PATH is required. The workflow must locate Chrome/Chromium first.');
if (new URL(P1_BASE_URL).hostname !== 'k-stella-shorts-factory.k-stella-p1.workers.dev') {
  throw new Error('P1_BASE_URL host is not allowlisted.');
}

async function requestGitHubOidcToken() {
  const requestUrl = String(process.env.ACTIONS_ID_TOKEN_REQUEST_URL || '');
  const requestToken = String(process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN || '');
  if (!requestUrl || !requestToken) {
    throw new Error('GitHub OIDC environment is unavailable. The workflow needs id-token: write permission.');
  }
  const url = new URL(requestUrl);
  url.searchParams.set('audience', OIDC_AUDIENCE);
  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${requestToken}`
    },
    cache: 'no-store'
  });
  const data = await response.json().catch(() => ({}));
  const value = String(data?.value || '');
  if (!response.ok || !value) {
    throw new Error(`GitHub OIDC token request failed (${response.status}).`);
  }
  return value;
}

const kstDate = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date());

const summary = {
  ok: false,
  started_at: new Date().toISOString(),
  kst_date: kstDate(),
  p1: P1_BASE_URL,
  auth: 'github-actions-oidc-to-p1-session',
  target_duration: TARGET_DURATION,
  lineup_id: null,
  production_run_id: null,
  completed: 0,
  failed: 0,
  items: [],
  release: null
};

async function saveSummary() {
  summary.finished_at = new Date().toISOString();
  await fs.writeFile(SUMMARY_PATH, JSON.stringify(summary, null, 2));
}

const oidcToken = await requestGitHubOidcToken();
const browser = await puppeteer.launch({
  executablePath: CHROME_PATH,
  protocolTimeout: BROWSER_PROTOCOL_TIMEOUT,
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--autoplay-policy=no-user-gesture-required',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--window-size=720,1280'
  ]
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 720, height: 1280, deviceScaleFactor: 1 });
  page.setDefaultTimeout(BROWSER_PROTOCOL_TIMEOUT);

  page.on('console', (msg) => {
    const text = msg.text();
    if (/render|production|retry|quality|warning|error/i.test(text)) {
      console.log(`[P1 browser] ${text.slice(0, 500)}`);
    }
  });

  console.log(`Opening P1 factory for ${summary.kst_date}`);
  await page.goto(P1_BASE_URL, { waitUntil: 'networkidle2', timeout: 120000 });
  await page.waitForFunction(() => typeof window.fetch === 'function' && document.readyState === 'complete');

  const sessionExchange = await page.evaluate(async ({ oidcToken }) => {
    localStorage.removeItem('kstella_admin_password');
    const res = await fetch('/api/session', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${oidcToken}`
      },
      credentials: 'same-origin',
      cache: 'no-store'
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 500) }; }
    return { ok: res.ok, status: res.status, data };
  }, { oidcToken });
  if (!sessionExchange.ok || !sessionExchange.data?.ok) {
    throw new Error(`P1 OIDC session exchange failed (${sessionExchange.status}): ${sessionExchange.data?.error || JSON.stringify(sessionExchange.data)}`);
  }
  console.log('P1 GitHub OIDC session exchange PASS');

  async function api(path, { method = 'GET', body } = {}) {
    const result = await page.evaluate(async ({ path, method, body }) => {
      const headers = { accept: 'application/json' };
      if (body !== undefined) headers['content-type'] = 'application/json';
      const res = await fetch(path, {
        method,
        headers,
        credentials: 'same-origin',
        cache: 'no-store',
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 1000) }; }
      return { ok: res.ok, status: res.status, data };
    }, { path, method, body });
    if (!result.ok) throw new Error(`${method} ${path} failed (${result.status}): ${result.data?.error || JSON.stringify(result.data)}`);
    return result.data;
  }

  const health = await api('/api/health');
  if (!health?.ok || !health?.db || !health?.r2 || !health?.ai) {
    throw new Error(`P1 authenticated health check failed: ${JSON.stringify({ ok: health?.ok, db: health?.db, r2: health?.r2, ai: health?.ai })}`);
  }
  console.log('P1 authenticated health PASS (DB/KV/AI)');

  const lineupBody = {
    lineup_date: summary.kst_date,
    date: summary.kst_date,
    theme: '1분 사주 드라마',
    audience: '20~35세 여성',
    tracking_base: '@kstellaway',
    platform: 'youtube_shorts'
  };
  const lineupResponse = await api('/api/lineups/generate', { method: 'POST', body: lineupBody });
  const lineupId = String(lineupResponse?.lineup?.id || lineupResponse?.lineup_id || '');
  if (!lineupId) throw new Error(`P1 did not return a lineup id: ${JSON.stringify(lineupResponse).slice(0, 1500)}`);
  summary.lineup_id = lineupId;
  console.log(`Lineup ready: ${lineupId}`);

  const planned = await api('/api/lineups/plan-all', { method: 'POST', body: { lineup_id: lineupId } });
  console.log(`Planning PASS: ${Array.isArray(planned?.planned) ? planned.planned.length : 0} projects`);

  const production = await api('/api/production/start', { method: 'POST', body: { lineup_id: lineupId } });
  const runId = String(production?.run?.id || production?.id || '');
  summary.production_run_id = runId || null;
  const todo = (production?.items || []).filter((x) => x.status !== 'done');
  console.log(`Production run ${runId || '(unknown)'}: ${todo.length} item(s) to process`);

  await page.waitForFunction(() => typeof processProductionItem === 'function' && typeof renderOnDevice === 'function' && !!document.querySelector('#renderCanvas'));
  await page.evaluate((duration) => {
    const input = document.querySelector('#videoDuration');
    if (input) input.value = String(duration);
  }, TARGET_DURATION);

  for (let i = 0; i < todo.length; i++) {
    const item = todo[i];
    console.log(`Item ${i + 1}/${todo.length}, slot=${item.slot_no}, project=${item.project_id}`);
    const result = await page.evaluate(async ({ item, index, total }) => {
      try {
        const r = await processProductionItem(item, index, total);
        if (r?.error) return { ok: false, error: r.error?.message || String(r.error) };
        return {
          ok: true,
          reused: Boolean(r?.reused),
          video_id: r?.video?.id || null,
          quality_status: r?.quality?.status || null,
          quality_score: r?.quality?.score ?? null
        };
      } catch (e) {
        return { ok: false, error: e?.message || String(e) };
      }
    }, { item, index: i, total: todo.length });

    summary.items.push({ slot_no: item.slot_no, project_id: item.project_id, ...result });
    if (result.ok) summary.completed += 1;
    else summary.failed += 1;
    await saveSummary();
    console.log(result.ok ? `Item ${item.slot_no} PASS` : `Item ${item.slot_no} FAIL: ${result.error}`);
  }

  const latest = runId ? await api(`/api/production?run_id=${encodeURIComponent(runId)}`) : await api(`/api/production?lineup_id=${encodeURIComponent(lineupId)}`);
  summary.production = latest?.run ? {
    status: latest.run.status,
    total_items: latest.run.total_items,
    completed_items: latest.run.completed_items,
    failed_items: latest.run.failed_items
  } : null;

  summary.release = await api('/api/release/daily', { method: 'POST', body: { lineup_id: lineupId } });
  summary.ok = summary.failed === 0 && Number(summary.release?.hold || 0) === 0;
  await saveSummary();

  console.log(`Factory complete: completed=${summary.completed}, failed=${summary.failed}, release ready=${summary.release?.ready ?? 0}, review=${summary.release?.review ?? 0}, hold=${summary.release?.hold ?? 0}`);
  if (summary.failed) throw new Error(`${summary.failed} production item(s) failed. See ${SUMMARY_PATH}.`);
} catch (error) {
  summary.error = error?.message || String(error);
  await saveSummary();
  throw error;
} finally {
  await browser.close();
}
