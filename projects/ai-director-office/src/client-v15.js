import {CLIENT_JS as V14} from './client-v14.js';

let PATCHED=V14;
const replacements=[
  ['먼저 이번 주 홍보작전을 만들어주세요.','먼저 이번 주 홍보 계획을 만들어주세요.'],
  ['AI 홍보실장이 이번 주 작전 짜는 중…','AI 모집실장이 이번 주 홍보 계획을 만드는 중…'],
  ['빈자리·유입성과·채널을 분석하고 있습니다.','빈자리와 상담 흐름을 보고, 이번 주에 무엇을 홍보할지 정하고 있어요.'],
  ['이번 주 홍보작전이 완성됐습니다.','이번 주 홍보 계획이 준비됐어요.'],
  ['채널에 맞는 완성 원고를 만들고 있습니다…','올릴 내용을 보기 좋게 만들고 있어요…'],
  ['홍보 이미지가 만들어졌습니다.','홍보용 사진이 준비됐어요.'],
  ['이번 주 제작이 모두 완료됐습니다.','이번 주 홍보 준비가 모두 완료됐어요.'],
  ['전용 영상 설계 중…',' 영상을 준비하고 있어요…'],
  ['한국어 TTS 음성을 만드는 중…','읽어줄 음성을 만들고 있어요…'],
  ['사진·동영상·TTS·자막·배경음을 합쳐 MP4 렌더링 중… 화면을 닫지 마세요.','사진·동영상에 음성·자막·음악을 붙이고 있어요. 화면을 잠시 그대로 두세요.'],
  ['완성 MP4를 학원 전용 자산에 저장 중…','완성 영상을 학원 보관함에 저장하고 있어요…']
];
for(const [from,to] of replacements)PATCHED=PATCHED.replaceAll(from,to);
const BIND='function bind(){';
const BIND_HOME="function bind(){if('scrollRestoration' in history)history.scrollRestoration='manual';setView('today');window.scrollTo(0,0);";
PATCHED=PATCHED.replace(BIND,BIND_HOME);
if(PATCHED===V14)throw new Error('FRIENDLY_CLIENT_PATCH_MISSING');
if(!PATCHED.includes("setView('today')")||!PATCHED.includes("history.scrollRestoration='manual'"))throw new Error('TODAY_HOME_PATCH_MISSING');
new Function(PATCHED);
export const CLIENT_JS=PATCHED;
