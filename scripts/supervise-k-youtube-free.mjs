import fs from 'node:fs/promises';

const configUrl = new URL('../config/k-youtube-free.json', import.meta.url);
const config = JSON.parse(await fs.readFile(configUrl, 'utf8'));
const configured = new URL(config.deployUrl);
const target = new URL(process.env.K_YOUTUBE_URL || config.deployUrl);

if (target.protocol !== 'https:' || target.hostname !== configured.hostname || target.username || target.password) {
  throw new Error('K_YOUTUBE_URL_NOT_ALLOWED');
}

if (config.costPolicy?.freeOnly !== true || config.costPolicy?.paidTranslationApi !== false || config.costPolicy?.paidDubApi !== false || config.costPolicy?.paidTtsApi !== false) {
  throw new Error('K_YOUTUBE_FREE_ONLY_POLICY_INVALID');
}

const attempts = Number(config.retryPolicy?.attempts || 5);
const delayMs = Number(config.retryPolicy?.delaySeconds || 12) * 1000;
const timeoutMs = Number(config.retryPolicy?.timeoutSeconds || 15) * 1000;
const expectedStatus = Number(config.health?.expectedStatus || 200);
const markers = Array.isArray(config.health?.expectedHtmlMarkers) ? config.health.expectedHtmlMarkers : ['id="root"'];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

let lastError = null;
for (let attempt = 1; attempt <= attempts; attempt += 1) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const response = await fetch(target, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'cache-control': 'no-cache',
        'user-agent': 'p3-k-youtube-supervisor/1.0'
      },
      signal: controller.signal
    });
    const html = await response.text();
    const missing = markers.filter(marker => !html.includes(marker));
    if (response.status !== expectedStatus) throw new Error(`HTTP_${response.status}`);
    if (missing.length) throw new Error(`HTML_MARKER_MISSING:${missing.join(',')}`);

    const latency = Date.now() - started;
    console.log(`K-YOUTUBE SUPERVISOR PASS attempt=${attempt}/${attempts} status=${response.status} latency_ms=${latency} url=${target.origin}/`);
    console.log('FREE-ONLY POLICY PASS paid_translation=false paid_dub=false paid_tts=false');
    if (process.env.GITHUB_OUTPUT) {
      await fs.appendFile(process.env.GITHUB_OUTPUT, `status=pass\nhttp_status=${response.status}\nlatency_ms=${latency}\nurl=${target.origin}/\n`);
    }
    process.exit(0);
  } catch (error) {
    lastError = error;
    console.error(`K-YOUTUBE SUPERVISOR RETRY attempt=${attempt}/${attempts} error=${error?.name === 'AbortError' ? 'TIMEOUT' : error?.message}`);
    if (attempt < attempts) await sleep(delayMs);
  } finally {
    clearTimeout(timer);
  }
}

console.error(`K-YOUTUBE SUPERVISOR FAILED after ${attempts} attempts: ${lastError?.message || 'UNKNOWN'}`);
process.exit(1);
