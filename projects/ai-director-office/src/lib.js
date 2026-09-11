export const JSON_HEADERS={"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff","x-frame-options":"DENY","referrer-policy":"no-referrer","permissions-policy":"camera=(), microphone=(), geolocation=()"};
export const HTML_HEADERS={"content-type":"text/html; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff","x-frame-options":"DENY","referrer-policy":"no-referrer","permissions-policy":"camera=(), microphone=(), geolocation=()","content-security-policy":"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"};

export class HttpError extends Error{constructor(status,code,detail){super(code);this.status=status;this.code=code;this.detail=detail;}}
export const json=(data,status=200)=>new Response(JSON.stringify(data,null,2),{status,headers:JSON_HEADERS});
export const html=(body,status=200)=>new Response(body,{status,headers:HTML_HEADERS});
export const nowIso=()=>new Date().toISOString();
export const uid=(prefix)=>`${prefix}_${crypto.randomUUID()}`;
export const academyId=(env)=>env.DEFAULT_ACADEMY_ID||"academy-main";

export async function bodyJson(request){
  const ct=request.headers.get("content-type")||"";
  if(!ct.includes("application/json"))throw new HttpError(415,"JSON_REQUIRED");
  let body;
  try{body=await request.json();}catch{throw new HttpError(400,"INVALID_JSON");}
  if(!body||typeof body!=="object"||Array.isArray(body))throw new HttpError(400,"INVALID_JSON_OBJECT");
  return body;
}
export function requiredString(value,name,max=200){
  if(typeof value!=="string"||!value.trim())throw new HttpError(400,`${name.toUpperCase()}_REQUIRED`);
  const v=value.trim(); if(v.length>max)throw new HttpError(400,`${name.toUpperCase()}_TOO_LONG`); return v;
}
export function optionalString(value,max=1000){
  if(value===undefined||value===null||value==="")return null;
  if(typeof value!=="string")throw new HttpError(400,"INVALID_STRING");
  const v=value.trim(); if(v.length>max)throw new HttpError(400,"STRING_TOO_LONG"); return v;
}
export function numeric(value){
  if(value===null||value===undefined||value==="")return null;
  const n=Number(value); return Number.isFinite(n)?n:null;
}
export function clampNumber(value,min,max){const n=numeric(value);return n===null?null:Math.max(min,Math.min(max,n));}
export function avg(values){const nums=values.filter(v=>Number.isFinite(v));return nums.length?nums.reduce((a,b)=>a+b,0)/nums.length:null;}
export function delta(first,second){return Number.isFinite(first)&&Number.isFinite(second)?second-first:null;}
export const bandFor=(score)=>score>=65?"RED":score>=35?"YELLOW":"GREEN";

function validValues(rows,key){return rows.map(r=>numeric(r[key])).filter(v=>v!==null);}
function meanFor(rows,key){return avg(validValues(rows,key));}
function trendEvidence(prior,recent,key){
  const before=meanFor(prior,key), after=meanFor(recent,key);
  return {before,after,delta:delta(before,after),prior_n:validValues(prior,key).length,recent_n:validValues(recent,key).length};
}

