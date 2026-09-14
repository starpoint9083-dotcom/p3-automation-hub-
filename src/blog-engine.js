import { BLOG_ENGINE_VERSION, STORE_PROFILE, CORE_KEYWORDS, MEDIA_POLICY } from './blog-engine-config.js';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'access-control-allow-origin': '*'
};

const MIN_TREND_SCORE = 18;
const ARTICLE_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const FALLBACK_TRENDS = ['자외선', '여행', '운전', '개학', '선글라스', '컴퓨터'];
const EVERGREEN_TOPICS = [
  { keyword: '가을 자외선', blog_bridge: '변색렌즈와 눈부심 관리', suggested_title: '가을에도 자외선은 남습니다, 변색렌즈를 고를 때 볼 것', source: 'optical_fallback' },
  { keyword: '40대 노안', blog_bridge: '누진다초점 적응과 정밀 시력검사', suggested_title: '40대부터 가까운 글씨가 불편하다면, 누진다초점 전에 확인할 것', source: 'optical_fallback' },
  { keyword: '야간운전 눈부심', blog_bridge: '운전할 때 편한 렌즈와 눈부심 관리', suggested_title: '야간운전 눈부심이 불편할 때 안경에서 먼저 확인할 것', source: 'optical_fallback' },
  { keyword: '컴퓨터 눈 피로', blog_bridge: '사무용 안경과 디지털 눈 피로', suggested_title: '컴퓨터를 오래 보는 직장인, 사무용 안경은 무엇이 다를까?', source: 'optical_fallback' },
  { keyword: '학생 근시', blog_bridge: '학생 시력과 근시 관리', suggested_title: '개학 후 칠판이 흐리다면, 학생 시력검사에서 확인할 것', source: 'optical_fallback' }
];

const ARTICLE_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    intro: { type: 'string' },
    sections: {
      type: 'array',
      minItems: 4,
      maxItems: 6,
      items: {
        type: 'object',
        properties: {
          heading: { type: 'string' },
          body: { type: 'string' },
          photo_after: { type: 'boolean' }
        },
        required: ['heading', 'body', 'photo_after'],
        additionalProperties: false
      }
    },
    closing: { type: 'string' },
    hashtags: {
      type: 'array',
      minItems: 4,
      maxItems: 12,
      items: { type: 'string' }
    },
    fact_cautions: {
      type: 'array',
      minItems: 1,
      maxItems: 5,
      items: { type: 'string' }
    }
  },
  required: ['title', 'intro', 'sections', 'closing', 'hashtags', 'fact_cautions'],
  additionalProperties: false
};

const MEDIA_SCHEMA = {
  type: 'object',
  properties: {
    photo_slots: {
      type: 'array',
      minItems: 4,
      maxItems: 6,
      items: {
        type: 'object',
        properties: {
          position: { type: 'string' },
          description: { type: 'string' },
          source_preference: { type: 'string', enum: ['owned', 'licensed', 'ai'] },
          search_query: { type: 'string' }
        },
        required: ['position', 'description', 'source_preference', 'search_query'],
        additionalProperties: false
      }
    },
    video_plan: {
      type: 'object',
      properties: {
        hook: { type: 'string' },
        shots: { type: 'array', minItems: 3, maxItems: 7, items: { type: 'string' } },
        duration_sec: { type: 'integer', minimum: 20, maximum: 45 },
        caption: { type: 'string' }
      },
      required: ['hook', 'shots', 'duration_sec', 'caption'],
      additionalProperties: false
    }
  },
  required: ['photo_slots', 'video_plan'],
  additionalProperties: false
};

