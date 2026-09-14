const base = String(process.env.BLOG_ENGINE_URL || '').replace(/\/$/, '');
if (!base) throw new Error('BLOG_ENGINE_URL missing');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const EXPECTED_VERSION='0.3.4.3';
const EXPECTED_GATE='v0.3.4.3-friendly-leads';
const EXPECTED_VOICE='stella-v13b-starpoint-friendly-60-40';
const EXPECTED_RETRY_LIMIT=3;
const EXPECTED_LEADS=[
  '처음에는 제품보다 언제 불편한지부터 보는 게 쉬워요.',
  '좋은 기능도 한계까지 같이 봐야 선택이 편해요.',
  '결국 내 생활에 맞는지가 가장 먼저 볼 기준이에요.',
  '마지막은 지금 쓰는 안경의 불편 원인부터 확인하면 돼요.'
];
const BAD_FOREIGN=/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/u;
const BAD_PATTERNS=[
  /가을[^.!?]{0,35}자외선[^.!?]{0,25}(강해|강하|증가|높아)/u,
  /자외선[^.!?]{0,25}(강해지|증가하|더\s*강)/u,
  /(아침|저녁)[^.!?]{0,30}자외선[^.!?]{0,20}(강|높)/u,
  /일조량[^.!?]{0,20}(증가|늘어)/u,
  /시야[^.!?]{0,20}(개선|향상|더\s*좋)/u,
  /(눈|안구)[^.!?]{0,20}(피로|건강)[^.!?]{0,20}(개선|감소|유지|치료)/u,
  /창가[^.!?]{0,45}변색렌즈[^.!?]{0,30}(잘|효과)/u,
  /(더\s*좋은\s*효과|효과적으로|큰\s*도움이\s*될\s*수|전문적인\s*상담이\s*필요|왜\s*그런지\s*이유를\s*보세요)/u,
  /(100%|완벽하게|완전히\s*(차단|해결)|걱정\s*끝|필수\s*아이템)/u
];
const AIISH=['중요합니다','추천드립니다','최적의 선택','전문가와 상담','적합한 렌즈를 선택','도움이 될 수 있습니다','선택하는 것이 중요해요','전문적인 상담이 필요해요','큰 도움이 될 수 있어요'];
const RIGID=['고객은','고객들은','선택해야 합니다','확인해야 합니다','이러한 이유로','왜냐하면','따라서'];
const FRIENDLY_GLOBAL=/(해요|돼요|예요|이에요|거든요|있어요|없어요|않아요|맞아요|달라요|보세요|보셔야 해요|볼 수 있어요)\./gu;

