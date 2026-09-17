import {appHtml as v7Html} from './ui-v7.js';

function reorderRecruitment(html){
  const videoStart=html.indexOf('<div class="card" id="videoMakerCard">');
  const channelStart=html.indexOf('<div class="card"><div class="titleRow"><h3>7. 채널별 홍보물</h3>');
  const publishStart=html.indexOf('<div class="card"><div class="titleRow"><h3>8. 게시 준비 현황</h3>');
  if(videoStart<0||channelStart<0||publishStart<0||!(videoStart<channelStart&&channelStart<publishStart))throw new Error('FRIENDLY_RECRUITMENT_ORDER_MARKER_MISSING');
  let before=html.slice(0,videoStart);
  let video=html.slice(videoStart,channelStart);
  let channels=html.slice(channelStart,publishStart);
  let after=html.slice(publishStart);
  channels=channels
    .replace('<h3>7. 채널별 홍보물</h3><small>쇼츠·릴스·블로그·당근 각각 별도 제작</small>','<h3>6. 먼저 내용 만들기</h3><small>원하는 채널을 골라 내용을 먼저 준비해요</small>');
  video=video
    .replace('<h3>6. 완성영상 만들기</h3><small>쇼츠·릴스 각각 별도 제작</small>','<h3>7. 영상 만들기</h3><small>쇼츠와 릴스는 여기서 영상으로 완성해요</small>');
  after=after.replace('<h3>8. 게시 준비 현황</h3>','<h3>8. 확인하고 올리기</h3>');
  return before+channels+video+after;
}

