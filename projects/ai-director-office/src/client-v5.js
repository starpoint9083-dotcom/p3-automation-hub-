import {CLIENT_JS as V4} from './client-v4.js';

export const CLIENT_JS=V4
  .replace(" $('refreshStudents').onclick=loadRisks;", " if($('startProduction'))$('startProduction').onclick=startProduction;\n $('refreshStudents').onclick=()=>busy($('refreshStudents'),'갱신 중…',async()=>{await Promise.allSettled([loadRisks(),loadBrief()]);toast('학생 위험 신호를 방금 갱신했습니다.')});")
  .replace("catch(e){msg('productionStatus',friendly(e),false)}finally{b.disabled=false;b.textContent='이번 주 제작 전체 시작'}", "catch(e){const box=$('productionStatus');if(box)box.style.display='block';msg('productionStatus',friendly(e),false)}finally{b.disabled=false;b.textContent='이번 주 제작 전체 시작'}");
