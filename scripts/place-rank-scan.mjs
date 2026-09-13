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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function visiblePlaceName(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text || text.length > 100) return null;
  return text;
}

function looksLikePlaceObject(node) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return false;
  const name = visiblePlaceName(node.name ?? node.title ?? node.displayName ?? node.businessName);
  if (!name) return false;
  return Boolean(
    node.id || node.placeId || node.businessId || node.roadAddress || node.address ||
    node.category || node.categoryName || node.x || node.y || node.phone
  );
}

function extractNamesFromPayload(payload) {
  const names = [];
  const seenObjects = new Set();

  function add(value) {
    const name = visiblePlaceName(value);
    if (name) names.push(name);
  }

  function visit(node, depth = 0) {
    if (depth > 12 || node == null) return;
    if (Array.isArray(node)) {
      for (const item of node) {
        if (looksLikePlaceObject(item)) add(item.name ?? item.title ?? item.displayName ?? item.businessName);
        visit(item, depth + 1);
      }
      return;
    }
    if (typeof node !== 'object') return;
    if (seenObjects.has(node)) return;
    seenObjects.add(node);

    const directList = node?.result?.place?.list;
    if (Array.isArray(directList)) {
      for (const item of directList) add(item?.name ?? item?.title);
    }

    for (const [key, value] of Object.entries(node)) {
      if ((key === 'items' || key === 'list' || key === 'places') && Array.isArray(value)) {
        for (const item of value) {
          if (looksLikePlaceObject(item)) add(item.name ?? item.title ?? item.displayName ?? item.businessName);
        }
      }
      visit(value, depth + 1);
    }
  }

  visit(payload);
  return names;
}

function mergeNames(target, incoming) {
  const seen = new Set(target.map(normalize).filter(Boolean));
  for (const raw of incoming) {
    const name = visiblePlaceName(raw);
    const key = normalize(name);
    if (!name || !key || seen.has(key)) continue;
    seen.add(key);
    target.push(name);
  }
  return target;
}

async function collectNames(frame) {
  return frame.evaluate(() => {
    const selectors = [
      'a.place_bluelink',
      'a[href*="/p/entry/place/"]',
      'a[href*="/entry/place/"]',
      'a[href*="/place/"]',
      '[data-place-id] a',
      '[data-id] a',
      '[role="listitem"] a',
      'li a',
      '.TYaxT'
    ];
    const nodes = Array.from(document.querySelectorAll(selectors.join(',')));
    const seen = new Set();
    const names = [];
    for (const node of nodes) {
      const raw = (node.innerText || node.textContent || '').trim();
      if (!raw) continue;
      const text = raw.split('\n').map(v => v.trim()).find(Boolean) || '';
      if (!text || text.length > 100) continue;
      const href = node.getAttribute?.('href') || '';
      const parent = node.closest?.('li,[role="listitem"],[data-place-id],[data-id]');
      const likelyPlace = /\/place\//.test(href) || /\/entry\/place\//.test(href) || Boolean(parent);
      if (!likelyPlace) continue;
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
      target = all.find(el => el.scrollHeight > el.clientHeight + 300 && el.clientHeight > 250) || null;
    }
    if (target) target.scrollTop = target.scrollHeight;
    else window.scrollTo(0, document.body.scrollHeight);
  });
}

async function clickPageNumber(frame, pageNumber) {
  try {
    return await frame.evaluate(number => {
      const wanted = String(number);
      const nodes = Array.from(document.querySelectorAll('a,button'));
      const candidates = nodes.filter(node => {
        const text = (node.textContent || '').trim();
        if (text !== wanted) return false;
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      });
      const target = candidates.find(node => node.getAttribute('aria-current') !== 'page') || candidates[0];
      if (!target) return false;
      target.scrollIntoView({ block: 'center', inline: 'center' });
      target.click();
      return true;
    }, pageNumber);
  } catch {
    return false;
  }
}

async function detectBlock(page) {
  const texts = await Promise.all(page.frames().map(async frame => {
    try { return await frame.evaluate(() => document.body?.innerText?.slice(0, 16000) || ''); }
    catch { return ''; }
  }));
  const combined = texts.join('\n').toLowerCase();
  return /비정상적인 접근|자동입력|captcha|접근이 제한|접속이 제한/.test(combined);
}

function createNetworkCapture(page) {
  const state = { names: [], matchedResponses: 0, sources: [], tasks: [], active: true };
  const handler = response => {
    if (!state.active) return;
    const url = response.url();
    const isAllSearch = url.includes('/p/api/search/allSearch');
    const isGraphql = url.includes('pcmap-api.place.naver.com/graphql');
    if (!isAllSearch && !isGraphql) return;
    state.matchedResponses += 1;
    const task = (async () => {
      try {
        const contentType = response.headers()['content-type'] || '';
        if (!/json|graphql/i.test(contentType) && !isGraphql) return;
        const payload = await response.json();
        const incoming = extractNamesFromPayload(payload);
        if (incoming.length) {
          mergeNames(state.names, incoming);
          state.sources.push({ type: isAllSearch ? 'allSearch' : 'graphql', count: incoming.length, url });
        }
      } catch (error) {
        state.sources.push({ type: isAllSearch ? 'allSearch-error' : 'graphql-error', count: 0, url, error: String(error?.message || error).slice(0, 160) });
      }
    })();
    state.tasks.push(task);
  };
  page.on('response', handler);
  return {
    state,
    async stop() {
      state.active = false;
      page.off('response', handler);
      await Promise.allSettled(state.tasks);
      return state;
    }
  };
}

