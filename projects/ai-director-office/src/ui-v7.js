import {appHtml as v6Html} from './ui-v6.js';

const MARKER='<div class="card"><div class="titleRow"><h3>6. 채널별 홍보물</h3><small>같은 글 복붙 금지</small></div>';
const VIDEO_CARD='<div class="card" id="videoMakerCard"><div class="titleRow"><h3>6. 완성영상 만들기</h3><small>9:16 · 안전구역 자동 적용</small></div><div class="videoChoice"><button class="primary videoMakeBtn" id="makeShortsVideo" type="button">유튜브 쇼츠 만들기</button><button class="primary videoMakeBtn" id="makeReelsVideo" type="button">인스타 릴스 만들기</button></div><div class="sub videoHint">사진·동영상은 5번 제작실 자산을 사용합니다. 자막·제목은 각 플랫폼의 오른쪽 버튼과 하단 설명 영역을 피해 자동 배치합니다.</div><div id="videoRenderStatus" class="plan" style="display:none" aria-live="polite"></div><video id="videoPreview" controls playsinline style="display:none" preload="metadata"></video><a id="videoSave" class="secondary videoSave" style="display:none" download>완성영상 저장</a></div>';

export function appHtml(){
  let html=v6Html();
  const out=html.replace(MARKER,VIDEO_CARD+'<div class="card"><div class="titleRow"><h3>7. 채널별 홍보물</h3><small>같은 글 복붙 금지</small></div>');
  if(out===html)throw new Error('VIDEO_MAKER_UI_PATCH_MISSING');
  html=out.replace('<h3>7. 게시 준비 현황</h3>','<h3>8. 게시 준비 현황</h3>');
  html=html.replace('</style>',`.videoChoice{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}.videoMakeBtn{margin-top:0}.videoHint{margin-top:9px}.videoSave{display:block;text-align:center;text-decoration:none;margin-top:10px}.videoSave:hover{text-decoration:none}#videoPreview{width:min(100%,360px);aspect-ratio:9/16;object-fit:contain;background:#10131a;border-radius:16px;margin:12px auto 0}@media(max-width:680px){.videoChoice{grid-template-columns:1fr}.videoMakeBtn{width:100%}}</style>`);
  return html;
}
