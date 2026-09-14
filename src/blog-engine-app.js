const APP_HEADERS={
  'content-type':'text/html; charset=utf-8',
  'cache-control':'no-store',
  'x-content-type-options':'nosniff',
  'referrer-policy':'no-referrer',
  'permissions-policy':'camera=(self)'
};

const APP_HTML=`<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#111827">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="스타포인트 블로그">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" href="/app-icon.svg" type="image/svg+xml">
<title>스타포인트 블로그 AI</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f4f5f7;color:#111827;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Noto Sans KR",sans-serif}.wrap{max-width:720px;margin:0 auto;padding:16px 14px 80px}.top{padding:10px 2px 16px}.brand{font-size:13px;font-weight:800;letter-spacing:.05em;color:#6b7280}.top h1{font-size:27px;line-height:1.2;margin:5px 0 5px}.sub{margin:0;color:#6b7280;font-size:14px}.card{background:#fff;border:1px solid #e5e7eb;border-radius:20px;padding:17px;margin:12px 0;box-shadow:0 8px 28px #1118270b}.step{font-size:12px;font-weight:800;color:#6b7280;margin-bottom:7px}.label{display:block;font-size:15px;font-weight:800;margin-bottom:8px}.row{display:flex;gap:8px}.input{width:100%;border:1px solid #d1d5db;border-radius:14px;padding:14px 13px;font-size:16px;outline:none;background:#fff}.input:focus{border-color:#111827}.btn{border:0;border-radius:14px;padding:13px 15px;font-size:15px;font-weight:800;cursor:pointer}.btn:disabled{opacity:.45;cursor:default}.primary{width:100%;background:#111827;color:#fff;font-size:17px;padding:16px}.secondary{background:#eef0f3;color:#111827;white-space:nowrap}.ghost{background:#fff;border:1px solid #d1d5db;color:#111827}.rec-list{display:grid;gap:8px;margin-top:10px}.rec{width:100%;text-align:left;background:#f8fafc;border:1px solid #e5e7eb;border-radius:14px;padding:12px;cursor:pointer}.rec.selected{border:2px solid #111827;background:#f3f4f6}.rec b{font-size:15px}.rec small{display:block;color:#6b7280;margin-top:4px;line-height:1.35}.source{font-size:12px;color:#6b7280;margin-top:8px}.upload{display:block;border:1.5px dashed #cbd5e1;border-radius:16px;padding:18px;text-align:center;font-weight:800;background:#f8fafc;cursor:pointer}.upload small{display:block;font-weight:500;color:#6b7280;margin-top:5px}.previews{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-top:10px}.preview{position:relative;background:#f3f4f6;border-radius:14px;overflow:hidden;aspect-ratio:4/3}.preview img{width:100%;height:100%;object-fit:cover}.preview span{position:absolute;left:7px;bottom:7px;background:#111827cc;color:white;padding:4px 7px;border-radius:8px;font-size:11px}.ai-note{font-size:13px;color:#6b7280;margin:10px 0 0}.status{display:none;text-align:center;padding:22px 10px}.spinner{width:28px;height:28px;border:3px solid #e5e7eb;border-top-color:#111827;border-radius:50%;margin:0 auto 12px;animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.status b{display:block}.status small{color:#6b7280}.result{display:none}.title-out{font-size:23px;line-height:1.35;margin:5px 0 14px}.intro{font-size:16px;line-height:1.7;background:#f8fafc;padding:14px;border-radius:14px}.section{padding:12px 0;border-top:1px solid #eef0f3}.section h3{font-size:18px;margin:4px 0 8px}.section p{font-size:16px;line-height:1.75;margin:0;white-space:pre-wrap}.media-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:9px;margin-top:13px}.media{border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;background:#fafafa}.media img{display:block;width:100%;aspect-ratio:4/3;object-fit:cover;background:#eee}.media .meta{padding:8px}.media .meta b{font-size:12px}.media .meta div{font-size:11px;color:#6b7280;margin-top:3px}.save{display:inline-block;margin-top:7px;font-size:12px;font-weight:800;color:#111827;text-decoration:none}.actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px}.actions .btn{width:100%}.tags{font-size:14px;line-height:1.6;color:#374151;margin-top:15px}.error{display:none;color:#b91c1c;background:#fef2f2;border:1px solid #fecaca;border-radius:14px;padding:12px;margin-top:10px;font-size:14px}.install{display:none;margin-top:10px;width:100%}.foot{text-align:center;color:#9ca3af;font-size:11px;padding-top:12px}@media(max-width:420px){.top h1{font-size:25px}.row{flex-direction:column}.secondary{width:100%}.actions{grid-template-columns:1fr}.media-grid{grid-template-columns:1fr 1fr}}
</style>
</head>
<body>
<div class="wrap">
  <header class="top"><div class="brand">STARPOINT OPTICAL</div><h1>블로그 AI</h1><p class="sub">사진과 주제만 넣으면 글과 부족한 사진까지 자동 완성합니다.</p></header>

  <section class="card">
    <div class="step">STEP 1</div><label class="label" for="topic">무슨 글을 만들까요?</label>
    <div class="row"><input id="topic" class="input" placeholder="예: 변색렌즈와 블루라이트 차단"><button id="recommend" class="btn secondary">오늘 주제 찾기</button></div>
    <div id="recs" class="rec-list"></div><div id="trendSource" class="source"></div>
  </section>

  <section class="card">
    <div class="step">STEP 2</div><span class="label">매장 사진이 있으면 넣어주세요</span>
    <label class="upload" for="photos">📷 사진 선택 <small>최대 4장 · 사진이 부족하면 AI가 자동으로 만듭니다.</small></label>
    <input id="photos" type="file" accept="image/*" multiple hidden>
    <div id="previews" class="previews"></div><p id="aiNote" class="ai-note">사진을 안 넣어도 만들 수 있습니다.</p>
  </section>

  <button id="generate" class="btn primary">블로그 만들기</button>
  <button id="install" class="btn ghost install">휴대폰 홈 화면에 앱 추가</button>
  <div id="error" class="error"></div>

  <section id="status" class="card status"><div class="spinner"></div><b id="statusMain">블로그를 만들고 있습니다</b><small id="statusSub">본문 구성 중</small></section>

  <section id="result" class="card result">
    <div class="step">완성된 블로그</div><h2 id="outTitle" class="title-out"></h2><div id="outIntro" class="intro"></div><div id="outSections"></div>
    <h3>사진</h3><div id="outMedia" class="media-grid"></div><div id="outTags" class="tags"></div><div id="outCta" class="tags"></div>
    <div class="actions"><button id="copy" class="btn primary">본문 전체 복사</button><button id="newPost" class="btn ghost">새 글 만들기</button></div>
  </section>
  <div class="foot">스텔라웨이 V13-B · 보유사진 우선 · 부족한 사진 AI 생성</div>
</div>
<script>
const $=s=>document.querySelector(s);let ownedImages=[],selectedTopic=null,installPrompt=null,lastDraft=null;
const topicEl=$('#topic'),photosEl=$('#photos'),recsEl=$('#recs'),errEl=$('#error');
function error(msg){errEl.textContent=msg;errEl.style.display='block'}function clearError(){errEl.style.display='none';errEl.textContent=''}
function esc(s=''){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
function compress(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=reject;reader.onload=()=>{const img=new Image();img.onerror=reject;img.onload=()=>{const max=1000,scale=Math.min(1,max/Math.max(img.width,img.height)),w=Math.round(img.width*scale),h=Math.round(img.height*scale),c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);resolve(c.toDataURL('image/jpeg',.74))};img.src=reader.result};reader.readAsDataURL(file)})}
photosEl.addEventListener('change',async()=>{clearError();const files=[...photosEl.files].slice(0,4);ownedImages=[];$('#previews').innerHTML='';for(let i=0;i<files.length;i++){try{const data=await compress(files[i]);ownedImages.push(data);const d=document.createElement('div');d.className='preview';d.innerHTML='<img src="'+data+'"><span>내 사진 '+(i+1)+'</span>';$('#previews').appendChild(d)}catch{error('사진을 읽지 못했습니다. 다른 사진으로 다시 선택해주세요.')}}$('#aiNote').textContent=ownedImages.length?('내 사진 '+ownedImages.length+'장 사용 · 부족한 '+Math.max(0,4-ownedImages.length)+'장은 AI가 자동 생성합니다.'):'사진을 안 넣어도 AI가 필요한 사진을 자동 생성합니다.'});
$('#recommend').addEventListener('click',async()=>{clearError();const b=$('#recommend');b.disabled=true;b.textContent='찾는 중…';recsEl.innerHTML='';try{const r=await fetch('/api/topics?limit=30',{cache:'no-store'}),d=await r.json();const list=(d.topics&&d.topics.length?d.topics:d.fallback_suggestions||[]).slice(0,3);if(!list.length)throw new Error('추천 주제를 찾지 못했습니다.');$('#trendSource').textContent=d.live?'현재 실시간 트렌드 + 안경원 관련성으로 추천':'실시간 연결이 없어 검증된 안경 주제로 추천';list.forEach((t,i)=>{const x=document.createElement('button');x.className='rec';x.innerHTML='<b>'+(i+1)+'. '+esc(t.keyword)+'</b><small>'+esc(t.suggested_title||t.blog_bridge||'')+'</small>';x.onclick=()=>{[...recsEl.children].forEach(v=>v.classList.remove('selected'));x.classList.add('selected');selectedTopic=t;topicEl.value=t.keyword};recsEl.appendChild(x)})}catch(e){error(e.message||'주제 추천을 불러오지 못했습니다.')}finally{b.disabled=false;b.textContent='오늘 주제 찾기'}});
topicEl.addEventListener('input',()=>{if(selectedTopic&&topicEl.value.trim()!==selectedTopic.keyword)selectedTopic=null});
function setLoading(on){$('#generate').disabled=on;$('#status').style.display=on?'block':'none';if(on){$('#result').style.display='none';const messages=['본문 구성 중','생활 장면과 주의점 확인 중','사진 위치 확인 중','부족한 사진 AI 생성 중'];let i=0;$('#statusSub').textContent=messages[0];window.__st=setInterval(()=>{$('#statusSub').textContent=messages[Math.min(++i,messages.length-1)]},2200)}else{clearInterval(window.__st)}}
$('#generate').addEventListener('click',async()=>{clearError();setLoading(true);try{const keyword=topicEl.value.trim();const body={owned_images:ownedImages,generate_images:true};if(keyword)body.topic=selectedTopic&&selectedTopic.keyword===keyword?selectedTopic:{keyword};const r=await fetch('/api/draft',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const d=await r.json();if(!r.ok||!d.ok||!d.draft)throw new Error(d.error||'글 생성에 실패했습니다.');lastDraft=d;render(d)}catch(e){error(e.message||'블로그를 만들지 못했습니다.')}finally{setLoading(false)}});
function render(d){const x=d.draft;$('#outTitle').textContent=x.title||d.topic?.suggested_title||'블로그 글';$('#outIntro').textContent=x.intro||x.opening||'';const sec=$('#outSections');sec.innerHTML='';(x.sections||[]).forEach(s=>{const el=document.createElement('div');el.className='section';el.innerHTML='<h3>'+esc(s.heading||'')+'</h3><p>'+esc(s.body||((s.points||[]).join('\n'))||'')+'</p>';sec.appendChild(el)});const media=$('#outMedia');media.innerHTML='';(x.photo_slots||[]).forEach((s,i)=>{const src=s.image_ref||s.image_data_uri||'';if(!src)return;const m=document.createElement('div');m.className='media';const label=s.source==='owned'?'내 사진':'AI 생성';m.innerHTML='<img src="'+src+'"><div class="meta"><b>'+label+'</b><div>'+esc(s.position||s.description||('사진 '+(i+1)))+'</div>'+(s.source==='ai'?'<a class="save" download="starpoint-blog-'+(i+1)+'.jpg" href="'+src+'">사진 저장</a>':'')+'</div>';media.appendChild(m)});$('#outTags').textContent=(x.hashtags||[]).join(' ');$('#outCta').textContent=x.cta||x.closing||'';$('#result').style.display='block';$('#result').scrollIntoView({behavior:'smooth',block:'start'})}
function draftText(){if(!lastDraft)return'';const x=lastDraft.draft,parts=[x.title||'',x.intro||x.opening||''];(x.sections||[]).forEach(s=>{parts.push(s.heading||'');parts.push(s.body||((s.points||[]).join('\n'))||'')});if(x.hashtags?.length)parts.push(x.hashtags.join(' '));if(x.cta||x.closing)parts.push(x.cta||x.closing);return parts.filter(Boolean).join('\n\n')}
$('#copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(draftText());const b=$('#copy'),old=b.textContent;b.textContent='복사 완료 ✓';setTimeout(()=>b.textContent=old,1400)}catch{error('복사에 실패했습니다. 본문을 길게 눌러 복사해주세요.')}});
$('#newPost').addEventListener('click',()=>{$('#result').style.display='none';topicEl.focus();window.scrollTo({top:0,behavior:'smooth'})});
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;$('#install').style.display='block'});$('#install').addEventListener('click',async()=>{if(installPrompt){installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;$('#install').style.display='none'}else alert('크롬 메뉴에서 “홈 화면에 추가”를 선택하면 앱처럼 사용할 수 있습니다.')});
if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
</script>
</body></html>`;

