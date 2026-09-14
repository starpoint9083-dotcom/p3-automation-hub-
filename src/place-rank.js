import { placeRankData } from './place-rank-data.js';
import { placeRankGridData } from './place-rank-grid-data.js';

const HTML_HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff'
};

function rankMap(snapshot) {
  const map = new Map();
  for (const item of snapshot?.results || []) map.set(item.keyword, item);
  return map;
}

function toTime(value) {
  const time = Date.parse(value || '');
  return Number.isFinite(time) ? time : 0;
}

function rankAroundDays(history, latest, keyword, daysAgo, toleranceHours) {
  const anchor = toTime(latest?.checkedAt || latest?.date);
  if (!anchor) return null;
  const target = anchor - daysAgo * 86400000;
  let bestRank = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const snapshot of history) {
    const rank = rankMap(snapshot).get(keyword)?.rank;
    if (!Number.isFinite(rank)) continue;
    const time = toTime(snapshot?.checkedAt || snapshot?.date);
    if (!time) continue;
    const distance = Math.abs(time - target);
    if (distance < bestDistance) {
      bestRank = rank;
      bestDistance = distance;
    }
  }
  return bestDistance <= toleranceHours * 3600000 ? bestRank : null;
}

function change(previous, current) {
  if (!Number.isFinite(previous) || !Number.isFinite(current)) return null;
  return previous - current;
}

function formatDelta(value) {
  if (!Number.isFinite(value)) return '-';
  if (value > 0) return `▲${value}`;
  if (value < 0) return `▼${Math.abs(value)}`;
  return '동일';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function statusText(status) {
  if (status === 'ok') return '자동확인';
  if (status === 'seed') return '초기값';
  if (status === 'blocked') return '네이버 차단';
  if (status === 'pending') return '검사 대기';
  if (status === 'not-found') return '현재 확인범위 내 미발견';
  if (status === 'unverified') return '확인 불충분';
  if (status === 'location-mismatch') return '위치 검증 실패';
  if (status === 'no-results') return '검색결과 없음';
  if (status === 'error') return '검사 오류';
  return status || '미확인';
}

function gridSummaryMap(snapshot) {
  const map = new Map();
  for (const item of snapshot?.summaries || []) map.set(item.keyword, item);
  return map;
}

function gridSummaryAroundDays(history, latest, keyword, daysAgo, toleranceHours) {
  const anchor = toTime(latest?.checkedAt || latest?.date);
  if (!anchor) return null;
  const target = anchor - daysAgo * 86400000;
  let best = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const snapshot of history || []) {
    const item = gridSummaryMap(snapshot).get(keyword);
    if (!item) continue;
    const time = toTime(snapshot?.checkedAt || snapshot?.date);
    if (!time) continue;
    const distance = Math.abs(time - target);
    if (distance < bestDistance) {
      best = item;
      bestDistance = distance;
    }
  }
  return bestDistance <= toleranceHours * 3600000 ? best : null;
}

function getGridPayload() {
  const latest = placeRankGridData?.latest || null;
  const history = Array.isArray(placeRankGridData?.history) ? placeRankGridData.history : [];
  const limit = Number(latest?.grid?.topRankLimit || 20);
  const summaries = latest?.summaries || [];
  const rows = summaries.map(current => {
    const previous1d = gridSummaryAroundDays(history, latest, current.keyword, 1, 20);
    const previous7d = gridSummaryAroundDays(history, latest, current.keyword, 7, 36);
    const previous30d = gridSummaryAroundDays(history, latest, current.keyword, 30, 60);
    return {
      ...current,
      changeMedian1d: change(previous1d?.medianRankCapped, current.medianRankCapped),
      changeMedian7d: change(previous7d?.medianRankCapped, current.medianRankCapped),
      changeMedian30d: change(previous30d?.medianRankCapped, current.medianRankCapped),
      changeTop10_1d: Number.isFinite(previous1d?.top10Pct) && Number.isFinite(current.top10Pct) ? Math.round((current.top10Pct - previous1d.top10Pct) * 10) / 10 : null
    };
  });
  return {
    configured: true,
    ready: Boolean(latest),
    schedule: '매일 14:25 KST',
    generatedAt: placeRankGridData?.generatedAt || latest?.checkedAt || null,
    grid: latest?.grid || { size: 5, spacingMeters: 1000, pointCount: 25, topRankLimit: 20 },
    rows,
    cells: latest?.cells || [],
    historyDays: history.length,
    policy: {
      fixedGrid: true,
      gridSize: '5x5',
      spacingMeters: 1000,
      storePointWeight: '1/25',
      representativeMetric: `중앙순위(미노출은 ${limit + 1}로 캡핑)`,
      coverageMetrics: ['TOP3', 'TOP10', 'TOP20'],
      loginPersonalization: false
    }
  };
}

