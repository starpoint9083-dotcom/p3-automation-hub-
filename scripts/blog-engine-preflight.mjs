import fs from 'node:fs';

const required = ['src/blog-engine.js','src/blog-engine-v033.js','src/blog-engine-config.js','wrangler.blog-engine.jsonc'];
for (const file of required) {
  if (!fs.existsSync(file)) throw new Error(`missing:${file}`);
}

const source = fs.readFileSync('src/blog-engine-v033.js','utf8');
for (const marker of [
  '/api/draft','WRITER_MODEL','buildSafePlan','safeIntro','BAD_PATTERNS','BAD_FOREIGN',
  'VOICE_RULES','AIISH','stella-v13b-starpoint','text_quality_gate_passed',
  'distinct_repairs','max_section_similarity','Promise.all','section_attempts'
]) {
  if (!source.includes(marker)) throw new Error(`missing_v033_marker:${marker}`);
}
if (!source.includes("const WRITER_MODEL='@cf/meta/llama-3.3-70b-instruct-fp8-fast'")) throw new Error('missing_writer_model');
if (!source.includes('max_tokens:760')) throw new Error('writer_token_budget_missing');
if (!source.includes('maxSim>=0.62')) throw new Error('distinctness_gate_missing');
if (!source.includes("const QUALITY_GATE='v0.3.3-starpoint-v13b-voice'")) throw new Error('voice_quality_gate_missing');

const config = fs.readFileSync('src/blog-engine-config.js','utf8');
if (!config.includes("BLOG_ENGINE_VERSION = '0.3.3'")) throw new Error('wrong_blog_engine_version');

const wrangler = fs.readFileSync('wrangler.blog-engine.jsonc','utf8');
if (!wrangler.includes('"name": "p3-blog-engine"')) throw new Error('wrong_worker_name');
if (!wrangler.includes('"main": "src/blog-engine-v033.js"')) throw new Error('wrong_worker_entry');
if (!wrangler.includes('"binding": "AI"')) throw new Error('workers_ai_binding_missing');

console.log('BLOG_ENGINE_V033_PREFLIGHT_OK');