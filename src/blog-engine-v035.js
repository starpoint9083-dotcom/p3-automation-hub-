import workerV0343 from './blog-engine-v0343.js';
import { serveBlogApp } from './blog-engine-app.js';

const IMAGE_MODEL='@cf/black-forest-labs/flux-1-schnell';
const IMAGE_POLICY='owned-first-ai-fallback';
const H={'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':'*'};
const J=(data,status=200)=>new Response(JSON.stringify(data,null,2),{status,headers:H});
const FALLBACK_RECOMMENDATIONS=[
  {keyword:'누진다초점 렌즈',blog_bridge:'누진다초점 적응과 정밀 시력검사',suggested_title:'누진다초점 렌즈, 제품보다 먼저 확인할 것',source:'safe_fallback'},
  {keyword:'변색렌즈',blog_bridge:'변색렌즈와 눈부심 관리',suggested_title:'변색렌즈를 고를 때 먼저 확인할 생활 습관',source:'safe_fallback'},
  {keyword:'야간운전 안경',blog_bridge:'운전할 때 편한 렌즈와 눈부심 관리',suggested_title:'야간운전이 불편할 때 안경에서 먼저 볼 것',source:'safe_fallback'}
];
const OPTICAL_SEEDS=['안경','안경 렌즈','누진다초점','노안 안경','변색렌즈','운전용 안경','야간운전 안경','블루라이트 안경','어린이 안경','근시 안경','선글라스','안경테'];
const OPTICAL_HINTS=['안경','렌즈','누진','노안','변색','자외선','선글라스','운전','눈부심','블루라이트','근시','시력','안경테','돋보기','편광'];

