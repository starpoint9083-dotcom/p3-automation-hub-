export const CLIENT_JS=String.raw`(()=>{
  'use strict';
  const $=id=>document.getElementById(id);
  const csrf=document.querySelector('meta[name="csrf-token"]')?.content||'';
  let latestCampaign=null,currentStudent=null;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const val=id=>($(id)?.value??'').trim();
  const nval=id=>val(id)===''?undefined:Number(val(id));
  const nullableNum=id=>val(id)===''?null:Number(val(id));
  const toast=(text)=>{const t=$('toast');if(!t)return;t.textContent=text;t.classList.add('show');clearTimeout(window.__toastTimer);window.__toastTimer=setTimeout(()=>t.classList.remove('show'),2200)};
  const msg=(id,text,ok=true)=>{const el=$(id);if(!el)return;el.className=ok?'success':'error';el.textContent=text};
  async function api(path,opt={}){
    const method=String(opt.method||'GET').toUpperCase();
    const headers=new Headers(opt.headers||{});
    headers.set('accept','application/json');
    if(!['GET','HEAD','OPTIONS'].includes(method)){headers.set('x-csrf-token',csrf);headers.set('content-type','application/json');}
    const r=await fetch(path,{...opt,headers,cache:'no-store'});
    const d=await r.json().catch(()=>({ok:false,error:'INVALID_RESPONSE'}));
    if(r.status===401){location.replace('/');throw new Error('AUTH_REQUIRED')}
    if(!r.ok||d.ok===false)throw new Error(d.detail||d.error||('HTTP '+r.status));
    return d.data??d;
  }
  const post=(path,body)=>api(path,{method:'POST',body:JSON.stringify(body)});
  function pill(b){const c=b==='RED'?'red':b==='YELLOW'?'yellow':'green';const t=b==='RED'?'위험':b==='YELLOW'?'관심':'안정';return '<span class="pill '+c+'">'+t+'</span>'}
  function riskRow(r,clickable=true){const reason=(r.reasons||[])[0]||'뚜렷한 위험 신호 없음';const student=r.student||{};return '<div class="row" '+(clickable?'data-student="'+esc(student.id)+'" role="button" tabindex="0"':'')+'><div class="rowhead"><b>'+esc(student.name||'학생')+' · '+esc(student.grade||'')+'</b>'+pill(r.band)+'</div><div class="riskline"><div class="meter"><i style="width:'+Math.min(100,Number(r.score||0))+'%"></i></div><span class="muted">'+Number(r.score||0)+' · '+esc(r.confidence||'')+'</span></div><div class="sub">'+esc(reason)+'</div></div>'}
  function today(){return new Date().toISOString().slice(0,10)}
  function monthStart(){const d=new Date();return new Date(d.getFullYear(),d.getMonth(),1).toISOString().slice(0,10)}
  function setView(name){
    document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===name));
    document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id===name));
    if(name==='students')loadRisks();
    if(name==='leads')loadLeads();
    if(name==='recruitment'){loadBrief();loadPerformance();}
    window.scrollTo({top:0,behavior:'smooth'});
  }
  function bindStudentClicks(){document.querySelectorAll('[data-student]').forEach(el=>{const go=()=>openStudent(el.dataset.student);el.onclick=go;el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go();}}})}
  async function health(){try{const h=await api('/health');$('systemStatus').textContent='D1 · Workers AI · 보안 연결 정상 · v'+h.version}catch(e){$('systemStatus').textContent='시스템 연결을 다시 확인해주세요'}}
  async function loadBrief(){
    try{
      const d=await api('/api/briefing'),c=d.counts;
      $('kStudents').textContent=c.students;$('kRisk').textContent=c.risk_red;$('kYellow').textContent=c.risk_yellow;$('kFollow').textContent=c.followups_due;$('kLeads').textContent=c.open_leads;$('kSeats').textContent=c.open_seats??0;
      $('briefTime').textContent='최근 갱신 '+new Date(d.generated_at).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'});
      $('actions').innerHTML=(d.top_actions.length?d.top_actions:[{title:'긴급 작업이 없습니다',detail:'오늘의 학생 변화와 상담 일정을 가볍게 확인하세요.'}]).map((a,i)=>'<div class="action"><div class="rank">'+(i+1)+'</div><div><b>'+esc(a.title)+'</b><div class="sub">'+esc(a.detail||'')+'</div></div></div>').join('');
      $('todayRisks').innerHTML=d.risks.filter(r=>r.band!=='GREEN').slice(0,4).map(r=>riskRow(r)).join('')||'<div class="empty">현재 강한 위험 신호가 없습니다.</div>';
      $('todayFollowups').innerHTML=(d.due_followups||[]).slice(0,5).map(l=>'<div class="row"><div class="rowhead"><b>'+esc(l.child_name)+' · '+esc(l.grade||'')+'</b><span class="pill yellow">'+esc(l.status)+'</span></div><div class="sub">'+esc(l.source||'유입경로 미상')+' · 후속 예정 '+esc(l.followup_due_at||'')+'</div></div>').join('')||'<div class="empty">밀린 후속 상담이 없습니다.</div>';
      $('targetList').innerHTML=(d.recruitment_targets||[]).map(t=>'<div class="row"><div class="rowhead"><b>'+esc(t.segment)+'</b><span class="pill green">'+Number(t.open_seats||0)+'자리</span></div><div class="sub">'+esc(t.program||'과정 전체')+' · 정원 '+Number(t.capacity||0)+' / 현재 '+Number(t.active_students||0)+' · 목표 '+Number(t.desired_new_students||0)+'명</div></div>').join('')||'<div class="empty">모집 자리 설정이 아직 없습니다.</div>';
      bindStudentClicks();window.__AI_OFFICE_DATA_READY__=true;
    }catch(e){$('actions').innerHTML='<div class="empty">브리핑을 불러오지 못했습니다: '+esc(e.message)+'</div>';throw e}
  }
  async function loadRisks(){try{const rows=await api('/api/risks');$('studentRisks').innerHTML=rows.map(r=>riskRow(r)).join('')||'<div class="empty">등록된 학생이 없습니다. 위의 학생 등록 버튼으로 시작하세요.</div>';bindStudentClicks()}catch(e){$('studentRisks').innerHTML='<div class="empty">'+esc(e.message)+'</div>'}}
  async function openStudent(id){try{const d=await api('/api/students/'+encodeURIComponent(id));currentStudent=id;$('studentDetail').style.display='block';$('studentName').textContent=d.student.name+' 성장카드';const t=d.summary.trends,names={homework_pct:'숙제',test_score:'테스트',listening_score:'듣기',reading_score:'읽기',writing_score:'쓰기',concentration_score:'집중도'};$('studentCard').innerHTML='<div class="metricline"><span>과정</span><b>'+esc(d.student.program)+'</b></div><div class="metricline"><span>위험 신호</span><b>'+d.risk.score+' · '+esc(d.risk.confidence)+'</b></div><div class="metricline"><span>출석률</span><b>'+(d.summary.attendance_rate??'-')+'%</b></div>'+Object.entries(t).map(([k,v])=>'<div class="metricline"><span>'+names[k]+'</span><b>'+(v.recent??'-')+(v.delta===null?'':(' ('+(v.delta>0?'+':'')+v.delta+')'))+'</b></div>').join('')+'<div class="sub" style="margin-top:12px">근거: '+esc((d.risk.reasons||[]).join(' · ')||'뚜렷한 위험 신호 없음')+'</div>';$('studentDetail').scrollIntoView({behavior:'smooth',block:'start'})}catch(e){toast('학생카드를 불러오지 못했습니다: '+e.message)}}
  async function loadLeads(){try{const rows=await api('/api/leads');$('leadList').innerHTML=rows.filter(l=>!['ENROLLED','LOST'].includes(l.status)).map(l=>'<div class="row"><div class="rowhead"><b>'+esc(l.child_name)+' · '+esc(l.grade||'')+'</b><span class="pill '+(l.status==='NEW'?'yellow':'green')+'">'+esc(l.status)+'</span></div><div class="sub">목표: '+esc(l.goal||'미입력')+'<br>유입: '+esc(l.source||'미상')+' · 후속: '+esc(l.followup_due_at||'미정')+'</div><div class="stagebar" data-lead="'+esc(l.id)+'">'+['CONTACTED','CONSULTED','TRIAL','ENROLLED','LOST'].map(s=>'<button type="button" data-stage="'+s+'" class="'+(l.status===s?'active':'')+'">'+({CONTACTED:'연락',CONSULTED:'상담',TRIAL:'체험',ENROLLED:'등록',LOST:'종료'}[s])+'</button>').join('')+'</div></div>').join('')||'<div class="empty">진행 중인 상담이 없습니다.</div>';document.querySelectorAll('.stagebar button').forEach(b=>b.onclick=()=>changeLead(b.closest('.stagebar').dataset.lead,b.dataset.stage))}catch(e){$('leadList').innerHTML='<div class="empty">'+esc(e.message)+'</div>'}}
  async function loadPerformance(){try{const d=await api('/api/recruitment/performance'),latest=d.campaigns?.[0];$('performance').innerHTML=latest?'<div class="metricline"><span>최근 캠페인</span><b>'+esc(latest.target_segment)+'</b></div><div class="metricline"><span>문의</span><b>'+latest.inquiries+'</b></div><div class="metricline"><span>상담</span><b>'+latest.consultations+' ('+latest.consultation_rate+'%)</b></div><div class="metricline"><span>등록</span><b>'+latest.enrollments+' ('+latest.enrollment_rate+'%)</b></div><div class="metricline"><span>목표 달성</span><b>'+latest.goal_progress+'%</b></div>':'<div class="empty">아직 측정할 캠페인이 없습니다.</div>'}catch(e){$('performance').innerHTML='<div class="empty">'+esc(e.message)+'</div>'}}
  async function changeLead(id,status){try{let due=null;if(!['ENROLLED','LOST'].includes(status)){const d=new Date();d.setDate(d.getDate()+(status==='CONTACTED'?1:status==='CONSULTED'?3:7));due=d.toISOString()}await post('/api/leads/'+encodeURIComponent(id)+'/stage',{status,followup_due_at:due,channel:'AI 원장실'});toast('상담 단계가 변경됐습니다.');await Promise.all([loadLeads(),loadBrief(),loadPerformance()])}catch(e){toast('변경 실패: '+e.message)}}
  function bind(){
    document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
    document.querySelectorAll('[data-jump]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.jump)));
    document.querySelectorAll('[data-toggle]').forEach(b=>b.addEventListener('click',()=>$(b.dataset.toggle)?.classList.toggle('open')));
    $('refreshAll').onclick=async()=>{toast('새로고침 중…');await Promise.allSettled([health(),loadBrief(),loadRisks(),loadLeads(),loadPerformance()]);toast('최신 상태로 갱신했습니다.')};
    $('logout').onclick=async()=>{try{await post('/auth/logout',{});}catch{}location.replace('/')};
    $('refreshStudents').onclick=()=>loadRisks();
    $('closeStudent').onclick=()=>{$('studentDetail').style.display='none';currentStudent=null};
    $('createStudent').onclick=async()=>{try{const d=await post('/api/students',{name:val('sName'),grade:val('sGrade'),program:val('sProgram'),enrolled_at:val('sEnrolled'),notes:val('sNotes')||undefined});msg('studentCreateMsg','학생 등록 완료');$('sName').value='';$('sGrade').value='';$('sNotes').value='';await Promise.all([loadRisks(),loadBrief()]);toast('학생이 등록됐습니다.')}catch(e){msg('studentCreateMsg',e.message,false)}};
    $('saveMetric').onclick=async()=>{if(!currentStudent)return;try{await post('/api/students/'+encodeURIComponent(currentStudent)+'/metrics',{observed_on:val('mDate'),attended:val('mAttend')===''?null:val('mAttend')==='1',homework_pct:nullableNum('mHomework'),test_score:nullableNum('mTest'),listening_score:nullableNum('mListening'),reading_score:nullableNum('mReading'),writing_score:nullableNum('mWriting'),concentration_score:nullableNum('mConcentration'),teacher_note:val('mNote')||undefined});msg('metricMsg','학습기록 저장 완료');await Promise.all([openStudent(currentStudent),loadRisks(),loadBrief()])}catch(e){msg('metricMsg',e.message,false)}};
    $('makeReport').onclick=async()=>{if(!currentStudent)return;const b=$('makeReport');b.disabled=true;b.textContent='AI가 보고서를 작성 중…';$('reportResult').style.display='block';$('reportResult').textContent='관찰 데이터를 정리하고 있습니다.';try{const d=await post('/api/growth-report',{student_id:currentStudent,period_start:val('rStart'),period_end:val('rEnd')});$('reportResult').textContent=d.report_text}catch(e){$('reportResult').textContent='생성 실패: '+e.message}finally{b.disabled=false;b.textContent='성장보고서 만들기'}};
    $('createLead').onclick=async()=>{try{const due=val('lDue');await post('/api/leads',{child_name:val('lName'),grade:val('lGrade')||undefined,english_experience:val('lExperience')||undefined,reading_level:val('lReading')||undefined,goal:val('lGoal')||undefined,available_days:val('lDays')||undefined,source:val('lSource'),followup_due_at:due?new Date(due).toISOString():undefined});msg('leadCreateMsg','신규 문의 등록 완료');['lName','lGrade','lExperience','lReading','lGoal','lDays','lDue'].forEach(id=>$(id).value='');await Promise.all([loadLeads(),loadBrief()]);toast('신규 상담이 등록됐습니다.')}catch(e){msg('leadCreateMsg',e.message,false)}};
    $('saveTarget').onclick=async()=>{try{const d=await post('/api/recruitment/targets',{segment:val('tSegment'),program:val('tProgram'),capacity:nval('tCapacity'),active_students:nval('tActive'),desired_new_students:nval('tDesired'),priority:nval('tPriority')});msg('targetMsg','빈자리 저장 완료 · 현재 '+d.open_seats+'자리');$('tSegment').value='';await Promise.all([loadBrief(),loadPerformance()])}catch(e){msg('targetMsg',e.message,false)}};
    $('makePlan').onclick=async()=>{const btn=$('makePlan');btn.disabled=true;btn.textContent='AI 모집실장이 분석 중…';$('planResult').style.display='block';$('planResult').textContent='빈자리와 기존 유입 흐름을 분석하고 있습니다.';try{const channels=val('channels').split(',').map(s=>s.trim()).filter(Boolean);const d=await post('/api/recruitment/plan',{goal_students:Number(val('goalStudents')||5),target_segment:val('targetSegment')||undefined,channels});latestCampaign=d.id;$('planResult').textContent=d.plan_text;$('contentMaker').style.display='block';await loadPerformance();toast('모집계획이 완성됐습니다.')}catch(e){$('planResult').textContent='생성 실패: '+e.message}finally{btn.disabled=false;btn.textContent='AI 모집계획 만들기'}};
    $('makeContent').onclick=async()=>{if(!latestCampaign)return;const btn=$('makeContent');btn.disabled=true;btn.textContent='채널 초안 제작 중…';try{const d=await post('/api/recruitment/content',{campaign_id:latestCampaign,channel:val('contentChannel'),purpose:val('contentPurpose')});$('contentResult').style.display='block';$('contentResult').textContent=d.body+'\n\n추적코드: '+d.tracking_code}catch(e){$('contentResult').style.display='block';$('contentResult').textContent='생성 실패: '+e.message}finally{btn.disabled=false;btn.textContent='게시 초안 만들기'}};
  }
  $('sEnrolled').value=today();$('mDate').value=today();$('rStart').value=monthStart();$('rEnd').value=today();
  bind();window.__AI_OFFICE_READY__=true;document.documentElement.dataset.appReady='true';
  Promise.allSettled([health(),loadBrief()]).then(()=>{if(!window.__AI_OFFICE_DATA_READY__)console.warn('AI_OFFICE_DATA_NOT_READY')});
})();`;
