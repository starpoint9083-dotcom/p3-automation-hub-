import {bodyJson,HttpError,JSON_HEADERS} from './lib.js';

const COOKIE_NAME='__Host-aiod_session';
const SESSION_SECONDS=12*60*60;
const MAX_SECRET_INPUT=512;
const enc=new TextEncoder();

export const isAuthConfigured=(env)=>typeof env.ADMIN_PASSWORD==='string'&&env.ADMIN_PASSWORD.length>=12;

function secureEqual(a,b){
  const left=String(a??''),right=String(b??'');
  if(left.length>MAX_SECRET_INPUT||right.length>MAX_SECRET_INPUT)return false;
  const aa=enc.encode(left),bb=enc.encode(right);
  let diff=aa.length^bb.length;
  const n=Math.max(aa.length,bb.length,1);
  for(let i=0;i<n;i++)diff|=(aa[i]??0)^(bb[i]??0);
  return diff===0;
}
function b64u(bytes){let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function unb64u(value){const s=value.replace(/-/g,'+').replace(/_/g,'/');const padded=s+'='.repeat((4-s.length%4)%4);const raw=atob(padded);return Uint8Array.from(raw,c=>c.charCodeAt(0));}
async function hmacKey(secret){return crypto.subtle.importKey('raw',enc.encode(`AIOD_SESSION_V1:${secret}`),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
function cookieValue(request){
  const raw=request.headers.get('cookie')||'';
  for(const part of raw.split(';')){const [k,...rest]=part.trim().split('=');if(k===COOKIE_NAME)return rest.join('=');}
  return null;
}
function sameOrigin(request){const origin=request.headers.get('origin');return !origin||origin===new URL(request.url).origin;}
function jsonWithHeaders(body,status=200,extra={}){const headers=new Headers(JSON_HEADERS);for(const [k,v] of Object.entries(extra))headers.set(k,v);return new Response(JSON.stringify(body,null,2),{status,headers});}

export async function createSessionToken(env){
  if(!isAuthConfigured(env))throw new HttpError(503,'AUTH_SETUP_REQUIRED');
  const payload={v:1,exp:Math.floor(Date.now()/1000)+SESSION_SECONDS,csrf:b64u(crypto.getRandomValues(new Uint8Array(24))),nonce:b64u(crypto.getRandomValues(new Uint8Array(16)))};
  const body=b64u(enc.encode(JSON.stringify(payload)));
  const key=await hmacKey(env.ADMIN_PASSWORD);
  const sig=b64u(new Uint8Array(await crypto.subtle.sign('HMAC',key,enc.encode(body))));
  return {token:`${body}.${sig}`,payload};
}

export async function verifySessionToken(env,token){
  if(!isAuthConfigured(env)||typeof token!=='string')return null;
  const [body,sig,...rest]=token.split('.');
  if(!body||!sig||rest.length)return null;
  try{
    const key=await hmacKey(env.ADMIN_PASSWORD);
    const ok=await crypto.subtle.verify('HMAC',key,unb64u(sig),enc.encode(body));
    if(!ok)return null;
    const payload=JSON.parse(new TextDecoder().decode(unb64u(body)));
    if(payload?.v!==1||!Number.isFinite(payload?.exp)||payload.exp<=Math.floor(Date.now()/1000)||typeof payload?.csrf!=='string')return null;
    return payload;
  }catch{return null;}
}

export async function authState(request,env){
  const configured=isAuthConfigured(env);
  if(!configured)return {configured:false,authenticated:false,csrf:null};
  const session=await verifySessionToken(env,cookieValue(request));
  return {configured:true,authenticated:Boolean(session),csrf:session?.csrf||null};
}

export async function login(request,env){
  if(!isAuthConfigured(env))throw new HttpError(503,'AUTH_SETUP_REQUIRED','관리자 비밀키 연결이 필요합니다.');
  if(!sameOrigin(request))throw new HttpError(403,'ORIGIN_REJECTED');
  const body=await bodyJson(request);
  const supplied=typeof body.password==='string'?body.password:'';
  if(supplied.length>MAX_SECRET_INPUT||!secureEqual(supplied,env.ADMIN_PASSWORD))throw new HttpError(401,'INVALID_CREDENTIALS','비밀번호를 확인해주세요.');
  const {token,payload}=await createSessionToken(env);
  const cookie=`${COOKIE_NAME}=${token}; Path=/; Max-Age=${SESSION_SECONDS}; HttpOnly; Secure; SameSite=Strict`;
  return jsonWithHeaders({ok:true,data:{authenticated:true,csrf:payload.csrf,expires_at:new Date(payload.exp*1000).toISOString()}},200,{'set-cookie':cookie});
}

export function logout(){
  return jsonWithHeaders({ok:true,data:{authenticated:false}},200,{'set-cookie':`${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`});
}

export async function requireAdmin(request,env,{mutation=false}={}){
  if(!isAuthConfigured(env))throw new HttpError(503,'AUTH_SETUP_REQUIRED','관리자 비밀키 연결이 필요합니다.');
  const session=await verifySessionToken(env,cookieValue(request));
  if(!session)throw new HttpError(401,'AUTH_REQUIRED');
  if(mutation){
    if(!sameOrigin(request))throw new HttpError(403,'ORIGIN_REJECTED');
    const csrf=request.headers.get('x-csrf-token')||'';
    if(!secureEqual(csrf,session.csrf))throw new HttpError(403,'CSRF_REJECTED');
  }
  return session;
}
