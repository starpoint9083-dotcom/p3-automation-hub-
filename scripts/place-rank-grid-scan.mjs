import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import puppeteer from 'puppeteer-core';

const root = process.cwd();
const configPath = path.join(root, 'config', 'place-rank.json');
const historyPath = path.join(root, 'data', 'place-rank-grid-history.json');
const generatedPath = path.join(root, 'src', 'place-rank-grid-data.js');
const artifactDir = path.join(root, 'artifacts', 'place-rank-grid');

const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
const previousDoc = JSON.parse(await fs.readFile(historyPath, 'utf8'));
const gridConfig = config.grid || {};
const chromePath = process.env.CHROME_PATH;
if (!chromePath) {
  console.error('CHROME_PATH is required');
  process.exit(2);
}
if (gridConfig.enabled !== true) {
  console.log('PLACE_RANK_GRID disabled');
  process.exit(0);
}

const normalize = value => String(value || '').toLowerCase().replace(/[\s·•._\-–—()\[\]{}]/g, '').replace(/[^0-9a-z가-힣]/g, '');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const visibleName = value => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return !text || text.length > 100 ? null : text;
};
const safeSlug = value => normalize(value).slice(0, 40) || 'keyword';
function kstIso(date = new Date()) {
  const d = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return d.toISOString().replace('Z', '+09:00');
}
function mergeNames(target, incoming) {
  const seen = new Set(target.map(normalize));
  for (const raw of incoming || []) {
    const name = visibleName(raw);
    const key = normalize(name);
    if (name && key && !seen.has(key)) {
      seen.add(key);
      target.push(name);
    }
  }
  return target;
}
function parseCoord(url) {
  try {
    const raw = new URL(url).searchParams.get('searchCoord');
    if (!raw) return null;
    const [lon, lat] = raw.split(';').map(Number);
    return Number.isFinite(lat) && Number.isFinite(lon) ? { latitude: lat, longitude: lon } : null;
  } catch {
    return null;
  }
}
function coordMatches(actual, expectedLat, expectedLon) {
  if (!actual) return false;
  return Math.abs(actual.latitude - expectedLat) <= 0.005 && Math.abs(actual.longitude - expectedLon) <= 0.006;
}
function toWebMercator(lat, lon) {
  const r = 6378137;
  const clamped = Math.max(-85.05112878, Math.min(85.05112878, lat));
  return {
    x: r * lon * Math.PI / 180,
    y: r * Math.log(Math.tan(Math.PI / 4 + clamped * Math.PI / 360))
  };
}
function looksLikePlaceObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const name = visibleName(value.name ?? value.title ?? value.displayName ?? value.businessName);
  return Boolean(name && (value.id || value.placeId || value.businessId || value.roadAddress || value.address || value.category || value.categoryName || value.x || value.y || value.phone));
}
function extractNames(payload) {
  const output = [];
  const seen = new Set();
  const add = value => {
    const name = visibleName(value);
    if (name) output.push(name);
  };
  function visit(node, depth = 0) {
    if (depth > 12 || node == null) return;
    if (Array.isArray(node)) {
      for (const item of node) {
        if (looksLikePlaceObject(item)) add(item.name ?? item.title ?? item.displayName ?? item.businessName);
        visit(item, depth + 1);
      }
      return;
    }
    if (typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    const direct = node?.result?.place?.list;
    if (Array.isArray(direct)) for (const item of direct) add(item?.name ?? item?.title);
    for (const [key, value] of Object.entries(node)) {
      if (['items', 'list', 'places'].includes(key) && Array.isArray(value)) {
        for (const item of value) if (looksLikePlaceObject(item)) add(item.name ?? item.title ?? item.displayName ?? item.businessName);
      }
      visit(value, depth + 1);
    }
  }
  visit(payload);
  return output;
}
async function detectBlock(page) {
  const texts = await Promise.all(page.frames().map(async frame => {
    try {
      return await frame.evaluate(() => document.body?.innerText?.slice(0, 12000) || '');
    } catch {
      return '';
    }
  }));
  return /비정상적인 접근|자동입력|captcha|접근이 제한|접속이 제한/i.test(texts.join('\n'));
}
function createCapture(page) {
  const state = { names: [], matchedResponses: 0, searchCoords: [], tasks: [], active: true };
  const handler = response => {
    if (!state.active) return;
    const url = response.url();
    const allSearch = url.includes('/p/api/search/allSearch');
    const graphql = url.includes('pcmap-api.place.naver.com/graphql');
    if (!allSearch && !graphql) return;
    state.matchedResponses += 1;
    if (allSearch) {
      const coord = parseCoord(url);
      if (coord) state.searchCoords.push(coord);
    }
    const task = (async () => {
      try {
        const text = await response.text();
        let payload;
        try {
          payload = JSON.parse(text);
        } catch {
          return;
        }
        mergeNames(state.names, extractNames(payload));
      } catch {
        // Some GraphQL preflight responses do not expose a body. Ignore them.
      }
    })();
    state.tasks.push(task);
  };
  page.on('response', handler);
  return {
    async stop() {
      state.active = false;
      page.off('response', handler);
      await Promise.allSettled(state.tasks);
      return state;
    }
  };
}
function buildGrid(centerLat, centerLon, size, spacingMeters) {
  const half = Math.floor(size / 2);
  const latMeters = 111320;
  const lonMeters = 111320 * Math.cos(centerLat * Math.PI / 180);
  const points = [];
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const northMeters = (half - row) * spacingMeters;
      const eastMeters = (col - half) * spacingMeters;
      points.push({
        id: `r${row + 1}c${col + 1}`,
        row,
        col,
        latitude: centerLat + northMeters / latMeters,
        longitude: centerLon + eastMeters / lonMeters,
        northMeters,
        eastMeters,
        isStore: row === half && col === half
      });
    }
  }
  return points;
}
function percentileMedian(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
function summarizeKeyword(keyword, cells, topRankLimit) {
  const rows = cells.filter(cell => cell.keyword === keyword);
  const valid = rows.filter(cell => cell.status === 'ok' || cell.status === 'not-found');
  const scoreRanks = valid.map(cell => Number.isFinite(cell.rank) && cell.rank <= topRankLimit ? cell.rank : topRankLimit + 1);
  const pct = limit => valid.length ? Math.round(valid.filter(cell => Number.isFinite(cell.rank) && cell.rank <= limit).length / valid.length * 1000) / 10 : null;
  const visibilityValues = valid.map(cell => Number.isFinite(cell.rank) && cell.rank <= topRankLimit ? Math.max(0, (topRankLimit + 1 - cell.rank) / topRankLimit * 100) : 0);
  const actualRanks = rows.filter(cell => Number.isFinite(cell.rank)).map(cell => cell.rank);
  const center = rows.find(cell => cell.isStore) || null;
  return {
    keyword,
    validPoints: valid.length,
    totalPoints: rows.length,
    foundPoints: actualRanks.length,
    medianRankCapped: percentileMedian(scoreRanks),
    top3Pct: pct(3),
    top10Pct: pct(10),
    top20Pct: pct(20),
    visibilityScore: visibilityValues.length ? Math.round(visibilityValues.reduce((a, b) => a + b, 0) / visibilityValues.length * 10) / 10 : null,
    bestRank: actualRanks.length ? Math.min(...actualRanks) : null,
    worstFoundRank: actualRanks.length ? Math.max(...actualRanks) : null,
    storePointRank: center?.rank ?? null,
    blockedPoints: rows.filter(cell => cell.status === 'blocked').length,
    unverifiedPoints: rows.filter(cell => cell.status === 'unverified' || cell.status === 'location-mismatch' || cell.status === 'error').length
  };
}
async function scanAtPoint(page, keyword, point, aliases, maxResults) {
  await page.setCacheEnabled(false);
  const center = toWebMercator(point.latitude, point.longitude);
  const url = `https://map.naver.com/p/search/${encodeURIComponent(keyword)}?c=${center.x},${center.y},15.22,0,0,0,dh`;
  const capture = createCapture(page);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(3800);
  const blocked = await detectBlock(page);
  const network = await capture.stop();
  const names = [];
  mergeNames(names, network.names);
  const searchCoord = network.searchCoords.at(-1) || null;
  const locationMatched = coordMatches(searchCoord, point.latitude, point.longitude);
  const limited = names.slice(0, maxResults);
  if (blocked) return { status: 'blocked', rank: null, resultCount: limited.length, searchCoord, locationMatched: false, networkResponses: network.matchedResponses };
  if (!searchCoord || !locationMatched) return { status: searchCoord ? 'location-mismatch' : 'unverified', rank: null, resultCount: limited.length, searchCoord, locationMatched, networkResponses: network.matchedResponses };
  if (!limited.length) return { status: 'unverified', rank: null, resultCount: 0, searchCoord, locationMatched: true, networkResponses: network.matchedResponses };
  const aliasKeys = aliases.map(normalize).filter(Boolean);
  const index = limited.findIndex(name => {
    const key = normalize(name);
    return aliasKeys.some(alias => key === alias || key.includes(alias) || alias.includes(key));
  });
  return {
    status: index >= 0 ? 'ok' : 'not-found',
    rank: index >= 0 ? index + 1 : null,
    resultCount: limited.length,
    searchCoord,
    locationMatched: true,
    networkResponses: network.matchedResponses
  };
}
async function runKeyword(browser, keyword, points, aliases, maxResults) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1365, height: 1000, deviceScaleFactor: 1 });
  await page.setExtraHTTPHeaders({ 'accept-language': 'ko-KR,ko;q=0.9,en;q=0.5' });
  const cells = [];
  try {
    for (const point of points) {
      let result;
      try {
        result = await scanAtPoint(page, keyword, point, aliases, maxResults);
      } catch (error) {
        result = { status: 'error', rank: null, resultCount: 0, error: String(error?.message || error).slice(0, 240) };
      }
      const cell = { keyword, pointId: point.id, row: point.row, col: point.col, latitude: point.latitude, longitude: point.longitude, northMeters: point.northMeters, eastMeters: point.eastMeters, isStore: point.isStore, ...result };
      cells.push(cell);
      console.log(`PLACE_RANK_GRID keyword=${JSON.stringify(keyword)} point=${point.id} store=${point.isStore ? 1 : 0} status=${cell.status} rank=${cell.rank ?? 'NA'} count=${cell.resultCount ?? 0}`);
      if (cell.status === 'blocked' || cell.status === 'location-mismatch' || cell.status === 'error') {
        try {
          await page.screenshot({ path: path.join(artifactDir, `${safeSlug(keyword)}-${point.id}.png`), fullPage: false });
        } catch {}
      }
      await sleep(300);
    }
  } finally {
    await page.close();
  }
  return cells;
}
async function mapLimit(items, limit, fn) {
  const output = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      output[index] = await fn(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, () => worker()));
  return output;
}

