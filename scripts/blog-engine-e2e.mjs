const base=String(process.env.BLOG_ENGINE_URL||'').replace(/\/$/,'');
if(!base) throw new Error('BLOG_ENGINE_URL missing');

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const EXPECTED_VERSION='0.3.5.0';
const EXPECTED_GATE='v0.3.4.3-stella-v13b';
const EXPECTED_VOICE='stella-v13b-starpoint-friendly-60-40';
const EXPECTED_IMAGE_MODEL='@cf/black-forest-labs/flux-1-schnell';
const EXPECTED_IMAGE_POLICY='owned-first-ai-fallback';

async function requestJson(path,options={}){
  const {retries=3,timeoutMs=120000,...fetchOptions}=options;
  let lastError;
  for(let attempt=1;attempt<=retries;attempt++){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeoutMs);
    try{
      const response=await fetch(`${base}${path}`,{
        ...fetchOptions,
        signal:controller.signal,
        headers:{'cache-control':'no-cache','content-type':'application/json',...(fetchOptions.headers||{})}
      });
      const text=await response.text();
      let data;try{data=JSON.parse(text);}catch{throw new Error(`${path}:invalid_json:${text.slice(0,200)}`);}
      if(!response.ok) throw new Error(`${path}:http_${response.status}:${data?.error||'unknown'}`);
      return data;
    }catch(error){
      lastError=error;
      if(attempt<retries) await sleep(attempt*2500);
    }finally{clearTimeout(timer);}
  }
  throw lastError;
}

async function waitForHealth(){
  let last;
  for(let i=0;i<12;i++){
    last=await requestJson('/health',{retries:1,timeoutMs:15000});
    if(
      last?.ok&&last?.version===EXPECTED_VERSION&&last?.ai_bound===true&&
      last?.text_quality_gate===EXPECTED_GATE&&last?.voice_profile===EXPECTED_VOICE&&
      last?.stella_v13b_locked===true&&last?.extra_lead_rewrite===false&&
      last?.image_generation===true&&last?.image_policy===EXPECTED_IMAGE_POLICY&&
      last?.image_model===EXPECTED_IMAGE_MODEL&&last?.web_image_search===false&&last?.video_search===false
    ) return last;
    await sleep(2500);
  }
  throw new Error(`health_not_propagated:${JSON.stringify(last)}`);
}

const health=await waitForHealth();
const trends=await requestJson('/api/trends?limit=10',{timeoutMs:30000});
if(!Array.isArray(trends.trends)||trends.trends.length<1) throw new Error('trends_invalid');

const single=await requestJson('/api/image',{
  method:'POST',
  body:JSON.stringify({keyword:'누진다초점 렌즈',description:'밝고 깔끔한 안경원에서 안경사가 고객의 안경 피팅을 확인하는 자연스러운 장면'}),
  retries:2,
  timeoutMs:180000
});
if(!single?.ok||single?.source!=='ai'||single?.generated!==true) throw new Error('single_image_generation_failed');
if(single?.image_model!==EXPECTED_IMAGE_MODEL) throw new Error('single_image_model_wrong');
if(typeof single?.image_data_uri!=='string'||!single.image_data_uri.startsWith('data:image/jpeg;base64,')||single.image_data_uri.length<1000) throw new Error('single_image_data_invalid');

const testTopic={
  keyword:'누진다초점 렌즈',
  blog_bridge:'누진다초점 적응과 정밀 시력검사',
  suggested_title:'누진다초점 렌즈, 제품보다 먼저 확인할 것'
};
const owned=['owned://store-exam','owned://lens-detail','owned://customer-use'];
const draft=await requestJson('/api/draft',{
  method:'POST',
  body:JSON.stringify({topic:testTopic,owned_images:owned}),
  retries:1,
  timeoutMs:300000
});
if(!draft?.ok||!draft?.draft||!Array.isArray(draft.draft.photo_slots)||draft.draft.photo_slots.length<4) throw new Error('draft_invalid');
if(draft.draft.generation_meta?.stella_v13b_locked!==true||draft.draft.generation_meta?.extra_lead_rewrite!==false) throw new Error('stella_lock_missing');
if(draft.draft.generation_meta?.image_policy!==EXPECTED_IMAGE_POLICY) throw new Error('image_policy_missing');
if(draft.draft.generation_meta?.web_image_search!==false||draft.draft.generation_meta?.video_search!==false) throw new Error('search_policy_wrong');
if(draft.draft.generation_meta?.owned_image_count!==3) throw new Error(`owned_count_wrong:${draft.draft.generation_meta?.owned_image_count}`);
if(draft.draft.generation_meta?.ai_image_count!==1) throw new Error(`ai_count_wrong:${draft.draft.generation_meta?.ai_image_count}`);
for(let i=0;i<3;i++) if(draft.draft.photo_slots[i]?.source!=='owned'||draft.draft.photo_slots[i]?.image_ref!==owned[i]) throw new Error(`owned_slot_${i+1}_wrong`);
const fallback=draft.draft.photo_slots[3];
if(fallback?.source!=='ai'||fallback?.generated!==true||typeof fallback?.image_data_uri!=='string'||fallback.image_data_uri.length<1000) throw new Error('automatic_ai_fallback_failed');

console.log(JSON.stringify({
  ok:true,
  url:base,
  version:health.version,
  stella_v13b_locked:health.stella_v13b_locked,
  extra_lead_rewrite:health.extra_lead_rewrite,
  image_policy:health.image_policy,
  image_model:health.image_model,
  web_image_search:health.web_image_search,
  video_search:health.video_search,
  single_image_generated:true,
  single_image_bytes_estimate:Math.floor((single.image_data_uri.length-'data:image/jpeg;base64,'.length)*3/4),
  draft_title:draft.draft.title,
  owned_image_count:draft.draft.generation_meta.owned_image_count,
  ai_image_count:draft.draft.generation_meta.ai_image_count,
  fallback_slot:draft.draft.photo_slots[3].position,
  live_trends:trends.live
},null,2));
