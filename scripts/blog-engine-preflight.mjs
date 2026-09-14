import fs from 'node:fs';

const required = ['src/blog-engine.js','src/blog-engine-v034.js','src/blog-engine-v0343.js','src/blog-engine-config.js','wrangler.blog-engine.jsonc'];
for (const file of required) {
  if (!fs.existsSync(file)) throw new Error(`missing:${file}`);
}

const baseSource = fs.readFileSync('src/blog-engine-v034.js','utf8');
for (const marker of [
  '/api/draft','WRITER_MODEL','buildSafePlan','safeIntro','BAD_PATTERNS','BAD_FOREIGN',
  'VOICE_RULES','AIISH','RIGID','FRIENDLY_GLOBAL','friendlyCount','friendly_ending_count',
  'stella-v13b-starpoint-friendly-60-40','text_quality_gate_passed',
  'distinct_repairs','max_section_similarity','Promise.all','section_attempts'
]) {
  if (!baseSource.includes(marker)) throw new Error(`missing_v0342_marker:${marker}`);
}
if (!baseSource.includes("const WRITER_MODEL='@cf/meta/llama-3.3-70b-instruct-fp8-fast'")) throw new Error('missing_writer_model');
if (!baseSource.includes('max_tokens:760')) throw new Error('writer_token_budget_missing');
if (!baseSource.includes('maxSim>=0.62')) throw new Error('distinctness_gate_missing');
if (!baseSource.includes("const QUALITY_GATE='v0.3.4.2-starpoint-natural-friendly'")) throw new Error('base_voice_quality_gate_missing');
if (baseSource.includes("return 'friendly_tone_missing'")) throw new Error('per_section_friendly_requirement_still_present');

const source = fs.readFileSync('src/blog-engine-v0343.js','utf8');
for (const marker of [
  "const QUALITY_GATE='v0.3.4.3-friendly-leads'",
  'addFriendlyLead','applyFriendlyLeads','friendly_lead_layer',
  '처음에는 제품보다 언제 불편한지부터 보는 게 쉬워요.',
  '좋은 기능도 한계까지 같이 봐야 선택이 편해요.',
  '결국 내 생활에 맞는지가 가장 먼저 볼 기준이에요.',
  '마지막은 지금 쓰는 안경의 불편 원인부터 확인하면 돼요.'
]) {
  if (!source.includes(marker)) throw new Error(`missing_v0343_marker:${marker}`);
}

const config = fs.readFileSync('src/blog-engine-config.js','utf8');
if (!config.includes("BLOG_ENGINE_VERSION = '0.3.4.3'")) throw new Error('wrong_blog_engine_version');

const wrangler = fs.readFileSync('wrangler.blog-engine.jsonc','utf8');
if (!wrangler.includes('"name": "p3-blog-engine"')) throw new Error('wrong_worker_name');
if (!wrangler.includes('"main": "src/blog-engine-v0343.js"')) throw new Error('wrong_worker_entry');
if (!wrangler.includes('"binding": "AI"')) throw new Error('workers_ai_binding_missing');

console.log('BLOG_ENGINE_V0343_PREFLIGHT_OK');
