import { placeRankData } from './place-rank-data.js';

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

function rankAt(history, keyword, offsetFromEnd) {
  const index = history.length - 1 - offsetFromEnd;
  if (index < 0) return null;
  return rankMap(history[index]).get(keyword)?.rank ?? null;
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

export function getPlaceRankPayload() {
  const history = Array.isArray(placeRankData.history) ? placeRankData.history : [];
  const latest = history.at(-1) || null;
  const currentMap = rankMap(latest);
  const keywords = Array.from(new Set(history.flatMap(day => (day.results || []).map(item => item.keyword))));
  const rows = keywords.map(keyword => {
    const current = currentMap.get(keyword) || { keyword, rank: null, status: 'pending', resultCount: null };
    const yesterday = rankAt(history, keyword, 1);
    const sevenDays = rankAt(history, keyword, Math.min(7, Math.max(0, history.length - 1)));
    const thirtyDays = rankAt(history, keyword, Math.min(30, Math.max(0, history.length - 1)));
    return {
      keyword,
      rank: current.rank ?? null,
      status: current.status || 'unknown',
      resultCount: current.resultCount ?? null,
      change1d: change(yesterday, current.rank),
      change7d: change(sevenDays, current.rank),
      change30d: change(thirtyDays, current.rank)
    };
  });
  return {
    ok: true,
    module: 'place-rank',
    service: '스타포인트안경원 네이버 플레이스 순위',
    schedule: '매일 14:10 KST',
    source: latest?.source || 'pending',
    generatedAt: placeRankData.generatedAt || latest?.checkedAt || null,
    latest,
    rows,
    historyDays: history.length,
    policy: {
      directBrowserCheck: true,
      captchaBypass: false,
      blockedResultStoredAsRank: false,
      historyRetentionDays: 90
    }
  };
}

export function placeRankDashboard() {
  const payload = getPlaceRankPayload();
  const rows = payload.rows;
  const cards = rows.map(row => {
    const rank = Number.isFinite(row.rank) ? `${row.rank}위` : '-';
    const delta = row.change1d;
    const movement = Number.isFinite(delta) ? (delta > 0 ? `▲${delta}` : delta < 0 ? `▼${Math.abs(delta)}` : '동일') : '기록 대기';
    const movementClass = Number.isFinite(delta) ? (delta > 0 ? 'up' : delta < 0 ? 'down' : 'same') : 'muted';
    const status = row.status === 'ok' ? '자동확인' : row.status === 'seed' ? '초기값' : row.status === 'blocked' ? '네이버 차단' : row.status === 'pending' ? '검사 대기' : row.status;
    return `<article class="card"><div class="row"><h2>${escapeHtml(row.keyword)}</h2><span class="status">${escapeHtml(status)}</span></div><div class="rank-row"><strong>${rank}</strong><span class="${movementClass}">${movement}</span></div><div class="sub">7일 ${formatDelta(row.change7d)} · 30일 ${formatDelta(row.change30d)} · 확인결과 ${row.resultCount ?? '-'}개</div></article>`;
  }).join('');
  const data = JSON.stringify(payload).replace(/</g, '\\u003c');
  return new Response(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>스타포인트 검색순위</title><style>
  :root{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111827;background:#f4f7fb}*{box-sizing:border-box}body{margin:0;background:#f4f7fb}.wrap{max-width:720px;margin:0 auto;padding:24px 18px 48px}.hero{background:linear-gradient(135deg,#0b67d0,#2f94ff);color:#fff;border-radius:24px;padding:24px;box-shadow:0 12px 32px rgba(28,110,205,.22)}.eyebrow{font-size:13px;opacity:.82;margin:0 0 8px}.hero h1{font-size:25px;line-height:1.3;margin:0 0 10px}.hero p{margin:0;font-size:14px;opacity:.9}.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:14px 0 22px}.pill{background:#fff;border-radius:18px;padding:14px 10px;text-align:center;box-shadow:0 4px 16px rgba(16,24,40,.06)}.pill b{display:block;font-size:17px}.pill span{font-size:12px;color:#667085}.section-title{display:flex;justify-content:space-between;align-items:end;margin:0 2px 10px}.section-title h3{margin:0;font-size:17px}.section-title small{color:#667085}.cards{display:grid;gap:12px}.card{background:#fff;border-radius:20px;padding:18px;box-shadow:0 4px 18px rgba(16,24,40,.06);border:1px solid #edf1f7}.row{display:flex;justify-content:space-between;gap:12px;align-items:center}.row h2{font-size:17px;margin:0}.status{font-size:11px;color:#475467;background:#f2f4f7;border-radius:999px;padding:5px 8px;white-space:nowrap}.rank-row{display:flex;align-items:baseline;gap:12px;margin-top:12px}.rank-row strong{font-size:32px;letter-spacing:-1px}.rank-row span{font-weight:700;font-size:14px}.up{color:#1570ef}.down{color:#d92d20}.same{color:#667085}.muted{color:#98a2b3}.sub{margin-top:8px;color:#667085;font-size:12px}.notice{margin-top:18px;background:#fff8e7;border:1px solid #ffe0a3;padding:14px 16px;border-radius:16px;color:#7a4b00;font-size:12px;line-height:1.55}.foot{margin-top:18px;text-align:center;color:#98a2b3;font-size:11px}@media(max-width:420px){.wrap{padding:16px 12px 36px}.hero{border-radius:20px;padding:20px}.hero h1{font-size:22px}.summary{gap:7px}.pill{padding:12px 6px}.card{padding:16px}.rank-row strong{font-size:29px}}
  </style></head><body><main class="wrap"><section class="hero"><p class="eyebrow">P3 매장 검색순위 모듈</p><h1>스타포인트안경원<br>네이버 플레이스 순위</h1><p>매일 14:10 자동 확인 · 최근 ${payload.historyDays}일 기록</p></section><section class="summary"><div class="pill"><b>${rows.filter(r=>Number.isFinite(r.rank)).length}</b><span>순위 확인</span></div><div class="pill"><b>${rows.filter(r=>Number.isFinite(r.change1d)&&r.change1d>0).length}</b><span>오늘 상승</span></div><div class="pill"><b>${rows.filter(r=>r.status==='blocked').length}</b><span>조회 차단</span></div></section><div class="section-title"><h3>오늘의 키워드</h3><small>${escapeHtml(payload.generatedAt || '대기중')}</small></div><section class="cards">${cards}</section><div class="notice">순위가 작을수록 좋습니다. ▲는 어제보다 상승, ▼는 하락입니다. 네이버가 자동접속을 차단하면 우회하지 않고 ‘네이버 차단’으로 표시하며 잘못된 순위를 저장하지 않습니다.</div><div class="foot">P3 Automation Hub · Naver Map browser check</div></main><script>window.__PLACE_RANK__=${data};</script></body></html>`, { status: 200, headers: HTML_HEADERS });
}
