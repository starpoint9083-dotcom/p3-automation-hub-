import { BLOG_ENGINE_VERSION, STORE_PROFILE, CORE_KEYWORDS, MEDIA_POLICY } from './blog-engine-config.js';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'access-control-allow-origin': '*'
};

const MIN_TREND_SCORE = 18;
const FALLBACK_TRENDS = ['자외선', '여행', '운전', '개학', '선글라스', '컴퓨터'];
const EVERGREEN_TOPICS = [
  { keyword: '가을 자외선', blog_bridge: '변색렌즈와 눈부심 관리', suggested_title: '가을에도 자외선은 남습니다, 변색렌즈를 고를 때 볼 것', source: 'optical_fallback' },
  { keyword: '40대 노안', blog_bridge: '누진다초점 적응과 정밀 시력검사', suggested_title: '40대부터 가까운 글씨가 불편하다면, 누진다초점 전에 확인할 것', source: 'optical_fallback' },
  { keyword: '야간운전 눈부심', blog_bridge: '운전할 때 편한 렌즈와 눈부심 관리', suggested_title: '야간운전 눈부심이 불편할 때 안경에서 먼저 확인할 것', source: 'optical_fallback' },
  { keyword: '컴퓨터 눈 피로', blog_bridge: '사무용 안경과 디지털 눈 피로', suggested_title: '컴퓨터를 오래 보는 직장인, 사무용 안경은 무엇이 다를까?', source: 'optical_fallback' },
  { keyword: '학생 근시', blog_bridge: '학생 시력과 근시 관리', suggested_title: '개학 후 칠판이 흐리다면, 학생 시력검사에서 확인할 것', source: 'optical_fallback' }
];

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: JSON_HEADERS });
}

function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff'
    }
  });
}

function decodeXml(value = '') {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function extractTag(block, tag) {
  const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? decodeXml(match[1]) : '';
}

async function fetchGoogleTrends(limit = 30) {
  const endpoint = 'https://trends.google.com/trending/rss?geo=KR';
  const response = await fetch(endpoint, {
    headers: { 'user-agent': 'P3-Blog-Engine/0.2 (+https://workers.dev)' }
  });
  if (!response.ok) throw new Error(`google_trends_http_${response.status}`);
  const xml = await response.text();
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)]
    .slice(0, Math.max(1, Math.min(Number(limit) || 30, 50)))
    .map((match, index) => {
      const block = match[1];
      return {
        rank: index + 1,
        keyword: extractTag(block, 'title'),
        traffic: extractTag(block, 'ht:approx_traffic') || null,
        published_at: extractTag(block, 'pubDate') || null,
        source: 'google_trends_kr'
      };
    })
    .filter(item => item.keyword);
  if (!items.length) throw new Error('google_trends_empty');
  return items;
}

function normalize(value = '') {
  return String(value).toLowerCase().replace(/\s+/g, ' ').trim();
}

function allStoreTerms() {
  return [
    ...CORE_KEYWORDS,
    ...STORE_PROFILE.region,
    ...STORE_PROFILE.audience,
    ...Object.values(STORE_PROFILE.topicGroups).flat()
  ];
}

function scoreTrend(keyword) {
  const text = normalize(keyword);
  let score = 0;
  const reasons = [];

  for (const term of allStoreTerms()) {
    const t = normalize(term);
    if (t && text.includes(t)) {
      score += 25;
      reasons.push(`직접연관:${term}`);
    }
  }

  const signals = {
    여행: ['변색렌즈', '선글라스', '편광렌즈'],
    휴가: ['변색렌즈', '선글라스', '편광렌즈'],
    캠핑: ['변색렌즈', '선글라스', '편광렌즈'],
    등산: ['변색렌즈', '선글라스', '편광렌즈'],
    운전: ['운전용 안경', '편광렌즈', '야간운전'],
    자외선: ['변색렌즈', '선글라스'],
    개학: ['학생 시력', '근시억제', '키즈 안경'],
    입학: ['학생 시력', '근시억제', '키즈 안경'],
    수능: ['학생 시력', '근거리 피로'],
    컴퓨터: ['블루라이트', '사무용 안경', '디지털 피로'],
    스마트폰: ['근거리 피로', '학생 시력'],
    패션: ['안경테', '구찌 안경', '톰포드 안경', '디올 안경'],
    선글라스: ['자외선', '편광렌즈']
  };

  for (const [signal, mapped] of Object.entries(signals)) {
    if (text.includes(normalize(signal))) {
      score += 18;
      reasons.push(`확장연관:${signal}→${mapped.join('/')}`);
    }
  }

  return {
    score,
    eligible: score >= MIN_TREND_SCORE,
    reasons: reasons.length ? reasons : ['안경원 주제와 직접 연결 근거 없음']
  };
}

