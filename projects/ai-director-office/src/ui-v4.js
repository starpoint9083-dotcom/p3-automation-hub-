import {appHtml as v3Html} from './ui-v3.js';

export function appHtml(){
  return v3Html()
    .replace('.channels{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}', '.channels{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}')
    .replace('placeholder="네이버/인스타/당근/소개"','placeholder="유튜브/네이버/인스타/당근/소개"')
    .replace('<div class="grid3"><div><label>네이버 블로그 주소</label><input id="pNaver"></div><div><label>인스타 계정</label><input id="pInstagram"></div><div><label>당근 프로필</label><input id="pDaangn"></div></div>', '<div class="grid2"><div><label>유튜브 채널 주소</label><input id="pYoutube" placeholder="https://youtube.com/@..."></div><div><label>네이버 블로그 주소</label><input id="pNaver"></div></div><div class="grid2"><div><label>인스타 계정</label><input id="pInstagram"></div><div><label>당근 프로필</label><input id="pDaangn"></div></div>')
    .replace('<label>사용 채널</label><div class="checkrow"><label><input type="checkbox" id="chNaver" checked> 네이버 블로그</label>', '<label>사용 채널</label><div class="checkrow"><label><input type="checkbox" id="chYoutube" checked> 유튜브 쇼츠</label><label><input type="checkbox" id="chNaver" checked> 네이버 블로그</label>')
    .replace('<div class="titleRow"><h3>5. 이미지 제작실</h3><small>P1 방식 재사용 · Workers AI</small></div>', '<div class="titleRow"><h3>5. 이미지·장면 제작실</h3><small>AI 원장실 내장형 P1 콘텐츠 엔진</small></div>')
    .replace('<div class="channels"><div class="channel"><b>네이버 블로그</b>', '<div class="channels"><div class="channel"><b>유튜브 쇼츠</b><div class="sub">훅 + 45~60초 대본 + 장면표 + 썸네일 + 설명 + 해시태그</div><button class="secondary" data-make-post="YOUTUBE">유튜브 쇼츠 패키지 만들기</button></div><div class="channel"><b>네이버 블로그</b>')
    .replace('인스타 자동게시 연결은 외부 채널 승인 후 활성화됩니다. 네이버 블로그는 공식 글쓰기 API가 종료되어 완성 게시패키지를 제공하고 최종 게시만 확인합니다.', '유튜브·인스타 자동게시는 각 채널 계정 연결과 승인 후 활성화됩니다. 네이버 블로그는 완성 게시패키지를 제공하고 최종 게시만 확인합니다. 당근도 승인형 게시패키지로 운영합니다.')
    .replace('<h2>AI 홍보·모집실장</h2><p>빈자리를 보고, 필요한 자료를 먼저 요청하고, 이미지와 채널별 홍보물을 제작합니다.</p>', '<h2>AI 홍보·모집실장</h2><p>빈자리를 보고 주간 편성을 먼저 결정한 뒤 유튜브·네이버·인스타·당근용 이미지·영상기획·글을 제작합니다.</p>');
}