await fs.mkdir(artifactDir, { recursive: true });
const location = config.location || {};
const centerLat = Number(location.latitude);
const centerLon = Number(location.longitude);
const size = Number(gridConfig.size || 5);
const spacingMeters = Number(gridConfig.spacingMeters || 1000);
const topRankLimit = Number(gridConfig.topRankLimit || 20);
const concurrency = Number(gridConfig.concurrency || 3);
const keywords = Array.isArray(gridConfig.keywords) ? gridConfig.keywords : [];
if (!Number.isFinite(centerLat) || !Number.isFinite(centerLon) || size < 3 || size % 2 === 0 || keywords.length === 0) {
  console.error('Invalid place-rank grid configuration');
  process.exit(3);
}
const points = buildGrid(centerLat, centerLon, size, spacingMeters);
const aliases = [...new Set([config.store?.name, ...(config.store?.aliases || [])])].filter(Boolean);
const browser = await puppeteer.launch({ executablePath: chromePath, headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--lang=ko-KR', '--window-size=1365,1000'] });
const context = browser.defaultBrowserContext();
await context.overridePermissions('https://map.naver.com', ['geolocation']);
console.log(`PLACE_RANK_GRID_START size=${size} points=${points.length} spacing=${spacingMeters} keywords=${keywords.length} concurrency=${concurrency}`);
let cells = [];
try {
  const groups = await mapLimit(keywords, concurrency, keyword => runKeyword(browser, keyword, points, aliases, Number(config.maxResults || 50)));
  cells = groups.flat();
} finally {
  await browser.close();
}

const summaries = keywords.map(keyword => summarizeKeyword(keyword, cells, topRankLimit));
const checkedAt = kstIso();
const compact = { date: checkedAt.slice(0, 10), checkedAt, summaries };
const previousHistory = Array.isArray(previousDoc.history) ? previousDoc.history : [];
const history = [...previousHistory.filter(item => item?.date !== compact.date), compact].slice(-90);
const latest = {
  date: compact.date,
  checkedAt,
  source: 'naver-map-geogrid-v2',
  grid: { size, spacingMeters, pointCount: points.length, topRankLimit, center: { latitude: centerLat, longitude: centerLon }, points },
  keywords,
  summaries,
  cells
};
const nextDoc = { version: '2.0.0', store: config.store?.name || '스타포인트안경원', generatedAt: checkedAt, latest, history };
await fs.writeFile(historyPath, `${JSON.stringify(nextDoc, null, 2)}\n`, 'utf8');
await fs.writeFile(generatedPath, `export const placeRankGridData = ${JSON.stringify(nextDoc, null, 2)};\n`, 'utf8');

const blocked = cells.filter(cell => cell.status === 'blocked').length;
const unverified = cells.filter(cell => ['unverified', 'location-mismatch', 'error'].includes(cell.status)).length;
const valid = cells.filter(cell => ['ok', 'not-found'].includes(cell.status)).length;
console.log(`PLACE_RANK_GRID_COMPLETE checked=${cells.length} valid=${valid} blocked=${blocked} unverified=${unverified} generatedAt=${checkedAt}`);
for (const summary of summaries) {
  console.log(`PLACE_RANK_GRID_SUMMARY keyword=${JSON.stringify(summary.keyword)} median=${summary.medianRankCapped ?? 'NA'} top3=${summary.top3Pct ?? 'NA'} top10=${summary.top10Pct ?? 'NA'} top20=${summary.top20Pct ?? 'NA'} visibility=${summary.visibilityScore ?? 'NA'} store=${summary.storePointRank ?? 'NA'}`);
}
if (valid < cells.length * 0.8) process.exitCode = 7;