function chooseBridge(keyword) {
  const text = normalize(keyword);
  const rules = [
    { keys: ['자외선', '여행', '휴가', '캠핑', '등산', '야외', '햇빛', '선글라스'], topic: '변색렌즈와 눈부심 관리' },
    { keys: ['운전', '자동차', '야간'], topic: '운전할 때 편한 렌즈와 눈부심 관리' },
    { keys: ['컴퓨터', '노트북', '업무', '직장', '스마트폰'], topic: '사무용 안경과 디지털 눈 피로' },
    { keys: ['개학', '입학', '학생', '학교', '수능'], topic: '학생 시력과 근시 관리' },
    { keys: ['패션', '스타일', '연예인'], topic: '얼굴형과 라이프스타일에 맞는 안경테' },
    { keys: ['중년', '40대', '50대', '노안'], topic: '누진다초점 적응과 정밀 시력검사' }
  ];
  const matched = rules.find(rule => rule.keys.some(key => text.includes(normalize(key))));
  return matched ? matched.topic : '정확한 시력검사와 생활에 맞는 안경 선택';
}

function analyzeTopics(trends) {
  const scored = trends
    .map(item => {
      const quality = scoreTrend(item.keyword);
      return {
        ...item,
        relevance_score: quality.score,
        eligible: quality.eligible,
        reasons: quality.reasons,
        blog_bridge: chooseBridge(item.keyword),
        suggested_title: `${item.keyword}, 안경 선택과 연결해서 꼭 확인할 것은?`
      };
    })
    .sort((a, b) => b.relevance_score - a.relevance_score || a.rank - b.rank);

  return {
    accepted: scored.filter(item => item.eligible),
    rejected: scored.filter(item => !item.eligible)
  };
}

function fallbackTopic() {
  const month = new Date().getUTCMonth() + 1;
  if ([8, 9, 10].includes(month)) return { ...EVERGREEN_TOPICS[0], trend_mode: 'evergreen_fallback' };
  if ([2, 3, 4].includes(month)) return { ...EVERGREEN_TOPICS[4], trend_mode: 'evergreen_fallback' };
  return { ...EVERGREEN_TOPICS[1], trend_mode: 'evergreen_fallback' };
}

function buildTemplateDraft(topic) {
  const keyword = topic.keyword;
  const bridge = topic.blog_bridge;
  const trending = topic.trend_mode !== 'evergreen_fallback';
  return {
    mode: 'template',
    title: topic.suggested_title,
    opening: trending
      ? `지금 '${keyword}'에 대한 관심이 높아지고 있습니다. 다만 유행 검색어를 억지로 끼워 넣지 않고, 실제 생활에서 눈과 안경 선택에 연결되는 부분만 살펴보겠습니다.`
      : `오늘 실시간 인기 검색어 가운데 안경원 주제와 자연스럽게 연결할 만한 검색어가 없어, 억지 연결 대신 '${keyword}'처럼 실제 상담에서 자주 나오는 주제를 골랐습니다.`,
    sections: [
      { heading: `1. ${keyword}, 어떤 상황에서 불편해질까?`, points: ['생활 속 불편 상황부터 설명', '검색어 반복보다 실제 궁금증 해결에 집중'] },
      { heading: '2. 안경 선택과 연결되는 지점', points: [bridge, '거리·조명·운전·업무·야외활동 여부를 기준으로 설명'] },
      { heading: '3. 제품보다 먼저 확인할 것', points: ['정확한 시력검사', '기존 안경의 불편 원인', '사용 환경과 적응 가능성'] },
      { heading: '4. 스타포인트안경원에서는', points: ['정밀검사 후 필요한 기능만 제안', '누진·변색·편광·사무용·키즈 근시관리 중 상황에 맞게 상담'] }
    ],
    closing: '유행하는 기능보다 내 눈과 생활에 맞는지가 더 중요합니다. 현재 안경이 불편하거나 어떤 렌즈가 맞는지 헷갈린다면 사용 환경부터 차근차근 확인해 보세요.',
    media_plan: {
      owned_photo_slots: ['매장 전경 또는 검사 장면', '주제와 관련된 실제 안경/렌즈', '착용 또는 가공 디테일'],
      image_search_queries: [`${keyword} 안경`, `${bridge} 이미지`, '안경 렌즈 생활 장면'],
      ai_image_prompts: [`한국의 세련된 안경원에서 ${bridge} 상담을 받는 자연스러운 생활 사진, 과장된 광고 느낌 없이 현실적인 조명`],
      video_search_queries: [`${keyword} 안경 설명`, `${bridge} 30초 설명`]
    },
    hashtags: ['#스타포인트안경원', '#수영구안경원', '#광안동안경원', '#정밀시력검사']
  };
}