export function riskFromMetrics(rows,daysSinceParentContact=null){
  const sorted=[...rows].sort((a,b)=>String(a.observed_on).localeCompare(String(b.observed_on)));
  const recent=sorted.slice(-8);
  const prior=sorted.slice(Math.max(0,sorted.length-16),Math.max(0,sorted.length-8));
  let score=0; const reasons=[]; const evidence={};

  const attendanceObserved=recent.filter(r=>r.attended!==null&&r.attended!==undefined).length;
  const absences=recent.filter(r=>numeric(r.attended)===0).length;
  evidence.attendance={observed:attendanceObserved,absences};
  if(attendanceObserved>=3){
    if(absences>=3){score+=28;reasons.push(`최근 관찰 구간 결석 ${absences}회`);}
    else if(absences===2){score+=18;reasons.push("최근 관찰 구간 결석 2회");}
    else if(absences===1){score+=7;reasons.push("최근 관찰 구간 결석 1회");}
  }

  const hw=trendEvidence(prior,recent,"homework_pct"); evidence.homework=hw;
  if(hw.prior_n>=3&&hw.recent_n>=3&&hw.delta!==null){
    if(hw.delta<=-20){score+=24;reasons.push(`숙제 수행률 ${Math.round(Math.abs(hw.delta))}%p 하락`);}
    else if(hw.delta<=-10){score+=14;reasons.push(`숙제 수행률 ${Math.round(Math.abs(hw.delta))}%p 하락`);}
  }
  if(hw.recent_n>=3&&hw.after!==null&&hw.after<60){score+=12;reasons.push(`최근 숙제 수행률 ${Math.round(hw.after)}%`);}

  const test=trendEvidence(prior,recent,"test_score"); evidence.test=test;
  if(test.prior_n>=2&&test.recent_n>=2&&test.delta!==null){
    if(test.delta<=-15){score+=16;reasons.push(`테스트 평균 ${Math.round(Math.abs(test.delta))}점 하락`);}
    else if(test.delta<=-8){score+=9;reasons.push(`테스트 평균 ${Math.round(Math.abs(test.delta))}점 하락`);}
  }

  const concentration=trendEvidence(prior,recent,"concentration_score"); evidence.concentration=concentration;
  if(concentration.prior_n>=3&&concentration.recent_n>=3&&concentration.delta!==null){
    if(concentration.delta<=-20){score+=14;reasons.push("집중도 뚜렷한 하락");}
    else if(concentration.delta<=-10){score+=8;reasons.push("집중도 하락");}
  }

  if(Number.isFinite(daysSinceParentContact)){
    evidence.parent_contact_gap_days=daysSinceParentContact;
    if(daysSinceParentContact>=45){score+=12;reasons.push(`학부모 상담 ${daysSinceParentContact}일 이상 공백`);}
    else if(daysSinceParentContact>=30){score+=7;reasons.push(`학부모 상담 ${daysSinceParentContact}일 공백`);}
  }

  score=Math.min(100,score);
  const signalCount=[attendanceObserved>=3,hw.prior_n>=3&&hw.recent_n>=3,test.prior_n>=2&&test.recent_n>=2,concentration.prior_n>=3&&concentration.recent_n>=3,Number.isFinite(daysSinceParentContact)].filter(Boolean).length;
  const confidence=signalCount>=4?"HIGH":signalCount>=2?"MEDIUM":"LOW";
  return {score,band:bandFor(score),confidence,reasons,evidence,observations:sorted.length};
}

export function summarizeMetrics(metrics){
  const asc=[...metrics].sort((a,b)=>String(a.observed_on).localeCompare(String(b.observed_on)));
  const split=Math.ceil(asc.length/2), first=asc.slice(0,split), second=asc.slice(split);
  const dimensions=["homework_pct","test_score","listening_score","reading_score","writing_score","concentration_score"];
  const trends={};
  for(const key of dimensions){
    const before=meanFor(first,key), after=meanFor(second,key);
    trends[key]={previous:before===null?null:Math.round(before*10)/10,recent:after===null?null:Math.round(after*10)/10,delta:before===null||after===null?null:Math.round((after-before)*10)/10,previous_n:validValues(first,key).length,recent_n:validValues(second,key).length};
  }
  const attendanceRows=asc.filter(r=>r.attended!==null&&r.attended!==undefined);
  const attended=attendanceRows.filter(r=>numeric(r.attended)===1).length;
  return {observations:asc.length,attendance_observations:attendanceRows.length,attendance_rate:attendanceRows.length?Math.round(attended/attendanceRows.length*1000)/10:null,trends,teacher_notes:asc.map(r=>r.teacher_note).filter(Boolean).slice(-5)};
}

export function sanitizePublicError(error){
  if(error instanceof HttpError)return {status:error.status,body:{ok:false,error:error.code,detail:error.detail}};
  console.error("AI_OFFICE_ERROR",error?.stack||error);
  return {status:500,body:{ok:false,error:"INTERNAL_ERROR"}};
}
