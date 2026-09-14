import fs from 'node:fs';

const required = ['src/blog-engine.js','src/blog-engine-config.js','wrangler.blog-engine.jsonc'];
for (const file of required) {
  if (!fs.existsSync(file)) throw new Error(`missing:${file}`);
}
const source = fs.readFileSync('src/blog-engine.js','utf8');
for (const route of ['/health','/api/trends','/api/topics','/api/draft']) {
  if (!source.includes(route)) throw new Error(`missing_route:${route}`);
}
const wrangler = fs.readFileSync('wrangler.blog-engine.jsonc','utf8');
if (!wrangler.includes('"name": "p3-blog-engine"')) throw new Error('wrong_worker_name');
if (!wrangler.includes('"main": "src/blog-engine.js"')) throw new Error('wrong_worker_entry');
console.log('BLOG_ENGINE_PREFLIGHT_OK');
