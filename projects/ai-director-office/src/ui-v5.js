import {appHtml as v4Html} from './ui-v4.js';

const MARKER='<div class="list" id="studentRisks"><div class="empty">불러오는 중…</div></div></div></section>\n<section id="leads"';
const REPORT_CARD='<div class="list" id="studentRisks"><div class="empty">불러오는 중…</div></div></div><div class="card" id="growthReportCard"><div class="titleRow"><div><h3>월간 성장보고서</h3><small>학습기록 근거만 사용 · 학부모용 초안</small></div><button class="ghost" id="refreshGrowthReports" type="button">새로고침</button></div><div class="grid3"><div><label>학생</label><select id="reportStudent"><option value="">학생을 선택해주세요</option></select></div><div><label>기간 시작</label><input id="reportStart" type="date"></div><div><label>기간 종료</label><input id="reportEnd" type="date"></div></div><button class="primary" id="generateGrowthReport" type="button">성장보고서 초안 만들기</button><div id="growthReportMsg"></div><div style="height:10px"></div><div class="titleRow"><h3>최근 보고서</h3><small>초안 → 승인완료</small></div><div class="list" id="growthReportList"><div class="empty">불러오는 중…</div></div></div></section>\n<section id="leads"';

export function appHtml(){
  const html=v4Html();
  const out=html.replace(MARKER,REPORT_CARD);
  if(out===html)throw new Error('GROWTH_REPORT_UI_PATCH_MISSING');
  return out;
}