export function appHtml(){
  let html=v7Html();
  html=reorderRecruitment(html);
  const replacements=[
    ['<small>뮤엠영어 × 노피곰 운영 AI</small>','<small class="brandline"><span class="brandchip muem">MU:M ENGLISH</span><span class="brandchip nopigom">한솔 노피곰</span></small>'],
    ['<div class="ey">DIRECTOR COMMAND CENTER</div>','<div class="ey">오늘도 편안하게 시작해요</div>'],
    ['<h1>원장님은 결정만.<br>AI가 먼저 찾아서 움직입니다.</h1>','<h1>오늘 필요한 일만<br>한눈에 편하게 볼게요.</h1>'],
    ['<p>학생 변화, 상담 후속, 빈자리와 홍보까지 한 흐름으로 연결합니다.</p>','<p>학생 관리부터 상담, 홍보까지 AI가 차근차근 도와드려요.</p>'],
    ['data-view="recruitment">모집실장</button>','data-view="recruitment">홍보·모집</button>'],
    ['<div class="label">퇴원 위험</div>','<div class="label">먼저 살펴볼 학생</div>'],
    ['<div class="label">후속 상담</div>','<div class="label">다시 연락할 상담</div>'],
    ['<div class="label">열린 문의</div>','<div class="label">새 문의</div>'],
    ['<div class="label">모집 가능 자리</div>','<div class="label">더 받을 수 있는 자리</div>'],
    ['<div class="label">관심 필요</div>','<div class="label">조금 더 살펴보기</div>'],
    ['<h3>오늘 가장 먼저 할 일 3가지</h3><small>AI 우선순위</small>','<h3>오늘 먼저 보면 좋은 3가지</h3><small>AI가 골랐어요</small>'],
    ['<h2>학생 성장관리</h2><p>성장 변화와 퇴원 위험 신호를 근거로 봅니다.</p>','<h2>학생 살펴보기</h2><p>출석·숙제·테스트 기록을 모아 학생의 흐름을 편하게 살펴봐요.</p>'],
    ['<h3>학생 위험 신호</h3>','<h3>조금 더 살펴볼 학생</h3>'],
    ['<h3>월간 성장보고서</h3><small>학습기록 근거만 사용 · 학부모용 초안</small>','<h3>학부모 성장보고서</h3><small>기록을 바탕으로 부모님께 전할 내용을 부드럽게 정리해요</small>'],
    ['성장보고서 초안 만들기','보고서 내용 만들기'],
    ['<h2>신규 상담</h2><p>문의부터 등록까지 놓치지 않고 추적합니다.</p>','<h2>상담 관리</h2><p>새 문의부터 등록까지 놓치지 않게 차근차근 정리해요.</p>'],
    ['<h2>AI 홍보·모집실장</h2><p>빈자리를 보고 주간 편성을 먼저 결정한 뒤 유튜브·네이버·인스타·당근용 이미지·영상기획·글을 제작합니다.</p>','<h2>AI 홍보·모집</h2><p>이번 주에 누구를 모집할지 정하고, 필요한 글과 영상을 순서대로 만들어드려요.</p>'],
    ['1. 학원 홍보 기본정보','1. 학원 기본정보'],
    ['2. 이번 주 모집작전','2. 이번 주 모집 목표'],
    ['3. 원장님에게 필요한 정보','3. 더 있으면 좋은 정보'],
    ['4. 이번 주 제작물','4. 이번 주 홍보 계획'],
    ['5. 이미지·장면 제작실','5. 사진·동영상 보관함'],
    ['갤러리 + AI 원장실 내장형 P1 콘텐츠 엔진','휴대폰 사진·동영상을 가져와 계속 재사용해요'],
    ['AI 원장실 내장형 P1 콘텐츠 엔진','필요한 사진과 영상을 모아두는 곳이에요'],
    ['홍보정보 저장','학원 정보 저장'],
    ['이번 주 홍보작전 짜기','이번 주 홍보 계획 만들기'],
    ['이번 주 제작 전체 시작','이번 주 홍보물 한 번에 만들기'],
    ['휴대폰 갤러리 사진·동영상 가져오기','휴대폰 사진·동영상 가져오기'],
    ['유튜브 쇼츠 패키지 만들기','유튜브 쇼츠 내용 만들기'],
    ['릴스 제작패키지 만들기','인스타 릴스 내용 만들기'],
    ['블로그 완성본 만들기','네이버 블로그 글 만들기'],
    ['당근 완성본 만들기','당근 홍보글 만들기'],
    ['쇼츠 완성영상 만들기','유튜브 쇼츠 영상 만들기'],
    ['릴스 완성영상 만들기','인스타 릴스 영상 만들기'],
    ['45~60초 · 1080×1920 · 쇼츠 전용 안전영역','45~60초 세로영상 · 글자가 버튼에 안 겹치게 자동 정리'],
    ['30~45초 · 1080×1920 · 릴스 전용 안전영역','30~45초 세로영상 · 인스타 화면에 맞게 자동 정리'],
    ['오른쪽 좋아요·댓글 버튼과 하단 설명 영역을 피해 제목·자막·상담 CTA를 자동 배치합니다.','좋아요·댓글 버튼에 글자가 가리지 않게 자동으로 자리를 잡아줘요.'],
    ['상단 계정 UI, 오른쪽 액션 버튼, 하단 캡션·음원 영역을 피해 글자를 자동 배치합니다.','인스타 버튼과 설명에 글자가 겹치지 않게 자동으로 정리해요.'],
    ['5번 제작실의 학원 사진·동영상을 우선 사용합니다. 부족한 장면만 AI 자산을 사용하고, TTS·자막·전환·배경음까지 합쳐 완성파일을 만듭니다.','5번에 넣어둔 학원 사진·동영상을 먼저 사용해요. 음성·자막·음악까지 붙여 완성 영상으로 만들어드려요.'],
    ['같은 글 복붙 금지','채널마다 알맞게 따로 만들어요']
  ];
  for(const [from,to] of replacements)html=html.replaceAll(from,to);
  html=html.replace('</style>',`
:root{--ink:#403441;--muted:#857684;--line:#eadfe7;--card:#fffefd;--violet:#9a78c9;--soft:#f7f0fb;--green:#4f8f78;--greenSoft:#eef8f3;--red:#c45f71;--redSoft:#fff1f4;--amber:#b57b45;--amberSoft:#fff6ea;--shadow:0 12px 34px rgba(103,76,105,.09)}
body{background:linear-gradient(180deg,#fffaf7 0%,#faf6fb 48%,#f7f4fa 100%)}
.shell{max-width:1080px}.top{margin-bottom:14px}.brand{gap:11px}.logo{background:linear-gradient(145deg,#a982c9,#d49bb7);box-shadow:0 8px 20px rgba(154,120,201,.22)}.brand b{color:#443548}.brandline{display:flex!important;gap:6px;flex-wrap:wrap;margin-top:5px!important}.brandchip{display:inline-flex;align-items:center;padding:4px 8px;border-radius:999px;font-size:9px;font-weight:900;letter-spacing:.02em}.brandchip.muem{background:#fff0b8;color:#6d5620;border:1px solid #f2df91}.brandchip.nopigom{background:#edf8ef;color:#3f7852;border:1px solid #cfe7d5}
.hero{background:linear-gradient(135deg,#fff3ee 0%,#faf3ff 54%,#eef8f3 100%);border-color:#eadde8;box-shadow:0 16px 38px rgba(107,78,111,.07)}.hero .ey{color:#9a6fb5;letter-spacing:.03em}.hero h1{color:#463648}.hero p{color:#746576}
.card{background:rgba(255,254,253,.96);border-color:#eadfe7;box-shadow:0 10px 28px rgba(107,78,111,.07)}.primary{background:linear-gradient(135deg,#9a78c9,#c986a9);box-shadow:0 8px 20px rgba(154,120,201,.2)}.secondary{border-color:#e5d9e3;background:#fffafc;color:#68586a}.ghost{background:#f8f1f7;color:#715f72}.nav button.active{background:linear-gradient(135deg,#9a78c9,#c986a9);border-color:transparent}.plan{background:#fcf7fb;border-color:#eadcea}.empty{background:#fdf9fb}.checkrow label{background:#fffafc!important;border-color:#eadfe7!important}.uploadbox{background:#fffafc!important;border-color:#ddcadb!important}.channel,.need,.row,.asset{border-color:#eadfe7}.safeHint{background:#faf3f8!important;color:#796979!important}.mobilebar{background:rgba(255,251,253,.96);border-color:#e9dfe7}.mobilebar button.active{background:#f5eafb;color:#8a68ad}.toast{background:#4b3d4d}
@media(max-width:680px){.hero{border-radius:22px}.hero h1{font-size:25px}.card{border-radius:18px}.brandline{max-width:230px}.brandchip{font-size:8px}}
</style>`);
  if(!html.includes('유튜브 쇼츠 내용 만들기')||!html.includes('인스타 릴스 내용 만들기')||!html.includes('오늘도 편안하게 시작해요'))throw new Error('FRIENDLY_UI_PATCH_MISSING');
  return html;
}