export function getPlaceRankPayload() {
  const history = Array.isArray(placeRankData.history) ? placeRankData.history : [];
  const latest = history.at(-1) || null;
  const currentMap = rankMap(latest);
  const keywords = Array.from(new Set(history.flatMap(day => (day.results || []).map(item => item.keyword))));
  const rows = keywords.map(keyword => {
    const current = currentMap.get(keyword) || { keyword, rank: null, status: 'pending', resultCount: null };
    const yesterday = rankAroundDays(history, latest, keyword, 1, 20);
    const sevenDays = rankAroundDays(history, latest, keyword, 7, 36);
    const thirtyDays = rankAroundDays(history, latest, keyword, 30, 60);
    return {
      keyword,
      rank: current.rank ?? null,
      status: current.status || 'unknown',
      resultCount: current.resultCount ?? null,
      change1d: change(yesterday, current.rank),
      change7d: change(sevenDays, current.rank),
      change30d: change(thirtyDays, current.rank),
      baseline1d: yesterday,
      baseline7d: sevenDays,
      baseline30d: thirtyDays
    };
  });
  return {
    ok: true,
    module: 'place-rank',
    service: '스타포인트안경원 네이버 플레이스 순위',
    schedule: '매일 14:10 KST',
    source: latest?.source || 'pending',
    location: latest?.location || null,
    generatedAt: placeRankData.generatedAt || latest?.checkedAt || null,
    latest,
    rows,
    historyDays: history.length,
    grid: getGridPayload(),
    policy: {
      directBrowserCheck: true,
      locationPinnedToStore: true,
      captchaBypass: false,
      blockedResultStoredAsRank: false,
      unverifiedResultStoredAsRank: false,
      historyRetentionDays: 90,
      comparisonDays: [1, 7, 30],
      objectiveGeoGrid: true
    }
  };
}

function medianText(value, limit) {
  if (!Number.isFinite(value)) return '대기';
  if (value > limit) return `${limit}위 밖`;
  return `${Number.isInteger(value) ? value : value.toFixed(1)}위`;
}

function gridCellClass(cell, limit) {
  if (!cell || ['blocked', 'unverified', 'location-mismatch', 'error'].includes(cell.status)) return 'cell unknown';
  if (!Number.isFinite(cell.rank) || cell.rank > limit) return 'cell out';
  if (cell.rank <= 3) return 'cell best';
  if (cell.rank <= 10) return 'cell good';
  return 'cell mid';
}

function gridCellText(cell, limit) {
  if (!cell || ['blocked', 'unverified', 'location-mismatch', 'error'].includes(cell.status)) return '?';
  if (!Number.isFinite(cell.rank) || cell.rank > limit) return `${limit}+`;
  return String(cell.rank);
}