function safeText(label, value, min = 1) {
  if (typeof value !== 'string' || value.trim().length < min) throw new Error(`${label}_invalid`);
  if (BAD_FOREIGN.test(value)) throw new Error(`${label}_foreign_cjk`);
  for (const re of BAD_PATTERNS) if (re.test(value)) throw new Error(`${label}_unsafe_or_awkward_claim`);
  const styleHits=AIISH.reduce((n,p)=>n+(value.split(p).length-1),0);
  if (styleHits>1) throw new Error(`${label}_ai_style_repetition`);
  if (min>=120) {
    const rigidHits=RIGID.reduce((n,p)=>n+(value.split(p).length-1),0);
    if (rigidHits>1) throw new Error(`${label}_too_formal`);
    const friendlyHits=(value.match(FRIENDLY_GLOBAL)||[]).length;
    if (friendlyHits>4) throw new Error(`${label}_too_chatty`);
  }
}
function words(s) {
  return new Set(String(s || '').toLowerCase().replace(/[^0-9a-z가-힣\s]/g, ' ').split(/\s+/).filter(w => w.length >= 2));
}
function similarity(a, b) {
  const A = words(a), B = words(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter += 1;
  return inter / (A.size + B.size - inter);
}

async function requestJson(path, options = {}) {
  const { retries = 8, timeoutMs = 45000, ...fetchOptions } = options;
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${base}${path}`, {
        ...fetchOptions,
        signal: controller.signal,
        headers: { 'cache-control': 'no-cache', 'content-type': 'application/json', ...(fetchOptions.headers || {}) }
      });
      const text = await response.text();
      let data;
      try { data = JSON.parse(text); } catch { throw new Error(`${path}:invalid_json:${text.slice(0, 300)}`); }
      if (!response.ok) throw new Error(`${path}:http_${response.status}:${data?.error || 'unknown'}`);
      return data;
    } catch (error) {
      lastError = error;
      if (attempt < retries) await sleep(attempt * 3000);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

async function waitForExpectedHealth() {
  let last;
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    last = await requestJson('/health', { retries: 1, timeoutMs: 15000 });
    if (last.ok && last.service === 'p3-blog-engine' && last.ai_bound && last.version === EXPECTED_VERSION && last.text_quality_gate === EXPECTED_GATE && last.voice_profile === EXPECTED_VOICE && last.friendly_lead_layer === true && last.full_draft_retry_limit === EXPECTED_RETRY_LIMIT) return last;
    if (attempt < 12) await sleep(3000);
  }
  throw new Error(`live_health_not_propagated:version_${last?.version || 'missing'}:gate_${last?.text_quality_gate || 'missing'}:voice_${last?.voice_profile || 'missing'}:retry_${last?.full_draft_retry_limit || 'missing'}`);
}

const health = await waitForExpectedHealth();
const trends = await requestJson('/api/trends?limit=10');
if (!Array.isArray(trends.trends) || trends.trends.length < 1) throw new Error('trends_invalid');
const topics = await requestJson('/api/topics?limit=30');
if (!Array.isArray(topics.topics) || !Array.isArray(topics.fallback_suggestions)) throw new Error('topics_invalid');
for (const topic of topics.topics) if (topic.relevance_score < topics.min_relevance_score) throw new Error(`quality_gate_failed:${topic.keyword}`);

const draft = await requestJson('/api/draft', { method: 'POST', body: '{}', retries: 1, timeoutMs: 300000 });
if (!draft.ok || !draft.topic?.keyword || !draft.draft) throw new Error('draft_invalid');
if (!draft.ai_used || !draft.structured_output || !draft.text_quality_gate_passed) throw new Error('generation_flags_invalid');
if (draft.draft.mode !== 'ai-split-writing-starpoint-friendly-v13b') throw new Error(`wrong_generation_mode:${draft.draft.mode}`);
if (draft.draft.generation_meta?.quality_gate !== EXPECTED_GATE) throw new Error('wrong_quality_gate');
if (draft.draft.generation_meta?.voice_profile !== EXPECTED_VOICE) throw new Error('wrong_voice_profile');
if (draft.draft.generation_meta?.friendly_lead_layer !== true) throw new Error('friendly_lead_layer_missing');
const fullDraftAttempts=draft.draft.generation_meta?.full_draft_attempts;
if (!Number.isInteger(fullDraftAttempts) || fullDraftAttempts < 1 || fullDraftAttempts > EXPECTED_RETRY_LIMIT) throw new Error('full_draft_attempts_invalid');
if (!Number.isInteger(draft.draft.generation_meta?.friendly_ending_count) || draft.draft.generation_meta.friendly_ending_count < 0) throw new Error('friendly_count_invalid');

safeText('title', draft.draft.title, 8);
safeText('intro', draft.draft.intro, 40);
if (!Array.isArray(draft.draft.sections) || draft.draft.sections.length !== 4) throw new Error('section_count_invalid');
for (const [index, section] of draft.draft.sections.entries()) {
  safeText(`section_${index + 1}_heading`, section.heading, 4);
  safeText(`section_${index + 1}_body`, section.body, 120);
  if (!section.body.startsWith(EXPECTED_LEADS[index])) throw new Error(`section_${index + 1}_friendly_lead_missing`);
}
for (let i = 0; i < draft.draft.sections.length; i += 1) {
  for (let j = 0; j < i; j += 1) {
    const sim = similarity(draft.draft.sections[i].body, draft.draft.sections[j].body);
    if (sim >= 0.62) throw new Error(`section_similarity_${j + 1}_${i + 1}_${sim.toFixed(3)}`);
  }
}
if (!Array.isArray(draft.draft.photo_slots) || draft.draft.photo_slots.length < 4) throw new Error('photo_slots_invalid');
if (!draft.draft.video_plan || !Array.isArray(draft.draft.video_plan.shots) || draft.draft.video_plan.shots.length < 3) throw new Error('video_plan_invalid');
safeText('video_hook', draft.draft.video_plan.hook, 8);
safeText('video_caption', draft.draft.video_plan.caption, 4);
if (!Array.isArray(draft.draft.hashtags) || draft.draft.hashtags.length < 4) throw new Error('hashtags_invalid');
safeText('cta', draft.draft.cta, 15);

console.log(JSON.stringify({
  ok: true,
  url: base,
  version: health.version,
  quality_gate: health.text_quality_gate,
  voice_profile: health.voice_profile,
  friendly_lead_layer: health.friendly_lead_layer,
  full_draft_retry_limit: health.full_draft_retry_limit,
  full_draft_attempts: fullDraftAttempts,
  live_trends: trends.live,
  accepted_topics: topics.accepted_count,
  selected_topic: draft.topic.keyword,
  trend_mode: draft.topic.trend_mode,
  ai_used: draft.ai_used,
  structured_output: draft.structured_output,
  text_quality_gate_passed: draft.text_quality_gate_passed,
  preview: {
    title: draft.draft.title,
    intro: draft.draft.intro,
    sections: draft.draft.sections,
    photo_slots: draft.draft.photo_slots,
    video_plan: draft.draft.video_plan,
    hashtags: draft.draft.hashtags,
    cta: draft.draft.cta,
    generation_meta: draft.draft.generation_meta || null
  }
}, null, 2));
