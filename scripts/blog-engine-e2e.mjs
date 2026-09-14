const base = String(process.env.BLOG_ENGINE_URL || '').replace(/\/$/, '');
if (!base) throw new Error('BLOG_ENGINE_URL missing');

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getJson(path) {
  let lastError;
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    try {
      const response = await fetch(`${base}${path}`, { headers: { 'cache-control': 'no-cache' } });
      if (!response.ok) throw new Error(`${path}:http_${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < 8) await sleep(attempt * 3000);
    }
  }
  throw lastError;
}

const health = await getJson('/health');
if (!health.ok || health.service !== 'p3-blog-engine') throw new Error('health_invalid');
const trends = await getJson('/api/trends?limit=5');
if (!Array.isArray(trends.trends) || trends.trends.length < 1) throw new Error('trends_invalid');
const topics = await getJson('/api/topics?limit=10');
if (!Array.isArray(topics.topics) || topics.topics.length < 1) throw new Error('topics_invalid');
console.log(JSON.stringify({ ok: true, url: base, live_trends: trends.live, first_topic: topics.topics[0]?.keyword || null }, null, 2));