function extractAiText(result) {
  if (typeof result === 'string') return result;
  if (result?.response) return result.response;
  if (result?.result?.response) return result.result.response;
  if (result?.choices?.[0]?.message?.content) return result.choices[0].message.content;
  return '';
}

function parseJsonFromModel(text) {
  const cleaned = String(text || '').replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  try { return JSON.parse(cleaned); } catch {}
  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first >= 0 && last > first) {
    try { return JSON.parse(cleaned.slice(first, last + 1)); } catch {}
  }
  return null;
}

async function buildAiDraft(env, topic) {
  if (!env?.AI || typeof env.AI.run !== 'function') return null;
  const trending = topic.trend_mode !== 'evergreen_fallback';
  const prompt = `너는 부산 수영구 광안동 스타포인트안경원의 네이버 블로그 편집장이다.\n선택 주제: ${topic.keyword}\n안경원 연결 주제: ${topic.blog_bridge}\n실시간 트렌드 채택 여부: ${trending ? 'YES' : 'NO - 억지 연결을 피한 대체 주제'}\n목표: 독자가 실제로 궁금해할 생활 문제를 해결하면서 검색 노출에 유리한 자연스러운 한국어 블로그 글을 만든다.\n규칙: 1) 검색어를 억지 반복하지 않는다. 2) 의료적 진단·치료 효과를 단정하지 않는다. 3) 정확한 시력검사의 중요성을 자연스럽게 넣는다. 4) 매장 홍보는 마지막에 짧고 신뢰감 있게 한다. 5) 사진 위치 4~6곳과 30초 세로영상 구성도 함께 만든다. 6) 외부 이미지는 저작권 확인 없는 재사용을 지시하지 않는다.\n반드시 JSON만 출력한다. 스키마: {"title":"","intro":"","sections":[{"heading":"","body":"","photo_after":true}],"photo_slots":[{"position":"","description":"","source_preference":"owned|licensed|ai","search_query":""}],"video_plan":{"hook":"","shots":[""],"duration_sec":30,"caption":""},"hashtags":[""],"cta":""}`;
  const result = await env.AI.run('@cf/zai-org/glm-4.7-flash', {
    messages: [
      { role: 'system', content: 'Return only valid JSON. Write polished Korean suitable for a local optical-shop Naver blog.' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.4,
    max_completion_tokens: 2200
  });
  const text = extractAiText(result);
  return parseJsonFromModel(text) || { raw: text };
}

async function getTrendsSafe(limit) {
  try {
    const trends = await fetchGoogleTrends(limit);
    return { live: true, trends, error: null };
  } catch (error) {
    return {
      live: false,
      trends: FALLBACK_TRENDS.map((keyword, index) => ({ rank: index + 1, keyword, traffic: null, published_at: null, source: 'fallback' })),
      error: error?.message || String(error)
    };
  }
}

function pickDraftTopic(trends) {
  const analysis = analyzeTopics(trends);
  if (analysis.accepted.length) return { ...analysis.accepted[0], trend_mode: 'live_relevant' };
  return fallbackTopic();
}

function dashboard() {
  return html(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>P3 Blog Engine</title><style>body{font-family:system-ui,sans-serif;max-width:780px;margin:0 auto;padding:28px;background:#f6f7f9;color:#111}section{background:#fff;border-radius:18px;padding:20px;margin:14px 0;box-shadow:0 6px 24px #0000000d}code{background:#f1f3f5;padding:3px 7px;border-radius:7px}.ok{font-weight:700}</style></head><body><h1>P3 블로그 자동제작 엔진</h1><p>실시간 트렌드 → 관련성 품질게이트 → AI 글·사진 위치·30초 영상 구성.</p><section><div class="ok">엔진 ${BLOG_ENGINE_VERSION}</div><p>매장: ${STORE_PROFILE.name}</p><p>실시간 검색어 최소 관련성 점수: ${MIN_TREND_SCORE}</p><p>외부 이미지 정책: ${MEDIA_POLICY.externalImages}</p></section><section><h2>API</h2><p><code>GET /health</code></p><p><code>GET /api/trends</code></p><p><code>GET /api/topics</code></p><p><code>POST /api/draft</code></p></section><section><h2>원칙</h2><p>실시간 인기 검색어라도 안경원과 연결 근거가 없으면 자동 탈락합니다. 연결 가능한 검색어가 없으면 실시간이라고 속이지 않고 검증된 안경 주제로 대체합니다.</p></section></body></html>`);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: JSON_HEADERS });
    if (request.method === 'GET' && url.pathname === '/') return dashboard();

    if (request.method === 'GET' && url.pathname === '/health') {
      return json({
        ok: true,
        service: 'p3-blog-engine',
        version: BLOG_ENGINE_VERSION,
        ai_bound: Boolean(env?.AI),
        live_trend_source: 'Google Trends KR RSS',
        trend_quality_gate: { min_score: MIN_TREND_SCORE },
        media_policy: MEDIA_POLICY
      });
    }

    if (request.method === 'GET' && url.pathname === '/api/trends') {
      const result = await getTrendsSafe(url.searchParams.get('limit') || 30);
      return json(result);
    }

    if (request.method === 'GET' && url.pathname === '/api/topics') {
      const result = await getTrendsSafe(url.searchParams.get('limit') || 30);
      const analysis = analyzeTopics(result.trends);
      return json({
        live: result.live,
        source_error: result.error,
        min_relevance_score: MIN_TREND_SCORE,
        accepted_count: analysis.accepted.length,
        topics: analysis.accepted.slice(0, 10),
        rejected_preview: analysis.rejected.slice(0, 5).map(item => ({ keyword: item.keyword, relevance_score: item.relevance_score, reason: item.reasons[0] })),
        fallback_suggestions: analysis.accepted.length ? [] : EVERGREEN_TOPICS.slice(0, 3)
      });
    }

    if (request.method === 'POST' && url.pathname === '/api/draft') {
      let body = {};
      try { body = await request.json(); } catch {}

      let topic = body.topic;
      if (!topic?.keyword) {
        const result = await getTrendsSafe(30);
        topic = pickDraftTopic(result.trends);
      } else {
        const quality = scoreTrend(topic.keyword);
        topic = {
          ...topic,
          relevance_score: quality.score,
          eligible: quality.eligible,
          reasons: quality.reasons,
          blog_bridge: topic.blog_bridge || chooseBridge(topic.keyword),
          suggested_title: topic.suggested_title || `${topic.keyword}, 안경 선택과 연결해서 꼭 확인할 것은?`,
          trend_mode: topic.trend_mode || (quality.eligible ? 'manual_relevant' : 'manual_topic')
        };
      }

      const aiDraft = await buildAiDraft(env, topic);
      return json({
        ok: true,
        topic,
        draft: aiDraft || buildTemplateDraft(topic),
        ai_used: Boolean(aiDraft),
        media_policy: MEDIA_POLICY
      });
    }

    return json({ ok: false, error: 'not_found' }, 404);
  }
};
