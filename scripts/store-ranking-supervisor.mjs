import { readFile, writeFile } from 'node:fs/promises';

const config = JSON.parse(await readFile(new URL('../config/store-ranking.json', import.meta.url), 'utf8'));
const base = String(process.env.STORE_RANKING_BASE_URL || config.deployUrl || '').replace(/\/$/, '');
if (!base) {
  console.error('STORE RANKING SUPERVISOR FAILED: deploy URL is required');
  process.exit(2);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson(path, attempts = 3) {
  let lastError = 'unknown';
  for (let i = 1; i <= attempts; i += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const res = await fetch(`${base}${path}`, {
        method: 'GET',
        headers: { accept: 'application/json', 'cache-control': 'no-cache' },
        signal: controller.signal
      });
      const text = await res.text();
      let body;
      try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 500) }; }
      if (!res.ok) throw new Error(`${path} status=${res.status}`);
      return body;
    } catch (error) {
      lastError = error?.name === 'AbortError' ? `${path} timeout` : (error?.message || String(error));
      if (i < attempts) await sleep(3000);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(lastError);
}

function toTime(value) {
  const n = Date.parse(value || '');
  return Number.isFinite(n) ? n : 0;
}

function validRank(value) {
  return Number.isInteger(value) && value > 0 ? value : null;
}

function rankText(rank) {
  return validRank(rank) !== null ? `${rank}위` : '미확인';
}

function historicalRecord(history, latest, daysAgo, toleranceHours) {
  const anchor = toTime(latest?.checkedAt);
  if (!anchor) return null;
  const target = anchor - daysAgo * 86400000;
  let best = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const item of history) {
    if (validRank(item?.rank) === null) continue;
    const time = toTime(item?.checkedAt);
    if (!time) continue;
    const distance = Math.abs(time - target);
    if (distance < bestDistance) {
      best = item;
      bestDistance = distance;
    }
  }
  return bestDistance <= toleranceHours * 3600000 ? best : null;
}

function comparison(history, latest, latestRank, daysAgo, toleranceHours) {
  const baseline = historicalRecord(history, latest, daysAgo, toleranceHours);
  const baselineRank = validRank(baseline?.rank);
  const delta = latestRank !== null && baselineRank !== null ? baselineRank - latestRank : null;
  return {
    daysAgo,
    baselineRank,
    baselineCheckedAt: baseline?.checkedAt || null,
    delta
  };
}

function moveText(label, item, latestRank) {
  if (!item || item.baselineRank === null || item.delta === null || latestRank === null) return `${label} —`;
  const move = item.delta > 0 ? `▲${item.delta}` : item.delta < 0 ? `▼${Math.abs(item.delta)}` : '동일';
  return `${label} ${item.baselineRank}위→${latestRank}위 ${move}`;
}

const generatedAt = new Date();
let health;
let dashboard;
try {
  [health, dashboard] = await Promise.all([
    fetchJson(config.healthPath),
    fetchJson(config.dashboardPath)
  ]);
} catch (error) {
  console.error(`STORE RANKING SUPERVISOR FAILED: ${error?.message || String(error)}`);
  process.exit(1);
}

const keywords = Array.isArray(dashboard?.keywords) ? dashboard.keywords : [];
const rankings = Array.isArray(dashboard?.rankings) ? dashboard.rankings : [];
const requiredKeywords = Array.isArray(config.keywords) ? config.keywords : [];
const rows = keywords.map((keyword) => {
  const history = rankings
    .filter((item) => item?.keywordId === keyword?.id)
    .sort((a, b) => toTime(b?.checkedAt) - toTime(a?.checkedAt));
  const latest = history[0] || null;
  const latestRank = validRank(latest?.rank);
  const previousDay = comparison(history, latest, latestRank, 1, 20);
  const sevenDays = comparison(history, latest, latestRank, 7, 36);
  const thirtyDays = comparison(history, latest, latestRank, 30, 60);
  const latestAgeHours = latest?.checkedAt ? (generatedAt.getTime() - toTime(latest.checkedAt)) / 3600000 : null;
  return {
    keywordId: keyword.id,
    keyword: keyword.name,
    latestRank,
    comparisons: {
      previousDay,
      sevenDays,
      thirtyDays
    },
    status: latest?.status || 'no-record',
    note: latest?.note || '측정 기록 없음',
    checkedAt: latest?.checkedAt || null,
    freshWithin36Hours: latestAgeHours !== null && latestAgeHours >= 0 && latestAgeHours <= 36,
    recent: history.slice(0, 7).map((item) => ({ rank: item?.rank ?? null, checkedAt: item?.checkedAt ?? null, status: item?.status ?? null }))
  };
});

