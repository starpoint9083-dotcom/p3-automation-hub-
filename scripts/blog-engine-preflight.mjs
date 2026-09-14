import fs from 'node:fs';

const required=[
  'src/blog-engine.js','src/blog-engine-v034.js','src/blog-engine-v0343.js','src/blog-engine-v035.js','src/blog-engine-app.js',
  'src/blog-engine-config.js','wrangler.blog-engine.jsonc'
];
for(const file of required) if(!fs.existsSync(file)) throw new Error(`missing:${file}`);

const baseSource=fs.readFileSync('src/blog-engine-v034.js','utf8');
for(const marker of [
  'VOICE_RULES','stella-v13b-starpoint-friendly-60-40','기본 톤은 전문성 60, 친근함 40이다.',
  '결론을 먼저 말한다.','주의할 점이나 한계를 숨기지 않는다.',
  "AIISH.some(p=>(text.split(p).length-1)>1)"
]) if(!baseSource.includes(marker)) throw new Error(`missing_stella_marker:${marker}`);
if(baseSource.includes('countPhrases(text,AIISH)>1')) throw new Error('old_aiish_gate_still_present');

const lockSource=fs.readFileSync('src/blog-engine-v0343.js','utf8');
for(const marker of ["const QUALITY_GATE='v0.3.4.3-stella-v13b'",'stella_v13b_locked:true','extra_lead_rewrite:false','FULL_DRAFT_RETRY_LIMIT=3'])
  if(!lockSource.includes(marker)) throw new Error(`missing_stella_lock:${marker}`);
for(const forbidden of ['addFriendlyLead','applyFriendlyLeads','friendly_lead_layer']) if(lockSource.includes(forbidden)) throw new Error(`extra_rewrite_still_present:${forbidden}`);

const imageSource=fs.readFileSync('src/blog-engine-v035.js','utf8');
for(const marker of [
  "const IMAGE_MODEL='@cf/black-forest-labs/flux-1-schnell'","const IMAGE_POLICY='owned-first-ai-fallback'",
  'ownedImageAt','generateImage','enrichPhotoSlots','image_data_uri',"url.pathname==='/api/image'",'web_image_search:false','video_search:false',
  'No brand logos','No brand logos, no trademarked product design',"import { serveBlogApp } from './blog-engine-app.js'",'mobile_app:true',
  "url.pathname==='/api/recommendations'",'FALLBACK_RECOMMENDATIONS','topic_recommendations:true',
  "url.pathname==='/api/live-keywords'",'liveKeywords','live_keyword_finder:true',"live_keyword_source:'google_search_suggestions_kr'",
  "live_keyword_signal_mode:'current_search_suggestions'",'fetchGoogleSuggestions','OPTICAL_SEEDS','current_search_signal:true','naver_live_keywords:false'
]) if(!imageSource.includes(marker)) throw new Error(`missing_image_app_or_search_signal_marker:${marker}`);

const appSource=fs.readFileSync('src/blog-engine-app.js','utf8');
for(const marker of [
  '스타포인트 블로그 AI','블로그 만들기','실시간 검색어 찾기','사진 선택','본문 전체 복사','기본 추천 3개',
  '<script src="/app.js"></script>',"u.pathname==='/app.js'",'String.raw`(function(){',
  '/manifest.webmanifest','/sw.js','/app-icon.svg','navigator.serviceWorker.register',
  "fetch('/api/live-keywords?limit=10&t='","fetch('/api/draft'",'owned_images:ownedImages','generate_images:true','starpoint-blog-app-v5',
  '현재 검색 제안','검색량 순위는 아님','급상승 확인','대체 주제'
]) if(!appSource.includes(marker)) throw new Error(`missing_mobile_app_marker:${marker}`);

const config=fs.readFileSync('src/blog-engine-config.js','utf8');
for(const marker of [
  "BLOG_ENGINE_VERSION = '0.3.6.4'","externalImages: 'disabled'","externalVideo: 'disabled'",
  "fallback: 'workers-ai-image-generation'","imageModel: '@cf/black-forest-labs/flux-1-schnell'"
]) if(!config.includes(marker)) throw new Error(`wrong_media_policy_or_version:${marker}`);

const wrangler=fs.readFileSync('wrangler.blog-engine.jsonc','utf8');
if(!wrangler.includes('"name": "p3-blog-engine"')) throw new Error('wrong_worker_name');
if(!wrangler.includes('"main": "src/blog-engine-v035.js"')) throw new Error('wrong_worker_entry');
if(!wrangler.includes('"binding": "AI"')) throw new Error('workers_ai_binding_missing');
if(!wrangler.includes('stella-v13b-mobile-app-owned-first-ai-images-v036')) throw new Error('mobile_app_mode_missing');

console.log('BLOG_ENGINE_V0364_CURRENT_SEARCH_SIGNAL_PREFLIGHT_OK');
