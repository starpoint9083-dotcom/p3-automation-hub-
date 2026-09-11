import { riskFromMetrics, summarizeMetrics } from "../src/lib.js";
function assert(cond,msg){if(!cond) throw new Error(msg);}
const stable=Array.from({length:12},(_,i)=>({observed_on:`2026-08-${String(i+1).padStart(2,"0")}`,attended:1,homework_pct:90,test_score:85,concentration_score:85}));
const r1=riskFromMetrics(stable,10);
assert(r1.band==="GREEN","stable student should be GREEN");
assert(r1.confidence==="HIGH","stable sample should have high confidence");
const slipping=[
 ...Array.from({length:8},(_,i)=>({observed_on:`2026-07-${String(i+1).padStart(2,"0")}`,attended:1,homework_pct:92,test_score:86,concentration_score:85})),
 ...Array.from({length:8},(_,i)=>({observed_on:`2026-08-${String(i+1).padStart(2,"0")}`,attended:i<3?0:1,homework_pct:55,test_score:67,concentration_score:55}))
];
const r2=riskFromMetrics(slipping,50);
assert(r2.band==="RED","slipping student should be RED");
assert(r2.reasons.length>=3,"risk reasons must be explainable");
assert(r2.confidence==="HIGH","multi-signal decline should be high confidence");
const sparse=[
 {observed_on:"2026-08-01",attended:null,homework_pct:null,test_score:null,concentration_score:null},
 {observed_on:"2026-08-02",attended:1,homework_pct:null,test_score:null,concentration_score:null}
];
const r3=riskFromMetrics(sparse,null);
assert(r3.score===0,"missing values must never become zero-score risk signals");
assert(r3.band==="GREEN","sparse missing data should not create false risk");
assert(r3.confidence==="LOW","sparse data must carry low confidence");
const s=summarizeMetrics(sparse);
assert(s.attendance_rate===100,"only observed attendance should count");
assert(s.trends.homework_pct.recent===null,"missing homework must stay null");
console.log(JSON.stringify({ok:true,stable:r1,decline:r2,sparse:r3,summary:s},null,2));
