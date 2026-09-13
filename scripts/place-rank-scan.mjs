import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import puppeteer from 'puppeteer-core';

const root = process.cwd();
const configPath = path.join(root, 'config', 'place-rank.json');
const historyPath = path.join(root, 'data', 'place-rank-history.json');
const generatedPath = path.join(root, 'src', 'place-rank-data.js');
const artifactDir = path.join(root, 'artifacts', 'place-rank');
const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
const historyDoc = JSON.parse(await fs.readFile(historyPath, 'utf8'));

const chromePath = process.env.CHROME_PATH;
if (!chromePath) {
  console.error('CHROME_PATH is required');
  process.exit(2);
}

function normalize(value) {
  return String(value || '').toLowerCase().replace(/[\s·•._\-–—()\[\]{}]/g, '').replace(/[^0-9a-z가-힣]/g, '');
}

function kstIso(date = new Date()) {
  const shifted = new Date(date.getTime() + (9 * 60 * 60 * 1000));
  return shifted.toISOString().replace('Z', '+09:00');
}

function safeSlug(value) {
  return normalize(value).slice(0, 40) || 'keyword';
}

async function collectNames(frame) {
  return frame.evaluate(() => {
    const selectors = ['a.place_bluelink', 'a[href*="/p/entry/place/"]', 'a[href*="/entry/place/"]', '.TYaxT'];
    const nodes = Array.from(document.querySelectorAll(selectors.join(',')));
    const seen = new Set();
    const names = [];
    for (const node of nodes) {
      const raw = (node.innerText || node.textContent || '').trim();
      if (!raw) continue;
      const text = raw.split('\n').map(v => v.trim()).find(Boolean) || '';
      if (!text || text.length > 80) continue;
      const key = text.toLowerCase().replace(/\s+/g, '');
      if (seen.has(key)) continue;
      seen.add(key);
      names.push(text);
    }
    return names;
  });
}

async function scrollResults(frame) {
  await frame.evaluate(() => {
    const preferred = ['#_pcmap_list_scroll_container', '.Ryr1F', '[role="list"]'];
    let target = null;
    for (const selector of preferred) {
      const el = document.querySelector(selector);
      if (el && el.scrollHeight > el.clientHeight) {
        target = el;
        break;
      }
    }
    if (!target) {
      const all = Array.from(document.querySelectorAll('div,section,ul'));
      target = all.find(el => el.scrollHeight > el.clientHeight + 300 && el.clientHeight > 300) || null;
    }
    if (target) target.scrollTop = target.scrollHeight;
    else window.scrollTo(0, document.body.scrollHeight);
  });
}

async function detectBlock(page) {
  const texts = await Promise.all(page.frames().map(async frame => {
    try { return await frame.evaluate(() => document.body?.innerText?.slice(0, 12000) || ''); }
    catch { return ''; }
  }));
  const combined = texts.join('\n').toLowerCase();
  return /비정상적인 접근|자동입력|captcha|접근이 제한|접속이 제한/.test(combined);
}

async function scanKeyword(page, keyword, aliases, maxResults) {
  const url = `https://map.naver.com/p/search/${encodeURIComponent(keyword)}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await new Promise(resolve => setTimeout(resolve, 3500));
  let names = [];
  let stableRounds = 0;
  let previousCount = -1;

  for (let round = 0; round < 16; round += 1) {
    if (await detectBlock(page)) return { keyword, rank: null, status: 'blocked', resultCount: names.length, url };
    const frames = page.frames();
    const collected = [];
    for (const frame of frames) {
      try { collected.push(...await collectNames(frame)); } catch {}
    }
    const seen = new Set();
    names = collected.filter(name => {
      const key = normalize(name);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (names.length >= maxResults) break;
    if (names.length === previousCount) stableRounds += 1;
    else stableRounds = 0;
    previousCount = names.length;
    if (stableRounds >= 4 && names.length > 0) break;
    const searchFrames = frames.filter(frame => /search|place/.test(frame.url()));
    for (const frame of searchFrames.length ? searchFrames : frames) {
      try { await scrollResults(frame); } catch {}
    }
    await new Promise(resolve => setTimeout(resolve, 800));
  }

  const normalizedAliases = aliases.map(normalize).filter(Boolean);
  const rankIndex = names.findIndex(name => {
    const n = normalize(name);
    return normalizedAliases.some(alias => n === alias || n.includes(alias) || alias.includes(n));
  });
  return {
    keyword,
    rank: rankIndex >= 0 ? rankIndex + 1 : null,
    status: rankIndex >= 0 ? 'ok' : (names.length ? 'not-found' : 'no-results'),
    resultCount: names.length,
    url,
    sample: names.slice(0, 8)
  };
}

await fs.mkdir(artifactDir, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--lang=ko-KR', '--window-size=1440,1200']
});
const context = browser.defaultBrowserContext();
const location = config.location || {};
const latitude = Number(location.latitude);
const longitude = Number(location.longitude);
const accuracy = Number(location.accuracyMeters || 40);
if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
  await context.overridePermissions('https://map.naver.com', ['geolocation']);
}
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1200, deviceScaleFactor: 1 });
await page.setExtraHTTPHeaders({ 'accept-language': 'ko-KR,ko;q=0.9,en;q=0.5' });
if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
  await page.setGeolocation({ latitude, longitude, accuracy });
  console.log(`PLACE_RANK_LOCATION lat=${latitude} lon=${longitude} accuracy=${accuracy}`);
}

const aliases = Array.from(new Set([config.store.name, ...(config.store.aliases || [])]));
const results = [];
try {
  for (const keyword of config.keywords) {
    try {
      const result = await scanKeyword(page, keyword, aliases, Number(config.maxResults || 50));
      results.push(result);
      console.log(`PLACE_RANK keyword=${JSON.stringify(keyword)} status=${result.status} rank=${result.rank ?? 'NA'} count=${result.resultCount}`);
      if (result.status !== 'ok') await page.screenshot({ path: path.join(artifactDir, `${safeSlug(keyword)}.png`), fullPage: true });
    } catch (error) {
      const message = error?.message || String(error);
      results.push({ keyword, rank: null, status: 'error', resultCount: 0, error: message.slice(0, 300) });
      console.error(`PLACE_RANK_ERROR keyword=${JSON.stringify(keyword)} error=${message}`);
      try { await page.screenshot({ path: path.join(artifactDir, `${safeSlug(keyword)}-error.png`), fullPage: true }); } catch {}
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
} finally {
  await browser.close();
}

const checkedAt = kstIso();
const snapshot = {
  date: checkedAt.slice(0, 10),
  checkedAt,
  source: 'naver-map-browser',
  location: Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude, accuracyMeters: accuracy, basis: location.basis || config.store.address } : null,
  results
};
const previous = Array.isArray(historyDoc.history) ? historyDoc.history : [];
const history = [...previous.filter(item => item?.date !== snapshot.date), snapshot].slice(-90);
const nextDoc = { version: '1.1.0', store: config.store.name, generatedAt: checkedAt, history };
await fs.writeFile(historyPath, `${JSON.stringify(nextDoc, null, 2)}\n`, 'utf8');
await fs.writeFile(generatedPath, `export const placeRankData = ${JSON.stringify(nextDoc, null, 2)};\n`, 'utf8');

const okCount = results.filter(item => item.status === 'ok').length;
const blockedCount = results.filter(item => item.status === 'blocked').length;
console.log(`PLACE_RANK_COMPLETE checked=${results.length} found=${okCount} blocked=${blockedCount} generatedAt=${checkedAt}`);
if (blockedCount === results.length && results.length > 0) process.exitCode = 3;
