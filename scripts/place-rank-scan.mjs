import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import puppeteer from 'puppeteer-core';

const root = process.cwd();
const configPath = path.join(root, 'config', 'place-rank.json');
const historyPath = path.join(root, 'data', 'place-rank-history.json');
const generatedPath = path.join(root, 'src', 'place-rank-data.js');
const artifactDir = path.join(root, 'artifacts', 'place-rank');
const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
const historyDoc = JSON.parse(await fs.readFile(historyPath, 'utf8'));
const chromePath = process.env.CHROME_PATH;
if (!chromePath) { console.error('CHROME_PATH is required'); process.exit(2); }

const normalize = v => String(v || '').toLowerCase().replace(/[\s·•._\-–—()\[\]{}]/g, '').replace(/[^0-9a-z가-힣]/g, '');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const safeSlug = v => normalize(v).slice(0, 40) || 'keyword';
function kstIso(date = new Date()) { const d = new Date(date.getTime() + 9*60*60*1000); return d.toISOString().replace('Z', '+09:00'); }
function visibleName(v) { const t = String(v || '').replace(/\s+/g, ' ').trim(); return (!t || t.length > 100) ? null : t; }
function mergeNames(target, incoming) { const seen = new Set(target.map(normalize)); for (const raw of incoming || []) { const n = visibleName(raw); const k = normalize(n); if (n && k && !seen.has(k)) { seen.add(k); target.push(n); } } return target; }
function parseCoord(url) { try { const raw = new URL(url).searchParams.get('searchCoord'); if (!raw) return null; const [lon, lat] = raw.split(';').map(Number); return Number.isFinite(lat)&&Number.isFinite(lon) ? {latitude:lat, longitude:lon} : null; } catch { return null; } }
function coordMatches(a, lat, lon) { return !!a && Math.abs(a.latitude-lat)<=0.03 && Math.abs(a.longitude-lon)<=0.03; }
function looksLikePlaceObject(o) { if (!o || typeof o !== 'object' || Array.isArray(o)) return false; const name = visibleName(o.name ?? o.title ?? o.displayName ?? o.businessName); return !!name && !!(o.id||o.placeId||o.businessId||o.roadAddress||o.address||o.category||o.categoryName||o.x||o.y||o.phone); }
function extractNames(payload) {
  const out=[]; const seen=new Set();
  const add=v=>{const n=visibleName(v); if(n) out.push(n);};
  function visit(node, depth=0){ if(depth>12||node==null) return; if(Array.isArray(node)){ for(const item of node){ if(looksLikePlaceObject(item)) add(item.name??item.title??item.displayName??item.businessName); visit(item,depth+1);} return;} if(typeof node!=='object'||seen.has(node)) return; seen.add(node);
    const direct=node?.result?.place?.list; if(Array.isArray(direct)) for(const item of direct) add(item?.name??item?.title);
    for(const [k,v] of Object.entries(node)){ if(['items','list','places'].includes(k)&&Array.isArray(v)){ for(const item of v) if(looksLikePlaceObject(item)) add(item.name??item.title??item.displayName??item.businessName);} visit(v,depth+1); }
  }
  visit(payload); return out;
}
async function detectBlock(page){ const texts=await Promise.all(page.frames().map(async f=>{try{return await f.evaluate(()=>document.body?.innerText?.slice(0,12000)||'');}catch{return '';}})); return /비정상적인 접근|자동입력|captcha|접근이 제한|접속이 제한/i.test(texts.join('\n')); }
async function collectDomPlaceNames(page){
  const names=[];
  for(const frame of page.frames()){
    try{
      const got=await frame.evaluate(()=>{
        const out=[]; const seen=new Set();
        const nodes=[...document.querySelectorAll('a.place_bluelink,a[href*="/p/entry/place/"],a[href*="/entry/place/"],a[href*="/place/"]')];
        for(const node of nodes){ const href=node.getAttribute('href')||''; if(!(/\/place\//.test(href)||/\/entry\/place\//.test(href))) continue; const raw=(node.innerText||node.textContent||'').trim(); const text=raw.split('\n').map(x=>x.trim()).find(Boolean)||''; if(!text||text.length>100) continue; const k=text.toLowerCase().replace(/\s+/g,''); if(!seen.has(k)){seen.add(k);out.push(text);} }
        return out;
      });
      mergeNames(names,got);
    }catch{}
  }
  return names;
}
function createCapture(page){
  const state={names:[],matchedResponses:0,sources:[],searchCoords:[],tasks:[],active:true};
  const handler=response=>{
    if(!state.active) return; const url=response.url(); const all=url.includes('/p/api/search/allSearch'); const gql=url.includes('pcmap-api.place.naver.com/graphql'); if(!all&&!gql) return;
    state.matchedResponses++; if(all){const c=parseCoord(url); if(c) state.searchCoords.push(c);}
    const task=(async()=>{try{ const text=await response.text(); let payload; try{payload=JSON.parse(text);}catch{return;} const incoming=extractNames(payload); if(incoming.length){mergeNames(state.names,incoming); state.sources.push({type:all?'allSearch':'graphql',count:incoming.length,url});} }catch(e){state.sources.push({type:all?'allSearch-error':'graphql-error',count:0,url,error:String(e?.message||e).slice(0,160)});} })(); state.tasks.push(task);
  };
  page.on('response',handler);
  return {state,async stop(){state.active=false;page.off('response',handler);await Promise.allSettled(state.tasks);return state;}};
}
async function findInput(page, timeout=15000){ const sels=['input.input_search','input[type="search"]','input[placeholder*="검색"]','input[aria-label*="검색"]']; const until=Date.now()+timeout; while(Date.now()<until){ for(const f of page.frames()) for(const s of sels){ let hs=[]; try{hs=await f.$$(s);}catch{} for(const h of hs){try{const ok=await h.evaluate(el=>{const r=el.getBoundingClientRect(),st=getComputedStyle(el);return r.width>0&&r.height>0&&st.display!=='none'&&st.visibility!=='hidden';}); if(ok) return h;}catch{} try{await h.dispose();}catch{}} } await sleep(250);} throw new Error('Visible Naver Map search input was not found'); }
async function scrollSearchFrame(page){ const f=page.frames().find(x=>x.name()==='searchIframe')||page.frames().find(x=>x!==page.mainFrame()&&/search|place/.test(x.url())); if(!f) return; try{await f.evaluate(()=>{const el=document.querySelector('#_pcmap_list_scroll_container')||document.querySelector('[role="list"]'); if(el) el.scrollTop=el.scrollHeight; else window.scrollTo(0,document.body.scrollHeight);});}catch{} }
async function scanKeyword(page, keyword, aliases, maxResults, lat, lon){
  await page.setCacheEnabled(false);
  const base=`https://map.naver.com/p?lng=${encodeURIComponent(lon)}&lat=${encodeURIComponent(lat)}&c=15.00,0,0,0,dh`;
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:45000}); await sleep(2200);
  const capture=createCapture(page); const input=await findInput(page); await input.click({clickCount:3}); await page.keyboard.press('Backspace'); await page.keyboard.type(keyword); await page.keyboard.press('Enter'); try{await input.dispose();}catch{} await sleep(5000);
  let blocked=await detectBlock(page); for(let i=0;i<4&&!blocked;i++){await scrollSearchFrame(page); await sleep(900); blocked=await detectBlock(page);} const network=await capture.stop();
  const networkNames=[]; mergeNames(networkNames,network.names); const domNames=await collectDomPlaceNames(page); const names=[]; mergeNames(names,networkNames); mergeNames(names,domNames); const limited=names.slice(0,maxResults);
  const searchCoord=network.searchCoords.at(-1)||null; const locationMatched=coordMatches(searchCoord,lat,lon); const url=page.url()||base;
  if(blocked) return {keyword,rank:null,status:'blocked',resultCount:limited.length,url,searchCoord,locationMatched:false,networkResponses:network.matchedResponses,captureSources:network.sources.slice(0,12)};
  if(!searchCoord) return {keyword,rank:null,status:'unverified',resultCount:limited.length,url,searchCoord:null,locationMatched:false,networkResponses:network.matchedResponses,captureSources:network.sources.slice(0,12),sample:limited.slice(0,12)};
  if(!locationMatched) return {keyword,rank:null,status:'location-mismatch',resultCount:limited.length,url,searchCoord,locationMatched:false,networkResponses:network.matchedResponses,captureSources:network.sources.slice(0,12),sample:limited.slice(0,12)};
  const trustedNames=networkNames.length?networkNames:domNames;
  if(!trustedNames.length) return {keyword,rank:null,status:'unverified',resultCount:0,url,searchCoord,locationMatched:true,networkResponses:network.matchedResponses,captureSources:network.sources.slice(0,12)};
  const a=aliases.map(normalize).filter(Boolean); const idx=trustedNames.slice(0,maxResults).findIndex(name=>{const n=normalize(name);return a.some(x=>n===x||n.includes(x)||x.includes(n));});
  return {keyword,rank:idx>=0?idx+1:null,status:idx>=0?'ok':'not-found',resultCount:Math.min(trustedNames.length,maxResults),url,searchCoord,locationMatched:true,networkResponses:network.matchedResponses,captureSources:network.sources.slice(0,12),sample:trustedNames.slice(0,12)};
}

await fs.mkdir(artifactDir,{recursive:true});
const browser=await puppeteer.launch({executablePath:chromePath,headless:true,args:['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--lang=ko-KR','--window-size=1440,1200']});
const context=browser.defaultBrowserContext(); const location=config.location||{}; const latitude=Number(location.latitude), longitude=Number(location.longitude), accuracy=Number(location.accuracyMeters||40);
if(Number.isFinite(latitude)&&Number.isFinite(longitude)) await context.overridePermissions('https://map.naver.com',['geolocation']);
const page=await browser.newPage(); await page.setViewport({width:1440,height:1200,deviceScaleFactor:1}); await page.setExtraHTTPHeaders({'accept-language':'ko-KR,ko;q=0.9,en;q=0.5'}); if(Number.isFinite(latitude)&&Number.isFinite(longitude)){await page.setGeolocation({latitude,longitude,accuracy}); console.log(`PLACE_RANK_LOCATION lat=${latitude} lon=${longitude} accuracy=${accuracy}`);}
const aliases=[...new Set([config.store.name,...(config.store.aliases||[])])]; const results=[];
try{for(const keyword of config.keywords){try{const r=await scanKeyword(page,keyword,aliases,Number(config.maxResults||50),latitude,longitude);results.push(r);const c=r.searchCoord?`${r.searchCoord.latitude},${r.searchCoord.longitude}`:'NA';console.log(`PLACE_RANK keyword=${JSON.stringify(keyword)} status=${r.status} rank=${r.rank??'NA'} count=${r.resultCount} network=${r.networkResponses??0} searchCoord=${c}`);if(r.status!=='ok') await page.screenshot({path:path.join(artifactDir,`${safeSlug(keyword)}.png`),fullPage:true});}catch(e){const m=e?.message||String(e);results.push({keyword,rank:null,status:'error',resultCount:0,error:m.slice(0,300)});console.error(`PLACE_RANK_ERROR keyword=${JSON.stringify(keyword)} error=${m}`);} await sleep(900);}} finally{await browser.close();}
const checkedAt=kstIso(); const snapshot={date:checkedAt.slice(0,10),checkedAt,source:'naver-map-browser-network-centered-v2',location:{latitude,longitude,accuracyMeters:accuracy,basis:location.basis||config.store.address},results};
const previous=Array.isArray(historyDoc.history)?historyDoc.history:[]; const history=[...previous.filter(x=>x?.date!==snapshot.date),snapshot].slice(-90); const nextDoc={version:'1.4.0',store:config.store.name,generatedAt:checkedAt,history}; await fs.writeFile(historyPath,`${JSON.stringify(nextDoc,null,2)}\n`,'utf8'); await fs.writeFile(generatedPath,`export const placeRankData = ${JSON.stringify(nextDoc,null,2)};\n`,'utf8');
const ok=results.filter(x=>x.status==='ok').length, blocked=results.filter(x=>x.status==='blocked').length, nores=results.filter(x=>x.status==='no-results').length, mismatch=results.filter(x=>x.status==='location-mismatch').length, unverified=results.filter(x=>x.status==='unverified').length, errors=results.filter(x=>x.status==='error').length;
console.log(`PLACE_RANK_COMPLETE checked=${results.length} found=${ok} blocked=${blocked} noResults=${nores} locationMismatch=${mismatch} unverified=${unverified} errors=${errors} generatedAt=${checkedAt}`);
if(blocked===results.length&&results.length) process.exitCode=3; if(mismatch>0) process.exitCode=5; if(errors>0) process.exitCode=6; if((ok+results.filter(x=>x.status==='not-found').length)===0) process.exitCode=7;
