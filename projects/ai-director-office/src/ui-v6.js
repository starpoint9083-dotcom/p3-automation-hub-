import {appHtml as v5Html} from './ui-v5.js';

const MARKER='<div class="card"><div class="titleRow"><h3>5. 이미지·장면 제작실</h3><small>AI 원장실 내장형 P1 콘텐츠 엔진</small></div><div id="assetGallery" class="assetgrid"><div class="empty">아직 생성된 홍보 이미지가 없습니다.</div></div></div>';
const REPLACEMENT='<div class="card"><div class="titleRow"><h3>5. 이미지·장면 제작실</h3><small>갤러리 + AI 원장실 내장형 P1 콘텐츠 엔진</small></div><div class="uploadbox"><input id="galleryMedia" type="file" accept="image/*,video/*" multiple hidden><button class="secondary" id="pickGalleryMedia" type="button" style="width:100%">휴대폰 갤러리 사진·동영상 가져오기</button><div class="grid2" style="margin-top:8px"><div><label>사용 채널</label><select id="galleryChannel"><option value="GENERAL">공용</option><option value="YOUTUBE">유튜브 쇼츠</option><option value="NAVER_BLOG">네이버 블로그</option><option value="INSTAGRAM">인스타그램</option><option value="DAANGN">당근</option></select></div><div><label>사진·영상 설명</label><input id="galleryPurpose" placeholder="예: 실제 수업 장면"></div></div><div class="sub" style="margin-top:8px">선택한 사진·동영상은 학원 전용 자산으로 비공개 저장되고 이후 홍보물 제작에 재사용됩니다. 사진 최대 20MB · 동영상 최대 80MB.</div><div id="galleryUploadStatus" class="plan" style="display:none" aria-live="polite"></div></div><div id="assetGallery" class="assetgrid"><div class="empty">아직 저장된 홍보 자산이 없습니다.</div></div></div>';

export function appHtml(){
  let html=v5Html();
  const out=html.replace(MARKER,REPLACEMENT);
  if(out===html)throw new Error('GALLERY_UPLOAD_UI_PATCH_MISSING');
  html=out.replace('</style>',`.uploadbox{border:1px dashed #d8deef;border-radius:15px;padding:12px;margin:10px 0 12px;background:#fbfcff}.asset video{width:100%;aspect-ratio:4/3;object-fit:cover;display:block;background:#10131a}.asset .mediaTag{display:inline-flex;margin-top:5px;padding:3px 6px;border-radius:999px;background:#f0f3ff;color:#596be8;font-size:9px;font-weight:900}</style>`);
  return html;
}