const SAFE_FACT_CONTEXT = [
  '자외선 강도는 계절·시간·날씨·환경에 따라 달라지므로 가을이 여름보다 더 강하다고 단정하지 않는다.',
  '일반적인 UV 반응형 변색렌즈는 자외선을 많이 차단하는 자동차 유리 안에서는 착색이 제한될 수 있으며 제품별 특성이 다르다.',
  '블루라이트 차단 기능이 눈 질환 예방이나 피로 개선을 보장한다고 단정하지 않는다.',
  '시력·근시·노안 관련 내용은 진단이나 치료를 대신하지 않으며 정확한 검사와 개인별 상담이 중요하다.'
].join('\n- ');

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
    headers: { 'user-agent': `P3-Blog-Engine/${BLOG_ENGINE_VERSION} (+https://workers.dev)` }
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
  return {
    mode: 'template',
    title: topic.suggested_title,
    intro: `오늘은 ${keyword}와 관련해 실제 안경 선택에서 확인할 점을 정리합니다.`,
    sections: [
      { heading: `${keyword}, 어떤 상황에서 불편해질까?`, body: '생활 속 불편 상황과 사용 환경부터 확인합니다.', photo_after: true },
      { heading: '안경 선택과 연결되는 지점', body: `${bridge}를 중심으로 거리·조명·운전·업무·야외활동 여부를 함께 봅니다.`, photo_after: true },
      { heading: '제품보다 먼저 확인할 것', body: '정확한 시력검사와 기존 안경의 불편 원인을 확인한 뒤 필요한 기능을 고릅니다.', photo_after: true },
      { heading: '스타포인트안경원에서는', body: '정밀검사 후 생활 패턴과 적응 가능성에 맞춰 필요한 기능만 안내합니다.', photo_after: true }
    ],
    closing: '유행하는 기능보다 내 눈과 생활에 맞는지가 더 중요합니다.',
    photo_slots: [
      { position: '도입부 뒤', description: '매장 전경 또는 검사 장면', source_preference: 'owned', search_query: '' },
      { position: '2번째 섹션 뒤', description: '주제 관련 실제 안경 또는 렌즈', source_preference: 'owned', search_query: `${keyword} 안경` },
      { position: '3번째 섹션 뒤', description: '가공 또는 렌즈 디테일', source_preference: 'owned', search_query: `${bridge} 렌즈` },
      { position: '마무리 전', description: '착용 또는 상담 장면', source_preference: 'owned', search_query: '안경 상담 장면' }
    ],
    video_plan: { hook: `${keyword}, 안경 고를 때 이것부터 확인하세요`, shots: ['문제 상황', '렌즈 또는 검사 장면', '핵심 설명', '매장 상담 장면'], duration_sec: 30, caption: '정확한 시력검사, 편안한 안경' },
    hashtags: ['#스타포인트안경원', '#수영구안경원', '#광안동안경원', '#정밀시력검사'],
    fact_cautions: ['의료적 효과를 단정하지 않는다.'],
    generation: { structured: false, fallback: true }
  };
}

function parsePossibleJson(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  const text = String(value || '').trim();
  if (!text) return null;
  try { return JSON.parse(text); } catch {}
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  try { return JSON.parse(cleaned); } catch {}
  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first >= 0 && last > first) {
    try { return JSON.parse(cleaned.slice(first, last + 1)); } catch {}
  }
  return null;
}

function extractStructuredResult(result) {
  if (!result) return null;
  const candidates = [
    result.response,
    result.result?.response,
    result.choices?.[0]?.message?.parsed,
    result.choices?.[0]?.message?.content,
    result
  ];
  for (const candidate of candidates) {
    const parsed = parsePossibleJson(candidate);
    if (parsed) return parsed;
  }
  return null;
}

function validArticleCore(value) {
  return Boolean(
    value &&
    typeof value.title === 'string' && value.title.trim() &&
    typeof value.intro === 'string' && value.intro.trim() &&
    Array.isArray(value.sections) && value.sections.length >= 4 &&
    value.sections.every(section => typeof section?.heading === 'string' && section.heading.trim() && typeof section?.body === 'string' && section.body.trim()) &&
    typeof value.closing === 'string' && value.closing.trim() &&
    Array.isArray(value.hashtags) && value.hashtags.length >= 4
  );
}

function validMediaPlan(value) {
  return Boolean(
    value && Array.isArray(value.photo_slots) && value.photo_slots.length >= 4 &&
    value.video_plan && typeof value.video_plan.hook === 'string' &&
    Array.isArray(value.video_plan.shots) && value.video_plan.shots.length >= 3
  );
}

async function runStructured(env, { schema, system, prompt, maxTokens, validate, label }) {
  let lastError = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const result = await env.AI.run(ARTICLE_MODEL, {
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: attempt === 1 ? prompt : `${prompt}\n\n이전 출력이 구조 검사를 통과하지 못했습니다. JSON Schema를 정확히 지키고, 모든 필드를 끝까지 완성하세요.` }
        ],
        response_format: {
          type: 'json_schema',
          json_schema: schema
        },
        temperature: attempt === 1 ? 0.35 : 0.2,
        max_completion_tokens: maxTokens
      });
      const parsed = extractStructuredResult(result);
      if (validate(parsed)) return { value: parsed, attempts: attempt };
      lastError = new Error(`${label}_validation_failed`);
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`${label}_failed:${lastError?.message || 'unknown'}`);
}

