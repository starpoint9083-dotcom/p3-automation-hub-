const base = String(process.env.BLOG_ENGINE_URL || '').replace(/\/$/, '');
if (!base) throw new Error('BLOG_ENGINE_URL missing');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const EXPECTED_VERSION='0.3.2';
const EXPECTED_GATE='v0.3.2-safe-plan-split-writing';
const BAD_FOREIGN=/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/u;
const BAD_PATTERNS=[
  /가을[^.!?]{0,35}자외선[^.!?]{0,25}(강해|강하|증가|높아)/u,
  /자외선[^.!?]{0,25}(강해지|증가하|더\s*강)/u,
  /일조량[^.!?]{0,20}(증가|늘어)/u,
  /시야[^.!?]{0,20}(개선|향상)/u,
  /(눈|안구)[^.!?]{0,20}(피로|건강)[^.!?]{0,20}(개선|감소|유지|치료)/u,
  /(100%|완벽하게|완전히\s*(차단|해결)|걱정\s*끝|필수\s*아이템)/u
];

function safeText(label, value, min = 1) {
  if (typeof value !== 'string' || value.trim().length < min) throw new Error(`${label}_invalid`);
  if (BAD_FOREIGN.test(value)) throw new Error(`${label}_foreign_cjk`);
  for (const re of BAD_PATTERNS) if (re.test(value)) throw new Error(`${label}_unsafe_claim`);
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
    if (last.ok && last.service === 'p3-blog-engine' && last.ai_bound && last.version === EXPECTED_VERSION && last.text_quality_gate === EXPECTED_GATE) return last;
    if (attempt < 12) await sleep(3000);
  }
  throw new Error(`live_health_not_propagated:version_${last?.version || 'missing'}:gate_${last?.text_quality_gate || 'missing'}`);
}

const health = await waitForExpectedHealth();
if (!health.ok || health.service !== 'p3-blog-engine') throw new Error('health_invalid');
if (!health.ai_bound) throw new Error('workers_ai_not_bound');

const trends = await requestJson('/api/trends?limit=10');
if (!Array.isArray(trends.trends) || trends.trends.length < 1) throw new Error('trends_invalid');

const topics = await requestJson('/api/topics?limit=30');
if (!Array.isArray(topics.topics)) throw new Error('topics_invalid');
if (!Array.isArray(topics.fallback_suggestions)) throw new Error('fallback_invalid');
for (const topic of topics.topics) {
  if (topic.relevance_score < topics.min_relevance_score) throw new Error(`quality_gate_failed:${topic.keyword}`);
}

const draft = await requestJson('/api/draft', { method: 'POST', body: '{}', retries: 2, timeoutMs: 120000 });
if (!draft.ok || !draft.topic?.keyword || !draft.draft) throw new Error('draft_invalid');
if (!draft.ai_used) throw new Error(`ai_draft_not_used:${draft.error || 'unknown'}`);
if (!draft.structured_output) throw new Error('structured_output_false');
if (!draft.text_quality_gate_passed) throw new Error('text_quality_gate_false');
if (draft.draft.mode !== 'ai-split-writing-safe-plan') throw new Error(`wrong_generation_mode:${draft.draft.mode}`);
if (draft.draft.generation_meta?.quality_gate !== EXPECTED_GATE) throw new Error('wrong_quality_gate');
if (draft.draft.generation_meta?.plan_mode !== 'deterministic_safe') throw new Error('wrong_plan_mode');

safeText('title', draft.draft.title, 8);
safeText('intro', draft.draft.intro, 40);
if (!Array.isArray(draft.draft.sections) || draft.draft.sections.length !== 4) throw new Error('section_count_invalid');
for (const [index, section] of draft.draft.sections.entries()) {
  safeText(`section_${index + 1}_heading`, section.heading, 4);
  safeText(`section_${index + 1}_body`, section.body, 120);
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
if ((draft.draft.generation_meta?.max_section_similarity ?? 1) >= 0.62) throw new Error('generation_similarity_gate_failed');

const preview = {
  title: draft.draft.title,
  intro: draft.draft.intro,
  sections: draft.draft.sections,
  photo_slots: draft.draft.photo_slots,
  video_plan: draft.draft.video_plan,
  hashtags: draft.draft.hashtags,
  cta: draft.draft.cta,
  generation_meta: draft.draft.generation_meta || null
};

console.log(JSON.stringify({
  ok: true,
  url: base,
  version: health.version,
  live_trends: trends.live,
  accepted_topics: topics.accepted_count,
  selected_topic: draft.topic.keyword,
  trend_mode: draft.topic.trend_mode,
  ai_used: draft.ai_used,
  structured_output: draft.structured_output,
  text_quality_gate_passed: draft.text_quality_gate_passed,
  preview
}, null, 2));