async function collectDomNames(page) {
  const names = [];
  for (const frame of page.frames()) {
    try { mergeNames(names, await collectNames(frame)); } catch {}
  }
  return names;
}

async function scanKeyword(page, keyword, aliases, maxResults) {
  const url = `https://map.naver.com/p/search/${encodeURIComponent(keyword)}`;
  const capture = createNetworkCapture(page);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(4500);

  let names = [];
  let blocked = await detectBlock(page);
  if (!blocked) {
    mergeNames(names, capture.state.names);
    mergeNames(names, await collectDomNames(page));
  }

  const searchFrame = () => page.frames().find(frame => frame.name() === 'searchIframe')
    || page.frames().find(frame => frame !== page.mainFrame() && /search|place/.test(frame.url()));

  for (let round = 0; round < 5 && !blocked && names.length < maxResults; round += 1) {
    const frame = searchFrame();
    if (frame) {
      try { await scrollResults(frame); } catch {}
      await sleep(1000);
    }
    mergeNames(names, capture.state.names);
    mergeNames(names, await collectDomNames(page));
    blocked = await detectBlock(page);
  }

  for (let pageNumber = 2; pageNumber <= 5 && !blocked && names.length < maxResults; pageNumber += 1) {
    const frame = searchFrame();
    if (!frame) break;
    const clicked = await clickPageNumber(frame, pageNumber);
    if (!clicked) break;
    await sleep(1800);
    mergeNames(names, capture.state.names);
    mergeNames(names, await collectDomNames(page));
    try { await scrollResults(frame); } catch {}
    await sleep(700);
    mergeNames(names, capture.state.names);
    mergeNames(names, await collectDomNames(page));
    blocked = await detectBlock(page);
  }

  const network = await capture.stop();
  mergeNames(names, network.names);
  names = names.slice(0, maxResults);

  if (blocked) {
    return {
      keyword,
      rank: null,
      status: 'blocked',
      resultCount: names.length,
      url,
      networkResponses: network.matchedResponses,
      captureSources: network.sources.slice(0, 12)
    };
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
    networkResponses: network.matchedResponses,
    captureSources: network.sources.slice(0, 12),
    sample: names.slice(0, 12)
  };
}

await fs.mkdir(artifactDir, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--lang=ko-KR',
    '--window-size=1440,1200'
  ]
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
      console.log(`PLACE_RANK keyword=${JSON.stringify(keyword)} status=${result.status} rank=${result.rank ?? 'NA'} count=${result.resultCount} network=${result.networkResponses ?? 0}`);
      if (result.status !== 'ok') await page.screenshot({ path: path.join(artifactDir, `${safeSlug(keyword)}.png`), fullPage: true });
    } catch (error) {
      const message = error?.message || String(error);
      results.push({ keyword, rank: null, status: 'error', resultCount: 0, error: message.slice(0, 300) });
      console.error(`PLACE_RANK_ERROR keyword=${JSON.stringify(keyword)} error=${message}`);
      try { await page.screenshot({ path: path.join(artifactDir, `${safeSlug(keyword)}-error.png`), fullPage: true }); } catch {}
    }
    await sleep(1000);
  }
} finally {
  await browser.close();
}

const checkedAt = kstIso();
const snapshot = {
  date: checkedAt.slice(0, 10),
  checkedAt,
  source: 'naver-map-browser-network',
  location: Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude, accuracyMeters: accuracy, basis: location.basis || config.store.address } : null,
  results
};
const previous = Array.isArray(historyDoc.history) ? historyDoc.history : [];
const history = [...previous.filter(item => item?.date !== snapshot.date), snapshot].slice(-90);
const nextDoc = { version: '1.2.0', store: config.store.name, generatedAt: checkedAt, history };
await fs.writeFile(historyPath, `${JSON.stringify(nextDoc, null, 2)}\n`, 'utf8');
await fs.writeFile(generatedPath, `export const placeRankData = ${JSON.stringify(nextDoc, null, 2)};\n`, 'utf8');

const okCount = results.filter(item => item.status === 'ok').length;
const blockedCount = results.filter(item => item.status === 'blocked').length;
const noResultsCount = results.filter(item => item.status === 'no-results').length;
console.log(`PLACE_RANK_COMPLETE checked=${results.length} found=${okCount} blocked=${blockedCount} noResults=${noResultsCount} generatedAt=${checkedAt}`);
if (blockedCount === results.length && results.length > 0) process.exitCode = 3;
if (noResultsCount === results.length && results.length > 0) process.exitCode = 4;