const configuredNames = new Set(keywords.map((item) => item?.name));
const missingKeywords = requiredKeywords.filter((name) => !configuredNames.has(name));
const healthOk = health?.message === 'Success';
const storeOk = dashboard?.storeName === config.storeName;
const measurementCount = rows.filter((row) => row.checkedAt).length;
const freshCount = rows.filter((row) => row.freshWithin36Hours).length;
const sharpThreshold = Number(config.policy?.sharpMoveThreshold || 5);
const sharpMoves = rows.filter((row) => typeof row.comparisons.previousDay.delta === 'number' && Math.abs(row.comparisons.previousDay.delta) >= sharpThreshold);
const status = healthOk && storeOk && missingKeywords.length === 0 ? (measurementCount > 0 ? 'PASS' : 'WARN') : 'FAIL';

const report = {
  schemaVersion: 2,
  generatedAt: generatedAt.toISOString(),
  status,
  module: config.module,
  storeName: config.storeName,
  deployUrl: base,
  rankingScheduleKst: config.rankingScheduleKst,
  supervisorScheduleKst: config.supervisorScheduleKst,
  checks: {
    healthOk,
    storeOk,
    requiredKeywordsPresent: missingKeywords.length === 0,
    requiredKeywordCount: requiredKeywords.length,
    measurementCount,
    freshWithin36HoursCount: freshCount,
    fabricatedRanksForbidden: config.policy?.fabricatedRanksForbidden === true,
    p3ReadOnlySupervisor: config.policy?.p3ReadOnlySupervisor === true,
    comparisonWindowsDays: config.policy?.comparisonWindowsDays || [1, 7, 30]
  },
  missingKeywords,
  sharpMoves,
  rows
};

const lines = [
  '# P3 매장 검색순위 일일 보고',
  '',
  `**상태: ${status}**`,
  '',
  `- 생성: ${report.generatedAt}`,
  `- 매장: ${config.storeName}`,
  `- 필수 추적 키워드: ${requiredKeywords.length}개`,
  `- 순위 자동 측정: 매일 ${config.rankingScheduleKst} KST`,
  `- P3 감독: 매일 ${config.supervisorScheduleKst} KST`,
  `- 측정 기록: ${measurementCount}개 / 최근 36시간 기록: ${freshCount}개`,
  `- P3 모드: 읽기 전용 감독`,
  `- 확인 불가 순위: 숫자를 만들지 않고 ‘미확인’ 유지`,
  '',
  '## 키워드 현황'
];
for (const row of rows) {
  const p = row.comparisons;
  lines.push(`- ${row.keyword}: **${rankText(row.latestRank)}** · ${moveText('전일', p.previousDay, row.latestRank)} · ${moveText('7일', p.sevenDays, row.latestRank)} · ${moveText('30일', p.thirtyDays, row.latestRank)} · ${row.checkedAt || '기록 없음'}`);
}
if (missingKeywords.length) {
  lines.push('', '## 누락 키워드', ...missingKeywords.map((name) => `- ${name}`));
}
if (sharpMoves.length) {
  lines.push('', `## 급변 감지 (${sharpThreshold}계단 이상)`, ...sharpMoves.map((row) => `- ${row.keyword}: ${moveText('전일', row.comparisons.previousDay, row.latestRank)}`));
}
lines.push('', status === 'FAIL' ? '## 결과\n연결 또는 필수 키워드 검증 실패.' : status === 'WARN' ? '## 결과\n연결은 정상이나 아직 측정 기록이 없습니다.' : '## 결과\nP3 일일 감독 정상.');

await writeFile('p3-store-ranking-report.json', `${JSON.stringify(report, null, 2)}\n`, 'utf8');
await writeFile('p3-store-ranking-report.md', `${lines.join('\n')}\n`, 'utf8');
console.log(`STORE RANKING SUPERVISOR ${status} required=${requiredKeywords.length} measurements=${measurementCount} fresh=${freshCount} missing=${missingKeywords.length}`);
if (status === 'FAIL') process.exit(1);