function clean(v=''){return String(v||'').replace(/\s+/g,' ').trim();}
function ownedImageAt(owned,index){
  if(Array.isArray(owned)) return clean(owned[index]);
  if(owned&&typeof owned==='object') return clean(owned[index]??owned[String(index)]??owned[`slot_${index+1}`]);
  return '';
}
function imagePrompt(topic,slot,index){
  const scene=clean(slot?.description||`optical store lifestyle scene ${index+1}`);
  const subject=clean(topic?.keyword||'eyeglasses');
  return [
    'High-quality editorial lifestyle photography for a Korean optical shop blog.',
    `Topic: ${subject}.`,
    `Scene: ${scene}.`,
    'Natural realistic lighting, clean modern optical-store aesthetic, believable Korean adult customers or optician when people are needed.',
    'No brand logos, no trademarked product design, no readable text, no watermarks, no medical diagrams, no exaggerated medical or vision claims.',
    'Photorealistic, useful as a supporting blog image, uncluttered composition.'
  ].join(' ');
}
async function generateImage(env,topic,slot,index){
  if(!env?.AI?.run) throw new Error('workers_ai_not_bound');
  const prompt=imagePrompt(topic,slot,index);
  const result=await env.AI.run(IMAGE_MODEL,{prompt,steps:4});
  const image=clean(result?.image);
  if(!image) throw new Error(`image_generation_empty_slot_${index+1}`);
  return {source:'ai',generated:true,image_model:IMAGE_MODEL,image_prompt:prompt,image_data_uri:`data:image/jpeg;base64,${image}`};
}
async function enrichPhotoSlots(env,topic,draft,ownedImages,generateImages=true){
  if(!draft||!Array.isArray(draft.photo_slots)) return draft;
  const photoSlots=await Promise.all(draft.photo_slots.map(async(slot,index)=>{
    const owned=ownedImageAt(ownedImages,index);
    if(owned) return {...slot,source:'owned',generated:false,image_ref:owned};
    if(!generateImages) return {...slot,source:'missing',generated:false,ai_fallback_available:true};
    try{return {...slot,...await generateImage(env,topic,slot,index)};}
    catch(error){return {...slot,source:'ai_failed',generated:false,ai_fallback_available:true,image_error:error?.message||String(error)};}
  }));
  return {
    ...draft,
    photo_slots:photoSlots,
    generation_meta:{
      ...(draft.generation_meta||{}),
      image_policy:IMAGE_POLICY,
      image_model:IMAGE_MODEL,
      owned_image_count:photoSlots.filter(s=>s.source==='owned').length,
      ai_image_count:photoSlots.filter(s=>s.source==='ai'&&s.generated).length,
      web_image_search:false,
      video_search:false
    }
  };
}
async function draftWithImages(request,env,ctx){
  const bodyText=await request.text();
  let body={};try{body=bodyText?JSON.parse(bodyText):{};}catch{}
  const inner=new Request(request.url,{method:'POST',headers:request.headers,body:bodyText});
  const response=await workerV0343.fetch(inner,env,ctx);
  let data;try{data=await response.clone().json();}catch{return response;}
  if(!response.ok||!data?.ok||!data?.draft) return response;
  const draft=await enrichPhotoSlots(env,data.topic,data.draft,body?.owned_images,body?.generate_images!==false);
  return J({...data,draft,image_policy:IMAGE_POLICY},response.status);
}
async function singleImage(request,env){
  let body={};try{body=await request.json();}catch{}
  const topic=body?.topic||{keyword:clean(body?.keyword||'안경')};
  const slot={description:clean(body?.description||body?.prompt||'clean optical store lifestyle scene')};
  try{return J({ok:true,image_policy:IMAGE_POLICY,...await generateImage(env,topic,slot,0)});}
  catch(error){return J({ok:false,error:error?.message||String(error),image_policy:IMAGE_POLICY},502);}
}
function chooseBridge(keyword=''){
  const t=clean(keyword).toLowerCase();
  if(/자외선|변색|선글라스|야외/.test(t)) return '변색렌즈와 눈부심 관리';
  if(/운전|자동차|야간|눈부심/.test(t)) return '운전할 때 편한 렌즈와 눈부심 관리';
  if(/블루라이트|컴퓨터|사무|디지털/.test(t)) return '사무용 안경과 디지털 눈 피로';
  if(/어린이|학생|근시|키즈/.test(t)) return '학생 시력과 근시 관리';
  if(/노안|누진|40대|50대|돋보기/.test(t)) return '누진다초점 적응과 정밀 시력검사';
  if(/안경테|패션|테 /.test(t)) return '얼굴형과 라이프스타일에 맞는 안경테';
  return '정확한 시력검사와 생활에 맞는 안경 선택';
}
function normalizeRecommendation(item){
  if(!item||!clean(item.keyword)) return null;
  return {
    keyword:clean(item.keyword),
    blog_bridge:clean(item.blog_bridge||chooseBridge(item.keyword)),
    suggested_title:clean(item.suggested_title||`${item.keyword}, 안경 선택 전에 확인할 것`),
    relevance_score:Number(item.relevance_score||0),
    source:item.source||'trend'
  };
}
function isOpticalKeyword(keyword=''){
  const t=clean(keyword).toLowerCase();
  return OPTICAL_HINTS.some(term=>t.includes(term));
}
function seasonBoost(keyword=''){
  const month=new Date().getUTCMonth()+1;
  const t=clean(keyword).toLowerCase();
  let score=0;
  if([8,9,10].includes(month)&&/자외선|변색|선글라스|운전|눈부심/.test(t)) score+=12;
  if([2,3,4].includes(month)&&/어린이|학생|근시|시력/.test(t)) score+=12;
  if([11,12,1].includes(month)&&/야간|운전|눈부심|노안/.test(t)) score+=8;
  return score;
}
async function fetchGoogleSuggestions(seed){
  const endpoint=`https://suggestqueries.google.com/complete/search?client=firefox&hl=ko&gl=kr&q=${encodeURIComponent(seed)}`;
  const response=await fetch(endpoint,{headers:{'user-agent':'Mozilla/5.0 (compatible; StarpointKeywordFinder/1.0)','accept':'application/json,text/plain,*/*'}});
  if(!response.ok) throw new Error(`google_suggest_http_${response.status}`);
  const data=await response.json();
  return Array.isArray(data?.[1])?data[1].map(clean).filter(Boolean).slice(0,10):[];
}
async function fetchTrendTopics(origin,env,ctx){
  try{
    const inner=new Request(`${origin}/api/topics?limit=50`,{headers:{'cache-control':'no-cache'}});
    const response=await workerV0343.fetch(inner,env,ctx);
    const data=await response.json();
    return data?.live&&Array.isArray(data?.topics)?data.topics:[];
  }catch{return [];}
}
async function buildCurrentOpticalSignals(origin,env,ctx,limit){
  const [suggestionResults,trendTopics]=await Promise.all([
    Promise.allSettled(OPTICAL_SEEDS.map(async(seed)=>({seed,suggestions:await fetchGoogleSuggestions(seed)}))),
    fetchTrendTopics(origin,env,ctx)
  ]);
  const map=new Map();
  let successfulSeeds=0;
  for(const result of suggestionResults){
    if(result.status!=='fulfilled') continue;
    successfulSeeds++;
    const {seed,suggestions}=result.value;
    suggestions.forEach((keyword,index)=>{
      if(!isOpticalKeyword(keyword)) return;
      const key=keyword.toLowerCase();
      const current=map.get(key)||{keyword,raw_score:0,seed_hits:0,best_position:99,seeds:[]};
      current.raw_score+=Math.max(8,34-index*3);
      current.seed_hits+=1;
      current.best_position=Math.min(current.best_position,index+1);
      if(!current.seeds.includes(seed)) current.seeds.push(seed);
      map.set(key,current);
    });
  }
  for(const trend of trendTopics){
    const keyword=clean(trend?.keyword);
    if(!keyword||!isOpticalKeyword(keyword)) continue;
    const key=keyword.toLowerCase();
    const current=map.get(key)||{keyword,raw_score:0,seed_hits:0,best_position:99,seeds:[]};
    current.raw_score+=140;
    current.trend_match=true;
    current.traffic=trend?.traffic||null;
    current.trend_rank=Number(trend?.rank||0)||null;
    map.set(key,current);
  }
  const items=[...map.values()];
  for(const item of items){
    for(const trend of trendTopics){
      const tk=clean(trend?.keyword).toLowerCase();
      const ik=item.keyword.toLowerCase();
      if(tk&&(ik.includes(tk)||tk.includes(ik))){
        item.raw_score+=70;
        item.trend_match=true;
        item.traffic=item.traffic||trend?.traffic||null;
        item.trend_rank=item.trend_rank||Number(trend?.rank||0)||null;
      }
    }
    item.raw_score+=item.seed_hits*7+seasonBoost(item.keyword);
  }
  items.sort((a,b)=>b.raw_score-a.raw_score||a.best_position-b.best_position||a.keyword.localeCompare(b.keyword,'ko'));
  const maxScore=Math.max(1,items[0]?.raw_score||1);
  return {
    successfulSeeds,
    keywords:items.slice(0,limit).map((item,index)=>({
      keyword:item.keyword,
      blog_bridge:chooseBridge(item.keyword),
      suggested_title:`${item.keyword}, 실제 생활에서 먼저 확인할 것`,
      rank:index+1,
      signal_score:Math.max(1,Math.min(100,Math.round(item.raw_score/maxScore*100))),
      suggestion_hits:item.seed_hits,
      best_suggestion_position:item.best_position===99?null:item.best_position,
      trend_match:Boolean(item.trend_match),
      traffic:item.traffic||null,
      trend_rank:item.trend_rank||null,
      source:item.trend_match?'google_search_suggestions_plus_trends_kr':'google_search_suggestions_kr',
      live:true,
      current_search_signal:true
    }))
  };
}
async function recommendations(request,env,ctx){
  const url=new URL(request.url);
  try{
    const signal=await buildCurrentOpticalSignals(url.origin,env,ctx,3);
    if(signal.keywords.length>=3) return J({ok:true,live:true,recommendations:signal.keywords.slice(0,3),source:'current_optical_search_signals'});
  }catch{}
  return J({ok:true,live:false,recommendations:FALLBACK_RECOMMENDATIONS,source:'safe_optical_fallback'});
}
async function liveKeywords(request,env,ctx){
  const url=new URL(request.url);
  const limit=Math.max(3,Math.min(Number(url.searchParams.get('limit'))||10,10));
  try{
    const signal=await buildCurrentOpticalSignals(url.origin,env,ctx,limit);
    if(signal.keywords.length){
      return J({
        ok:true,
        live:true,
        signal_mode:'current_search_suggestions',
        live_source:'google_search_suggestions_kr',
        live_source_label:'Google 현재 검색 제안 + Google Trends KR',
        naver_live_keywords:false,
        successful_seed_count:signal.successfulSeeds,
        keywords:signal.keywords,
        live_keyword_count:signal.keywords.length,
        fallback_suggestions:[],
        note:'안경 관련 후보군을 현재 Google 검색 제안 신호에 대조해 순위를 계산했습니다. 검색량 순위는 아니며, Google Trends 급상승과 겹치면 급상승으로 표시합니다.'
      });
    }
    throw new Error('current_optical_signals_empty');
  }catch(error){
    return J({
      ok:true,
      live:false,
      signal_mode:'fallback',
      live_source:'google_search_suggestions_kr',
      live_source_label:'Google 현재 검색 제안',
      naver_live_keywords:false,
      keywords:[],
      live_keyword_count:0,
      fallback_suggestions:FALLBACK_RECOMMENDATIONS,
      note:'현재 검색 제안 신호를 불러오지 못해 대체 주제를 표시합니다.',
      source_error:error?.message||String(error)
    });
  }
}

export default{
  async fetch(request,env,ctx){
    const app=serveBlogApp(request);
    if(app) return app;
    const url=new URL(request.url);
    if(request.method==='GET'&&url.pathname==='/api/live-keywords') return liveKeywords(request,env,ctx);
    if(request.method==='GET'&&url.pathname==='/api/recommendations') return recommendations(request,env,ctx);
    if(request.method==='POST'&&url.pathname==='/api/draft') return draftWithImages(request,env,ctx);
    if(request.method==='POST'&&url.pathname==='/api/image') return singleImage(request,env);
    const response=await workerV0343.fetch(request,env,ctx);
    if(!(request.method==='GET'&&url.pathname==='/health')) return response;
    let data;try{data=await response.clone().json();}catch{return response;}
    return J({...data,mobile_app:true,app_path:'/',topic_recommendations:true,live_keyword_finder:true,live_keyword_source:'google_search_suggestions_kr',live_keyword_signal_mode:'current_search_suggestions',naver_live_keywords:false,image_generation:true,image_policy:IMAGE_POLICY,image_model:IMAGE_MODEL,web_image_search:false,video_search:false},response.status);
  }
};