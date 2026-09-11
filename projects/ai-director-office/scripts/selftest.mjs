import { riskFromMetrics, summarizeMetrics } from "../src/index.js";
function assert(cond,msg){if(!cond) throw new Error(msg);}
const stable = Array.from({length:12},(_,i)=>({observed_on:`2026-08-${String(i+1).padStart(2,"0")}`,attended:1,homework_pct:90,test_score:85,concentration_score:85}));
const r1=riskFromMetrics(stable,10);
assert(r1.band==="GREEN","stable student should be GREEN");
const slipping=[
 ...Array.from({length:8},(_,i)=>({observed_on:`2026-07-${String(i+1).padStart(2,"0")}`,attended:1,homework_pct:92,test_score:86,concentration_score:85})),
 ...Array.from({length:8},(_,i)=>({observed_on:`2026-08-${String(i+1).padStart(2,"0")}`,attended:i<3?0:1,homework_pct:55,test_score:67,concentration_score:55}))
];
const r2=riskFromMetrics(slipping,50);
assert(r2.band==="RED","slipping student should be RED");
assert(r2.reasons.length>=3,"risk reasons must be explainable");
const s=summarizeMetrics(stable);
assert(s.attendance_rate===100,"attendance summary");
console.log(JSON.stringify({ok:true,green:r1,red:r2,summary:s},null,2));
