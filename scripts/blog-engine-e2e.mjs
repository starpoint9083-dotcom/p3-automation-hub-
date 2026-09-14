const base = String(process.env.BLOG_ENGINE_URL || '').replace(/\/$/, '');
if (!base) throw new Error('BLOG_ENGINE_URL missing');

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function requestJson(path, options = {}) {
  let lastError;
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    try {
      const response = await fetch(`${base}${path}`, {
        ...options,
        headers: { 'cache-control': 'no-cache', 'content-type': 'application/json', ...(options.headers || {}) }
      });
      if (!response.ok) throw new Error(`${path}:http_${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < 8) await sleep(attempt * 3000);
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

const draft = await requestJson('/api/draft', { method: 'POST', body: '{}' });
if (!draft.ok || !draft.topic?.keyword || !draft.draft) throw new Error('draft_invalid');
if (!draft.ai_used) throw new Error('ai_draft_not_used');

const rawText = typeof draft.draft?.raw === 'string' ? draft.draft.raw : '';
const preview = {
  title: draft.draft?.title || null,
  intro: draft.draft?.intro || draft.draft?.opening || null,
  sections: Array.isArray(draft.draft?.sections) ? draft.draft.sections.slice(0, 4) : [],
  photo_slots: Array.isArray(draft.draft?.photo_slots)
    ? draft.draft.photo_slots.slice(0, 6)
    : draft.draft?.media_plan?.owned_photo_slots || [],
  video_plan: draft.draft?.video_plan || draft.draft?.media_plan?.video_search_queries || null,
  hashtags: Array.isArray(draft.draft?.hashtags) ? draft.draft.hashtags.slice(0, 12) : [],
  cta: draft.draft?.cta || draft.draft?.closing || null,
  raw_preview: rawText ? rawText.slice(0, 12000) : null
};

console.log(JSON.stringify({
  ok: true,
  url: base,
  live_trends: trends.live,
  accepted_topics: topics.accepted_count,
  selected_topic: draft.topic.keyword,
  trend_mode: draft.topic.trend_mode,
  ai_used: draft.ai_used,
  structured_output: Boolean(preview.title || preview.sections.length),
  preview
}, null, 2));
