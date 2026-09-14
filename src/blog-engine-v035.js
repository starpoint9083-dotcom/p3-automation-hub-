import workerV0343 from './blog-engine-v0343.js';

const IMAGE_MODEL='@cf/black-forest-labs/flux-1-schnell';
const IMAGE_POLICY='owned-first-ai-fallback';
const H={'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':'*'};
const J=(data,status=200)=>new Response(JSON.stringify(data,null,2),{status,headers:H});

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
  return {
    source:'ai',
    generated:true,
    image_model:IMAGE_MODEL,
    image_prompt:prompt,
    image_data_uri:`data:image/jpeg;base64,${image}`
  };
}
async function enrichPhotoSlots(env,topic,draft,ownedImages,generateImages=true){
  if(!draft||!Array.isArray(draft.photo_slots)) return draft;
  const photoSlots=await Promise.all(draft.photo_slots.map(async(slot,index)=>{
    const owned=ownedImageAt(ownedImages,index);
    if(owned){
      return {...slot,source:'owned',generated:false,image_ref:owned};
    }
    if(!generateImages){
      return {...slot,source:'missing',generated:false,ai_fallback_available:true};
    }
    try{
      return {...slot,...await generateImage(env,topic,slot,index)};
    }catch(error){
      return {...slot,source:'ai_failed',generated:false,ai_fallback_available:true,image_error:error?.message||String(error)};
    }
  }));
  const ownedCount=photoSlots.filter(s=>s.source==='owned').length;
  const aiCount=photoSlots.filter(s=>s.source==='ai'&&s.generated).length;
  return {
    ...draft,
    photo_slots:photoSlots,
    generation_meta:{
      ...(draft.generation_meta||{}),
      image_policy:IMAGE_POLICY,
      image_model:IMAGE_MODEL,
      owned_image_count:ownedCount,
      ai_image_count:aiCount,
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
  try{
    const image=await generateImage(env,topic,slot,0);
    return J({ok:true,image_policy:IMAGE_POLICY,...image});
  }catch(error){
    return J({ok:false,error:error?.message||String(error),image_policy:IMAGE_POLICY},502);
  }
}

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(request.method==='POST'&&url.pathname==='/api/draft') return draftWithImages(request,env,ctx);
    if(request.method==='POST'&&url.pathname==='/api/image') return singleImage(request,env);

    const response=await workerV0343.fetch(request,env,ctx);
    if(!(request.method==='GET'&&url.pathname==='/health')) return response;
    let data;try{data=await response.clone().json();}catch{return response;}
    return J({...data,image_generation:true,image_policy:IMAGE_POLICY,image_model:IMAGE_MODEL,web_image_search:false,video_search:false},response.status);
  }
};
