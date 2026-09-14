import fs from 'node:fs';

const required = ['src/blog-engine.js','src/blog-engine-v03.js','src/blog-engine-config.js','wrangler.blog-engine.jsonc'];
for (const file of required) {
  if (!fs.existsSync(file)) throw new Error(`missing:${file}`);
}

const source = fs.readFileSync('src/blog-engine-v03.js','utf8');
for (const marker of ['/api/draft','response_format','json_schema','PLAN_MODEL','WRITER_MODEL','section_attempts']) {
  if (!source.includes(marker)) throw new Error(`missing_v03_marker:${marker}`);
}
if (!source.includes("@cf/meta/llama-3.3-70b-instruct-fp8-fast")) throw new Error('missing_structured_plan_model');
if (!source.includes("@cf/zai-org/glm-4.7-flash")) throw new Error('missing_writer_model');
if (!source.includes('for(let i=0;i<4;i++)')) throw new Error('split_section_generation_missing');

const wrangler = fs.readFileSync('wrangler.blog-engine.jsonc','utf8');
if (!wrangler.includes('"name": "p3-blog-engine"')) throw new Error('wrong_worker_name');
if (!wrangler.includes('"main": "src/blog-engine-v03.js"')) throw new Error('wrong_worker_entry');
if (!wrangler.includes('"binding": "AI"')) throw new Error('workers_ai_binding_missing');

console.log('BLOG_ENGINE_V03_PREFLIGHT_OK');