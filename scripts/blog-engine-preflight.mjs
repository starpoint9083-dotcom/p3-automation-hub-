import fs from 'node:fs';

const required = ['src/blog-engine.js','src/blog-engine-v03.js','src/blog-engine-config.js','wrangler.blog-engine.jsonc'];
for (const file of required) {
  if (!fs.existsSync(file)) throw new Error(`missing:${file}`);
}

const source = fs.readFileSync('src/blog-engine-v03.js','utf8');
for (const marker of [
  '/api/draft','response_format','json_schema','PLAN_MODEL','WRITER_MODEL',
  'section_plans','BAD_PATTERNS','BAD_FOREIGN','text_quality_gate_passed',
  'max_section_similarity','distinct_repairs','Promise.all','section_attempts'
]) {
  if (!source.includes(marker)) throw new Error(`missing_v031_marker:${marker}`);
}
if (!source.includes("const PLAN_MODEL='@cf/meta/llama-3.3-70b-instruct-fp8-fast'")) throw new Error('missing_structured_plan_model');
if (!source.includes("const WRITER_MODEL='@cf/meta/llama-3.3-70b-instruct-fp8-fast'")) throw new Error('missing_writer_model');
if (!source.includes('max_tokens:750')) throw new Error('writer_token_budget_missing');
if (!source.includes('maxSimilarity(d.sections)<0.62')) throw new Error('distinctness_gate_missing');

const config = fs.readFileSync('src/blog-engine-config.js','utf8');
if (!config.includes("BLOG_ENGINE_VERSION = '0.3.1'")) throw new Error('wrong_blog_engine_version');

const wrangler = fs.readFileSync('wrangler.blog-engine.jsonc','utf8');
if (!wrangler.includes('"name": "p3-blog-engine"')) throw new Error('wrong_worker_name');
if (!wrangler.includes('"main": "src/blog-engine-v03.js"')) throw new Error('wrong_worker_entry');
if (!wrangler.includes('"binding": "AI"')) throw new Error('workers_ai_binding_missing');

console.log('BLOG_ENGINE_V031_PREFLIGHT_OK');