export function placeRankDashboard() {
  const payload = getPlaceRankPayload();
  const rows = payload.rows;
  const gridPayload = payload.grid;
  const limit = Number(gridPayload?.grid?.topRankLimit || 20);
  const gridCards = gridPayload.ready ? gridPayload.rows.map(row => {
    const cells = gridPayload.cells.filter(cell => cell.keyword === row.keyword).sort((a, b) => (a.row - b.row) || (a.col - b.col));
    const heat = cells.map(cell => `<div class="${gridCellClass(cell, limit)}${cell.isStore ? ' store' : ''}" title="${escapeHtml(cell.pointId)} · ${escapeHtml(statusText(cell.status))}">${gridCellText(cell, limit)}${cell.isStore ? '<i>●</i>' : ''}</div>`).join('');
    return `<article class="grid-card"><div class="row"><h2>${escapeHtml(row.keyword)}</h2><span class="status">25지점</span></div><div class="grid-head"><div><span>대표 중앙순위</span><strong>${medianText(row.medianRankCapped, limit)}</strong><small>${formatDelta(row.changeMedian1d)} · 7일 ${formatDelta(row.changeMedian7d)} · 30일 ${formatDelta(row.changeMedian30d)}</small></div><div class="visibility"><span>노출력</span><b>${Number.isFinite(row.visibilityScore) ? `${row.visibilityScore}점` : '-'}</b><small>매장앞 ${Number.isFinite(row.storePointRank) ? `${row.storePointRank}위` : '-'}</small></div></div><div class="coverage"><span>TOP3 <b>${row.top3Pct ?? '-'}%</b></span><span>TOP10 <b>${row.top10Pct ?? '-'}%</b></span><span>TOP20 <b>${row.top20Pct ?? '-'}%</b></span></div><div class="heat">${heat}</div><div class="grid-note">북쪽 ↑ · 1km 간격 · ● 매장 위치 · 유효 ${row.validPoints}/${row.totalPoints}지점</div></article>`;
  }).join('') : `<div class="grid-wait"><b>25지점 첫 측정 대기</b><span>코드 배포 후 첫 자동 측정이 끝나면 여기에 객관순위가 표시됩니다.</span></div>`;

  const cards = rows.map(row => {
    const rank = Number.isFinite(row.rank) ? `${row.rank}위` : '미확인';
    const delta = row.change1d;
    const movement = Number.isFinite(delta) ? (delta > 0 ? `▲${delta}` : delta < 0 ? `▼${Math.abs(delta)}` : '동일') : '기록 대기';
    const movementClass = Number.isFinite(delta) ? (delta > 0 ? 'up' : delta < 0 ? 'down' : 'same') : 'muted';
    return `<article class="card"><div class="row"><h2>${escapeHtml(row.keyword)}</h2><span class="status">${escapeHtml(statusText(row.status))}</span></div><div class="rank-row"><strong>${rank}</strong><span class="${movementClass}">${movement}</span></div><div class="sub">전일 ${formatDelta(row.change1d)} · 7일 ${formatDelta(row.change7d)} · 30일 ${formatDelta(row.change30d)} · 확인결과 ${row.resultCount ?? '-'}개</div></article>`;
  }).join('');
  const data = JSON.stringify(payload).replace(/</g, '\\u003c');
  return new Response(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>스타포인트 검색순위</title><style>
  :root{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111827;background:#f4f7fb}*{box-sizing:border-box}body{margin:0;background:#f4f7fb}.wrap{max-width:760px;margin:0 auto;padding:24px 18px 48px}.hero{background:linear-gradient(135deg,#0b67d0,#2f94ff);color:#fff;border-radius:24px;padding:24px;box-shadow:0 12px 32px rgba(28,110,205,.22)}.eyebrow{font-size:13px;opacity:.82;margin:0 0 8px}.hero h1{font-size:25px;line-height:1.3;margin:0 0 10px}.hero p{margin:0;font-size:14px;opacity:.9}.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:14px 0 22px}.pill{background:#fff;border-radius:18px;padding:14px 10px;text-align:center;box-shadow:0 4px 16px rgba(16,24,40,.06)}.pill b{display:block;font-size:17px}.pill span{font-size:12px;color:#667085}.section-title{display:flex;justify-content:space-between;align-items:end;margin:24px 2px 10px}.section-title h3{margin:0;font-size:18px}.section-title small{color:#667085}.grid-cards,.cards{display:grid;gap:12px}.grid-card,.card{background:#fff;border-radius:20px;padding:18px;box-shadow:0 4px 18px rgba(16,24,40,.06);border:1px solid #edf1f7}.row{display:flex;justify-content:space-between;gap:12px;align-items:center}.row h2{font-size:17px;margin:0}.status{font-size:11px;color:#475467;background:#f2f4f7;border-radius:999px;padding:5px 8px;white-space:nowrap}.grid-head{display:grid;grid-template-columns:1fr auto;gap:16px;align-items:end;margin-top:14px}.grid-head span,.visibility span{display:block;color:#667085;font-size:11px}.grid-head strong{display:block;font-size:30px;letter-spacing:-1px;margin-top:2px}.grid-head small,.visibility small{display:block;color:#98a2b3;font-size:11px;margin-top:3px}.visibility{text-align:right}.visibility b{display:block;font-size:20px;margin-top:4px}.coverage{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin:14px 0 12px}.coverage span{background:#f8fafc;border-radius:12px;padding:9px 8px;text-align:center;font-size:11px;color:#667085}.coverage b{display:block;color:#111827;font-size:14px;margin-top:2px}.heat{display:grid;grid-template-columns:repeat(5,1fr);gap:5px}.cell{aspect-ratio:1;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;position:relative;border:1px solid rgba(0,0,0,.04)}.cell i{position:absolute;right:3px;bottom:1px;font-size:7px;font-style:normal}.cell.best{background:#d8f5e5;color:#067647}.cell.good{background:#e5efff;color:#175cd3}.cell.mid{background:#fff2cc;color:#854a0e}.cell.out{background:#fee4e2;color:#b42318}.cell.unknown{background:#f2f4f7;color:#98a2b3}.cell.store{outline:2px solid #111827;outline-offset:-2px}.grid-note{margin-top:9px;color:#98a2b3;font-size:10px;text-align:center}.grid-wait{background:#fff;border-radius:20px;padding:22px;border:1px dashed #b9c3d1;text-align:center}.grid-wait b{display:block}.grid-wait span{display:block;color:#667085;font-size:12px;margin-top:6px}.rank-row{display:flex;align-items:baseline;gap:12px;margin-top:12px}.rank-row strong{font-size:32px;letter-spacing:-1px}.rank-row span{font-weight:700;font-size:14px}.up{color:#1570ef}.down{color:#d92d20}.same{color:#667085}.muted{color:#98a2b3}.sub{margin-top:8px;color:#667085;font-size:12px}.notice{margin-top:18px;background:#fff8e7;border:1px solid #ffe0a3;padding:14px 16px;border-radius:16px;color:#7a4b00;font-size:12px;line-height:1.55}.foot{margin-top:18px;text-align:center;color:#98a2b3;font-size:11px}@media(max-width:420px){.wrap{padding:16px 12px 36px}.hero{border-radius:20px;padding:20px}.hero h1{font-size:22px}.summary{gap:7px}.pill{padding:12px 6px}.grid-card,.card{padding:16px}.grid-head strong{font-size:27px}.rank-row strong{font-size:29px}.heat{gap:4px}.cell{border-radius:8px}}
  </style></head><body><main class="wrap"><section class="hero"><p class="eyebrow">P3 매장 검색순위 V2</p><h1>스타포인트안경원<br>네이버 플레이스 객관순위</h1><p>매장앞 1지점 + 수영구 생활권 25지점 · 1km 고정 격자 · 매일 자동 확인</p></section><section class="summary"><div class="pill"><b>${gridPayload.ready ? '25' : '-'}</b><span>객관 측정지점</span></div><div class="pill"><b>${gridPayload.rows.filter(r=>Number.isFinite(r.medianRankCapped)&&r.medianRankCapped<=10).length}</b><span>중앙 TOP10</span></div><div class="pill"><b>${rows.filter(r=>r.status==='blocked'||r.status==='unverified'||r.status==='error').length + gridPayload.rows.reduce((n,r)=>n+(r.blockedPoints||0)+(r.unverifiedPoints||0),0)}</b><span>재확인 필요</span></div></section><div class="section-title"><h3>수영구 25지점 객관순위</h3><small>${escapeHtml(gridPayload.generatedAt || '첫 측정 대기')}</small></div><section class="grid-cards">${gridCards}</section><div class="notice">객관순위는 매장 중심 5×5 격자에서 1km 간격으로 같은 검색어를 반복 측정합니다. 매장 바로 앞은 25개 중 1개로만 반영합니다. 대표값은 중앙순위이며, TOP3·TOP10·TOP20 점유율과 함께 보세요. 개인 로그인 기록은 사용하지 않습니다.</div><div class="section-title"><h3>매장 기준 참고순위</h3><small>${escapeHtml(payload.generatedAt || '대기중')}</small></div><section class="cards">${cards}</section><div class="notice">매장 기준 순위는 가까운 위치 효과가 커서 참고용입니다. ‘현재 확인범위 내 미발견’은 확보한 검색목록에서 스타포인트를 찾지 못했다는 뜻이며 임의로 50위 밖이라고 단정하지 않습니다.</div><div class="foot">P3 Automation Hub · Naver Map Geo-grid V2</div></main><script>window.__PLACE_RANK__=${data};</script></body></html>`, { status: 200, headers: HTML_HEADERS });
}
