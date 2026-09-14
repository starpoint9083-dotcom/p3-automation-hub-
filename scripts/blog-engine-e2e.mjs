const base = String(process.env.BLOG_ENGINE_URL || '').replace(/\/$/, '');
if (!base) throw new Error('BLOG_ENGINE_URL missing');

const sleep = ms => new Promise(r => setTimeout(r, ms));

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

const health = await requestJson('/health');
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
if (!draft.ai_used) throw new Error(`ai_draft_not_used:${draft.error || draft.generation_error || 'unknown'}`);
if (!draft.structured_output) throw new Error('structured_output_false');
if (draft.draft.mode !== 'ai-structured-multistage') throw new Error(`wrong_generation_mode:${draft.draft.mode}`);
if (typeof draft.draft.title !== 'string' || draft.draft.title.length < 8) throw new Error('title_invalid');
if (typeof draft.draft.intro !== 'string' || draft.draft.intro.length < 40) throw new Error('intro_invalid');
if (!Array.isArray(draft.draft.sections) || draft.draft.sections.length !== 4) throw new Error('section_count_invalid');
for (const [index, section] of draft.draft.sections.entries()) {
  if (!section.heading || typeof section.body !== 'string' || section.body.length < 100) {
    throw new Error(`section_${index + 1}_invalid_len_${section?.body?.length || 0}`);
  }
}
if (!Array.isArray(draft.draft.photo_slots) || draft.draft.photo_slots.length < 4) throw new Error('photo_slots_invalid');
if (!draft.draft.video_plan || !Array.isArray(draft.draft.video_plan.shots) || draft.draft.video_plan.shots.length < 3) throw new Error('video_plan_invalid');
if (!Array.isArray(draft.draft.hashtags) || draft.draft.hashtags.length < 4) throw new Error('hashtags_invalid');
if (typeof draft.draft.cta !== 'string' || draft.draft.cta.length < 15) throw new Error('cta_invalid');

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
  live_trends: trends.live,
  accepted_topics: topics.accepted_count,
  selected_topic: draft.topic.keyword,
  trend_mode: draft.topic.trend_mode,
  ai_used: draft.ai_used,
  structured_output: draft.structured_output,
  preview
}, null, 2));