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
function normalizeRecommendation(item){
  if(!item||!clean(item.keyword)) return null;
  return {
    keyword:clean(item.keyword),
    blog_bridge:clean(item.blog_bridge||'정확한 시력검사와 생활에 맞는 안경 선택'),
    suggested_title:clean(item.suggested_title||`${item.keyword}, 안경 선택 전에 확인할 것`),
    relevance_score:Number(item.relevance_score||0),
    source:item.source||'trend'
  };
}
function normalizeLiveKeyword(item,index=0){
  const base=normalizeRecommendation(item);
  if(!base) return null;
  return {
    ...base,
    rank:Number(item.rank||index+1),
    traffic:item.traffic||null,
    published_at:item.published_at||null,
    reasons:Array.isArray(item.reasons)?item.reasons.slice(0,3):[],
    source:item.source||'google_trends_kr',
    live:true
  };
}
async function recommendations(request,env,ctx){
  const url=new URL(request.url);
  try{
    const inner=new Request(`${url.origin}/api/topics?limit=30`,{headers:{'cache-control':'no-cache'}});
    const response=await workerV0343.fetch(inner,env,ctx);
    const data=await response.json();
    const picked=[...(Array.isArray(data?.topics)?data.topics:[]),...(Array.isArray(data?.fallback_suggestions)?data.fallback_suggestions:[])]
      .map(normalizeRecommendation).filter(Boolean);
    for(const fallback of FALLBACK_RECOMMENDATIONS){
      if(!picked.some(x=>x.keyword===fallback.keyword)) picked.push({...fallback});
      if(picked.length>=3) break;
    }
    return J({ok:true,live:Boolean(data?.live),recommendations:picked.slice(0,3),source:data?.live?'live_trends_plus_optical_relevance':'safe_optical_fallback'});
  }catch(error){
    return J({ok:true,live:false,recommendations:FALLBACK_RECOMMENDATIONS,source:'safe_optical_fallback',source_error:error?.message||String(error)});
  }
}
async function liveKeywords(request,env,ctx){
  const url=new URL(request.url);
  const limit=Math.max(3,Math.min(Number(url.searchParams.get('limit'))||10,10));
  try{
    const inner=new Request(`${url.origin}/api/topics?limit=50`,{headers:{'cache-control':'no-cache'}});
    const response=await workerV0343.fetch(inner,env,ctx);
    const data=await response.json();
    const keywords=(data?.live&&Array.isArray(data?.topics)?data.topics:[])
      .map((item,index)=>normalizeLiveKeyword(item,index)).filter(Boolean).slice(0,limit);
    const fallback=(Array.isArray(data?.fallback_suggestions)&&data.fallback_suggestions.length?data.fallback_suggestions:FALLBACK_RECOMMENDATIONS)
      .map(normalizeRecommendation).filter(Boolean).slice(0,3);
    return J({
      ok:true,
      live:Boolean(data?.live),
      live_source:'google_trends_kr',
      live_source_label:'Google Trends KR',
      naver_live_keywords:false,
      keywords,
      live_keyword_count:keywords.length,
      fallback_suggestions:keywords.length?[]:fallback,
      note:keywords.length
        ?'현재 실시간 트렌드 중 안경원과 연결 근거가 있는 검색어만 표시합니다.'
        :'현재 실시간 트렌드에서 안경 관련 검색어가 없어 대체 주제를 별도로 표시합니다.'
    });
  }catch(error){
    return J({
      ok:true,
      live:false,
      live_source:'google_trends_kr',
      live_source_label:'Google Trends KR',
      naver_live_keywords:false,
      keywords:[],
      live_keyword_count:0,
      fallback_suggestions:FALLBACK_RECOMMENDATIONS,
      note:'실시간 트렌드 연결이 늦어 대체 주제를 표시합니다.',
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
    return J({...data,mobile_app:true,app_path:'/',topic_recommendations:true,live_keyword_finder:true,live_keyword_source:'google_trends_kr',naver_live_keywords:false,image_generation:true,image_policy:IMAGE_POLICY,image_model:IMAGE_MODEL,web_image_search:false,video_search:false},response.status);
  }
};