async function buildAiDraft(env, topic) {
  if (!env?.AI || typeof env.AI.run !== 'function') return null;
  const trending = topic.trend_mode !== 'evergreen_fallback';
  const common = `매장: 부산 수영구 광안동 스타포인트안경원\n주제: ${topic.keyword}\n안경원 연결: ${topic.blog_bridge}\n실시간 트렌드 채택: ${trending ? 'YES' : 'NO - 억지 연결을 피한 대체 주제'}\n매장 원칙: 정확한 시력검사, 편안한 안경. 제품을 무조건 권하기보다 누구에게 왜 필요한지와 한계를 함께 설명한다.\n안전한 사실 기준:\n- ${SAFE_FACT_CONTEXT}`;

  const articlePrompt = `${common}\n\n네이버 블로그용 본문을 작성한다.\n문체: 실제 안경원 원장이 고객에게 설명하듯 차분하고 구체적으로. 과장 광고 문구, 공포 표현, '필수 아이템', '걱정 끝' 같은 상투적 표현을 피한다.\n구성: 제목 1개, 짧은 도입, 4~6개 섹션, 마무리, 해시태그 4~12개. 각 섹션 body는 180~330자 정도로 충분히 설명하되 불필요하게 길게 늘이지 않는다.\n검색어는 자연스럽게만 사용하고 의료적 진단·치료 효과를 단정하지 않는다. 불확실한 수치나 계절 비교를 지어내지 않는다. 변색렌즈를 다루면 자동차 안에서의 착색 한계와 제품별 차이를 자연스럽게 언급한다. fact_cautions에는 게시 전 다시 확인할 사실 또는 표현을 적는다.`;

  const mediaPrompt = `${common}\n\n위 주제에 맞는 사진 배치와 30초 세로영상 구성을 만든다. 사진은 4~6곳. 사용자 소유 매장/제품 사진을 우선하고, 외부 이미지는 라이선스 확인 또는 링크만 사용하며 무단 재업로드를 지시하지 않는다. source_preference는 owned, licensed, ai 중 하나만 사용한다. 영상은 20~45초이며 실제 매장 사진·검사·제품 디테일로 만들 수 있는 현실적인 장면을 제안한다.`;

  try {
    const article = await runStructured(env, {
      schema: ARTICLE_SCHEMA,
      system: '너는 한국의 전문 안경원 네이버 블로그 편집장이다. 반드시 제공된 JSON Schema에 맞는 완전한 구조화 결과를 반환한다.',
      prompt: articlePrompt,
      maxTokens: 3600,
      validate: validArticleCore,
      label: 'article'
    });
    const media = await runStructured(env, {
      schema: MEDIA_SCHEMA,
      system: '너는 로컬 매장 콘텐츠의 사진·숏폼 제작 편집자다. 반드시 제공된 JSON Schema에 맞는 완전한 구조화 결과를 반환한다.',
      prompt: mediaPrompt,
      maxTokens: 1400,
      validate: validMediaPlan,
      label: 'media'
    });
    return {
      mode: 'ai_structured_v03',
      ...article.value,
      ...media.value,
      generation: {
        structured: true,
        model: ARTICLE_MODEL,
        stages: 2,
        article_attempts: article.attempts,
        media_attempts: media.attempts
      }
    };
  } catch (error) {
    console.error('blog_ai_generation_failed', error?.message || String(error));
    return null;
  }
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
  return html(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>P3 Blog Engine</title><style>body{font-family:system-ui,sans-serif;max-width:780px;margin:0 auto;padding:28px;background:#f6f7f9;color:#111}section{background:#fff;border-radius:18px;padding:20px;margin:14px 0;box-shadow:0 6px 24px #0000000d}code{background:#f1f3f5;padding:3px 7px;border-radius:7px}.ok{font-weight:700}</style></head><body><h1>P3 블로그 자동제작 엔진</h1><p>실시간 트렌드 → 관련성 품질게이트 → 2단계 구조화 AI 글·사진 위치·30초 영상 구성.</p><section><div class="ok">엔진 ${BLOG_ENGINE_VERSION}</div><p>매장: ${STORE_PROFILE.name}</p><p>실시간 검색어 최소 관련성 점수: ${MIN_TREND_SCORE}</p><p>AI 출력: JSON Schema 구조화 + 단계별 자동 재시도</p><p>외부 이미지 정책: ${MEDIA_POLICY.externalImages}</p></section><section><h2>API</h2><p><code>GET /health</code></p><p><code>GET /api/trends</code></p><p><code>GET /api/topics</code></p><p><code>POST /api/draft</code></p></section><section><h2>원칙</h2><p>실시간 인기 검색어라도 안경원과 연결 근거가 없으면 자동 탈락합니다. 연결 가능한 검색어가 없으면 실시간이라고 속이지 않고 검증된 안경 주제로 대체합니다.</p></section></body></html>`);
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
        ai_model: ARTICLE_MODEL,
        structured_generation: true,
        live_trend_source: 'Google Trends KR RSS',
        trend_quality_gate: { min_score: MIN_TREND_SCORE },
        media_policy: MEDIA_POLICY
      });
    }

    if (request.method === 'GET' && url.pathname === '/api/trends') {
      return json(await getTrendsSafe(url.searchParams.get('limit') || 30));
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
      const draft = aiDraft || buildTemplateDraft(topic);
      return json({
        ok: true,
        topic,
        draft,
        ai_used: Boolean(aiDraft),
        structured_output: Boolean(aiDraft?.generation?.structured),
        media_policy: MEDIA_POLICY
      });
    }

    return json({ ok: false, error: 'not_found' }, 404);
  }
};
