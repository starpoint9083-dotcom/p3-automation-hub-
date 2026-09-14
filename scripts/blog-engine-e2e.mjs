const base=String(process.env.BLOG_ENGINE_URL||'').replace(/\/$/,'');
if(!base) throw new Error('BLOG_ENGINE_URL missing');

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const EXPECTED_VERSION='0.3.6.3';
const EXPECTED_GATE='v0.3.4.3-stella-v13b';
const EXPECTED_VOICE='stella-v13b-starpoint-friendly-60-40';
const EXPECTED_IMAGE_MODEL='@cf/black-forest-labs/flux-1-schnell';
const EXPECTED_IMAGE_POLICY='owned-first-ai-fallback';

async function requestJson(path,options={}){
  const {retries=3,timeoutMs=120000,...fetchOptions}=options;
  let lastError;
  for(let attempt=1;attempt<=retries;attempt++){
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);
    try{
      const response=await fetch(`${base}${path}`,{...fetchOptions,signal:controller.signal,headers:{'cache-control':'no-cache','content-type':'application/json',...(fetchOptions.headers||{})}});
      const text=await response.text();let data;try{data=JSON.parse(text);}catch{throw new Error(`${path}:invalid_json:${text.slice(0,200)}`)}
      if(!response.ok) throw new Error(`${path}:http_${response.status}:${data?.error||'unknown'}`);
      return data;
    }catch(error){lastError=error;if(attempt<retries)await sleep(attempt*2500)}finally{clearTimeout(timer)}
  }
  throw lastError;
}
async function requestText(path,{retries=3,timeoutMs=30000}={}){
  let lastError;
  for(let attempt=1;attempt<=retries;attempt++){
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);
    try{const response=await fetch(`${base}${path}`,{cache:'no-store',signal:controller.signal});const text=await response.text();if(!response.ok)throw new Error(`${path}:http_${response.status}`);return {text,contentType:response.headers.get('content-type')||''}}
    catch(error){lastError=error;if(attempt<retries)await sleep(attempt*2000)}finally{clearTimeout(timer)}
  }
  throw lastError;
}
async function waitForHealth(){
  let last;
  for(let i=0;i<12;i++){
    last=await requestJson('/health',{retries:1,timeoutMs:15000});
    if(last?.ok&&last?.version===EXPECTED_VERSION&&last?.ai_bound===true&&last?.text_quality_gate===EXPECTED_GATE&&last?.voice_profile===EXPECTED_VOICE&&last?.stella_v13b_locked===true&&last?.extra_lead_rewrite===false&&last?.mobile_app===true&&last?.app_path==='/'&&last?.topic_recommendations===true&&last?.live_keyword_finder===true&&last?.live_keyword_source==='google_trends_kr'&&last?.naver_live_keywords===false&&last?.image_generation===true&&last?.image_policy===EXPECTED_IMAGE_POLICY&&last?.image_model===EXPECTED_IMAGE_MODEL&&last?.web_image_search===false&&last?.video_search===false) return last;
    await sleep(2500);
  }
  throw new Error(`health_not_propagated:${JSON.stringify(last)}`);
}

const health=await waitForHealth();
const app=await requestText('/');
if(!app.contentType.includes('text/html')) throw new Error('mobile_app_content_type_wrong');
for(const marker of ['스타포인트 블로그 AI','블로그 만들기','실시간 검색어 찾기','사진 선택','본문 전체 복사','<script src="/app.js"></script>']) if(!app.text.includes(marker)) throw new Error(`mobile_app_marker_missing:${marker}`);

const appJs=await requestText('/app.js');
if(!appJs.contentType.includes('javascript')) throw new Error('mobile_app_js_content_type_wrong');
for(const marker of ['기본 추천 3개','/api/live-keywords?limit=10&t=','현재 실시간 안경 관련 검색어 0개','renderRecommendations(FALLBACK','/api/draft']) if(!appJs.text.includes(marker)) throw new Error(`mobile_app_js_marker_missing:${marker}`);
try{new Function(appJs.text);}catch(error){throw new Error(`mobile_app_script_syntax:${error.message}`)}

const manifest=await requestJson('/manifest.webmanifest',{timeoutMs:15000});
if(manifest?.name!=='스타포인트 블로그 AI'||manifest?.display!=='standalone'||manifest?.start_url!=='/') throw new Error('manifest_invalid');
const sw=await requestText('/sw.js');
if(!sw.contentType.includes('javascript')||!sw.text.includes('starpoint-blog-app-v4')) throw new Error('service_worker_invalid');

const liveKeywords=await requestJson('/api/live-keywords?limit=10',{timeoutMs:45000});
if(!liveKeywords?.ok||liveKeywords?.live_source!=='google_trends_kr'||liveKeywords?.naver_live_keywords!==false) throw new Error('live_keyword_source_invalid');
if(!Array.isArray(liveKeywords.keywords)||!Array.isArray(liveKeywords.fallback_suggestions)) throw new Error('live_keyword_arrays_invalid');
if(liveKeywords.keywords.length){
  for(const item of liveKeywords.keywords){
    if(item?.live!==true||typeof item?.keyword!=='string'||!item.keyword.trim()) throw new Error('live_keyword_item_invalid');
  }
}else if(liveKeywords.fallback_suggestions.length<1){
  throw new Error('live_keyword_no_fallback');
}

const recommendations=await requestJson('/api/recommendations',{timeoutMs:45000});
if(!recommendations?.ok||!Array.isArray(recommendations.recommendations)||recommendations.recommendations.length<3) throw new Error('recommendations_not_resilient');
for(const item of recommendations.recommendations.slice(0,3)) if(typeof item?.keyword!=='string'||!item.keyword.trim()) throw new Error('recommendation_keyword_missing');

const trends=await requestJson('/api/trends?limit=10',{timeoutMs:30000});
if(!Array.isArray(trends.trends)||trends.trends.length<1) throw new Error('trends_invalid');

// Do not call /api/image or /api/draft here. They consume the Workers AI daily free allocation.
console.log(JSON.stringify({
  ok:true,
  url:base,
  version:health.version,
  mobile_app:true,
  external_app_js:true,
  live_keyword_finder:true,
  live_keyword_source:liveKeywords.live_source,
  live_keyword_count:liveKeywords.keywords.length,
  fallback_count:liveKeywords.fallback_suggestions.length,
  naver_live_keywords:liveKeywords.naver_live_keywords,
  topic_recommendations:true,
  recommendation_count:recommendations.recommendations.length,
  browser_script_syntax:true,
  pwa_manifest:true,
  service_worker:true,
  stella_v13b_locked:health.stella_v13b_locked,
  image_generation_bound:health.image_generation,
  image_policy:health.image_policy,
  image_model:health.image_model,
  live_trends:trends.live,
  ai_quota_consumed_by_deploy_test:false
},null,2));
