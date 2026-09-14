const base = (process.env.DEPLOY_URL || process.argv[2] || '').replace(/\/$/, '');
if (!base) {
  console.error('DEPLOY_URL is required');
  process.exit(2);
}

const attempts = Number(process.env.E2E_ATTEMPTS || 12);
const delayMs = Number(process.env.E2E_DELAY_MS || 5000);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function retry(path, validate) {
  let lastError = 'unknown';
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const res = await fetch(`${base}${path}`, { headers: { 'cache-control': 'no-cache' } });
      const body = await validate(res);
      if (res.ok && body === true) {
        console.log(`PLACE_RANK_E2E PASS ${path} attempt=${attempt}`);
        return;
      }
      lastError = `status=${res.status}`;
    } catch (error) {
      lastError = error?.message || String(error);
    }
    console.log(`PLACE_RANK_E2E RETRY ${path} attempt=${attempt}/${attempts}: ${lastError}`);
    if (attempt < attempts) await sleep(delayMs);
  }
  throw new Error(`PLACE_RANK_E2E FAILED ${path}: ${lastError}`);
}

await retry('/modules/place-rank', async res => {
  const body = await res.json();
  return body?.ok === true && body?.module === 'place-rank' && body?.service?.includes('스타포인트안경원') && Array.isArray(body?.rows) && body.rows.length >= 2 && body?.policy?.captchaBypass === false && body?.policy?.objectiveGeoGrid === true && body?.grid?.configured === true && body?.grid?.grid?.pointCount === 25;
});

await retry('/place-rank', async res => {
  const html = await res.text();
  return res.headers.get('content-type')?.includes('text/html') && html.includes('스타포인트안경원') && html.includes('P3 매장 검색순위 V2') && html.includes('수영구 25지점 객관순위');
});

console.log(`PLACE_RANK_E2E COMPLETE ${base}`);
