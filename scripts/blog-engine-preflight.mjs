import fs from 'node:fs';

const required = ['src/blog-engine.js','src/blog-engine-config.js','wrangler.blog-engine.jsonc'];
for (const file of required) {
  if (!fs.existsSync(file)) throw new Error(`missing:${file}`);
}

const source = fs.readFileSync('src/blog-engine.js','utf8');
for (const route of ['/health','/api/trends','/api/topics','/api/draft']) {
  if (!source.includes(route)) throw new Error(`missing_route:${route}`);
}
if (!source.includes('MIN_TREND_SCORE')) throw new Error('missing_trend_quality_gate');
if (!source.includes("@cf/zai-org/glm-4.7-flash")) throw new Error('missing_ai_model');

const wrangler = fs.readFileSync('wrangler.blog-engine.jsonc','utf8');
if (!wrangler.includes('"name": "p3-blog-engine"')) throw new Error('wrong_worker_name');
if (!wrangler.includes('"main": "src/blog-engine.js"')) throw new Error('wrong_worker_entry');
if (!wrangler.includes('"binding": "AI"')) throw new Error('workers_ai_binding_missing');

console.log('BLOG_ENGINE_PREFLIGHT_OK');