const MANIFEST={name:'스타포인트 블로그 AI',short_name:'블로그 AI',start_url:'/',display:'standalone',background_color:'#f4f5f7',theme_color:'#111827',lang:'ko',icons:[{src:'/app-icon.svg',sizes:'any',type:'image/svg+xml',purpose:'any maskable'}]};
const ICON=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="#111827"/><circle cx="256" cy="210" r="105" fill="none" stroke="#fff" stroke-width="24"/><path d="M95 214h56M361 214h56M151 214c18 58 55 87 105 87s87-29 105-87" fill="none" stroke="#fff" stroke-width="24" stroke-linecap="round"/><text x="256" y="405" text-anchor="middle" fill="#fff" font-family="sans-serif" font-size="68" font-weight="700">BLOG</text></svg>`;
const SW=`const C='starpoint-blog-app-v1';self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(['/','/manifest.webmanifest','/app-icon.svg'])).then(()=>self.skipWaiting()))});self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;e.respondWith(fetch(e.request).then(r=>{const x=r.clone();caches.open(C).then(c=>c.put(e.request,x));return r}).catch(()=>caches.match(e.request)))})`;

export function serveBlogApp(request){
  const u=new URL(request.url);
  if(request.method!=='GET') return null;
  if(u.pathname==='/'||u.pathname==='/app') return new Response(APP_HTML,{status:200,headers:APP_HEADERS});
  if(u.pathname==='/manifest.webmanifest') return new Response(JSON.stringify(MANIFEST),{status:200,headers:{'content-type':'application/manifest+json; charset=utf-8','cache-control':'public, max-age=3600'}});
  if(u.pathname==='/app-icon.svg') return new Response(ICON,{status:200,headers:{'content-type':'image/svg+xml; charset=utf-8','cache-control':'public, max-age=86400'}});
  if(u.pathname==='/sw.js') return new Response(SW,{status:200,headers:{'content-type':'application/javascript; charset=utf-8','cache-control':'no-cache','service-worker-allowed':'/'}});
  return null;
}
