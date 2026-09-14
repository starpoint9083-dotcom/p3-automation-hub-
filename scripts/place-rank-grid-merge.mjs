import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const config = JSON.parse(await fs.readFile(path.join(root, 'config', 'place-rank.json'), 'utf8'));
const historyPath = path.join(root, 'data', 'place-rank-grid-history.json');
const generatedPath = path.join(root, 'src', 'place-rank-grid-data.js');
const partsRoot = path.join(root, process.env.GRID_PARTS_DIR || 'artifacts/place-rank-grid-parts');
const previousDoc = JSON.parse(await fs.readFile(historyPath, 'utf8'));
const expectedKeywords = Array.isArray(config.grid?.keywords) ? config.grid.keywords : [];

async function walk(dir) {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full));
    else if (entry.name === 'place-rank-grid-history.json') out.push(full);
  }
  return out;
}

const files = await walk(partsRoot);
if (!files.length) throw new Error(`No geogrid part snapshots found under ${partsRoot}`);

const parts = new Map();
for (const file of files) {
  const doc = JSON.parse(await fs.readFile(file, 'utf8'));
  const latest = doc.latest;
  const keyword = latest?.keywords?.[0] || latest?.summaries?.[0]?.keyword;
  if (!keyword || !expectedKeywords.includes(keyword)) continue;
  if (!Array.isArray(latest?.cells) || latest.cells.length !== Number(config.grid?.size || 5) ** 2) {
    throw new Error(`Invalid cell count for ${keyword}: ${latest?.cells?.length ?? 0}`);
  }
  parts.set(keyword, latest);
}

const missing = expectedKeywords.filter(keyword => !parts.has(keyword));
if (missing.length) throw new Error(`Missing geogrid keyword parts: ${missing.join(', ')}`);

const ordered = expectedKeywords.map(keyword => parts.get(keyword));
const checkedAt = ordered.map(item => item.checkedAt).sort().at(-1);
const date = checkedAt.slice(0, 10);
const summaries = expectedKeywords.map(keyword => parts.get(keyword).summaries[0]);
const cells = expectedKeywords.flatMap(keyword => parts.get(keyword).cells);
const baseGrid = ordered[0].grid;
const latest = {
  date,
  checkedAt,
  source: 'naver-map-geogrid-v2-parallel',
  grid: baseGrid,
  keywords: expectedKeywords,
  summaries,
  cells
};
const compact = { date, checkedAt, summaries };
const previousHistory = Array.isArray(previousDoc.history) ? previousDoc.history : [];
const history = [...previousHistory.filter(item => item?.date !== date), compact].slice(-90);
const nextDoc = {
  version: '2.1.0',
  store: config.store?.name || '스타포인트안경원',
  generatedAt: checkedAt,
  latest,
  history
};

await fs.writeFile(historyPath, `${JSON.stringify(nextDoc, null, 2)}\n`, 'utf8');
await fs.writeFile(generatedPath, `export const placeRankGridData = ${JSON.stringify(nextDoc, null, 2)};\n`, 'utf8');
console.log(`PLACE_RANK_GRID_MERGE_COMPLETE keywords=${expectedKeywords.length} cells=${cells.length} checkedAt=${checkedAt}`);
for (const item of summaries) {
  console.log(`PLACE_RANK_GRID_MERGE_SUMMARY keyword=${JSON.stringify(item.keyword)} median=${item.medianRankCapped ?? 'NA'} top3=${item.top3Pct ?? 'NA'} top10=${item.top10Pct ?? 'NA'} top20=${item.top20Pct ?? 'NA'} visibility=${item.visibilityScore ?? 'NA'} store=${item.storePointRank ?? 'NA'}`);
}
