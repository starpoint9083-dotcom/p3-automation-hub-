import {appHtml as v6Html} from './ui-v6.js';

const MARKER='<div class="card"><div class="titleRow"><h3>6. 채널별 홍보물</h3><small>같은 글 복붙 금지</small></div>';
const VIDEO_CARD='<div class="card" id="videoMakerCard"><div class="titleRow"><h3>6. 완성영상 만들기</h3><small>쇼츠·릴스 각각 별도 제작</small></div><div class="videoChoice"><div class="videoPlatform"><b>유튜브 쇼츠</b><div class="sub">45~60초 · 1080×1920 · 쇼츠 전용 안전영역</div><button class="primary videoMakeBtn" id="makeShortsVideo" type="button">쇼츠 완성영상 만들기</button><div class="safeHint">오른쪽 좋아요·댓글 버튼과 하단 설명 영역을 피해 제목·자막·상담 CTA를 자동 배치합니다.</div></div><div class="videoPlatform"><b>인스타 릴스</b><div class="sub">30~45초 · 1080×1920 · 릴스 전용 안전영역</div><button class="primary videoMakeBtn" id="makeReelsVideo" type="button">릴스 완성영상 만들기</button><div class="safeHint">상단 계정 UI, 오른쪽 액션 버튼, 하단 캡션·음원 영역을 피해 글자를 자동 배치합니다.</div></div></div><div class="sub videoHint">5번 제작실의 학원 사진·동영상을 우선 사용합니다. 부족한 장면만 AI 자산을 사용하고, TTS·자막·전환·배경음까지 합쳐 완성파일을 만듭니다.</div><div id="videoRenderStatus" class="plan" style="display:none" aria-live="polite"></div><video id="videoPreview" controls playsinline style="display:none" preload="metadata"></video><a id="videoSave" class="secondary videoSave" style="display:none" download>완성영상 저장</a></div>';

export function appHtml(){
  let html=v6Html();
  html=html
    .replace('id="chInstagram" checked> 인스타그램</label>','id="chInstagram" checked> 인스타 릴스</label>')
    .replace('<option value="INSTAGRAM">인스타그램</option>','<option value="INSTAGRAM">인스타 릴스</option>')
    .replace('<div class="channel"><b>인스타그램</b><div class="sub">카드뉴스 문구 + 캡션 + 상담 CTA</div><button class="secondary" data-make-post="INSTAGRAM">인스타 완성본 만들기</button></div>', '<div class="channel"><b>인스타 릴스</b><div class="sub">첫 1~2초 훅 + 30~45초 대본 + 장면표 + 캡션 + 해시태그</div><button class="secondary" data-make-post="INSTAGRAM">릴스 제작패키지 만들기</button></div>');
  const out=html.replace(MARKER,VIDEO_CARD+'<div class="card"><div class="titleRow"><h3>7. 채널별 홍보물</h3><small>쇼츠·릴스·블로그·당근 각각 별도 제작</small></div>');
  if(out===html)throw new Error('VIDEO_MAKER_UI_PATCH_MISSING');
  html=out.replace('<h3>7. 게시 준비 현황</h3>','<h3>8. 게시 준비 현황</h3>');
  html=html.replace('</style>',`.videoChoice{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}.videoPlatform{border:1px solid var(--line);border-radius:15px;padding:12px;background:#fbfcff}.videoPlatform>b{display:block;font-size:15px}.videoMakeBtn{margin-top:10px}.safeHint{font-size:10px;line-height:1.45;color:#737d91;margin-top:8px;padding:8px;border-radius:10px;background:#f1f4ff}.videoHint{margin-top:11px}.videoSave{display:block;text-align:center;text-decoration:none;margin-top:10px}.videoSave:hover{text-decoration:none}#videoPreview{width:min(100%,360px);aspect-ratio:9/16;object-fit:contain;background:#10131a;border-radius:16px;margin:12px auto 0}@media(max-width:680px){.videoChoice{grid-template-columns:1fr}.videoMakeBtn{width:100%}}</style>`);
  if(!html.includes('쇼츠 완성영상 만들기')||!html.includes('릴스 완성영상 만들기')||!html.includes('인스타 릴스'))throw new Error('VIDEO_CHANNEL_SEPARATION_MISSING');
  return html;
}
