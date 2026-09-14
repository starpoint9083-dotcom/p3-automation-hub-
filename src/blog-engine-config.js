export const BLOG_ENGINE_VERSION = '0.3.4.2';

export const STORE_PROFILE = {
  name: '스타포인트안경원',
  region: ['부산', '수영구', '광안동', '광안리'],
  audience: ['40대', '50대', '가족', '직장인', '운전자', '학생', '부모'],
  topicGroups: {
    progressive: ['누진다초점', '누진렌즈', '노안', '근거리 피로', '중년 안경'],
    photochromic: ['변색렌즈', '자외선', '그레이 변색', '야외 활동', '햇빛 눈부심'],
    driving: ['운전용 안경', '야간운전', '눈부심', '편광렌즈', '운전 렌즈'],
    blueLight: ['블루라이트', '컴퓨터 안경', '사무용 안경', '디지털 피로'],
    myopia: ['근시억제', '키즈 안경', '학생 시력', '어린이 시력'],
    contacts: ['콘택트렌즈', '아큐브', '알콘', '쿠퍼비전', '바슈롬'],
    frames: ['안경테', '구찌 안경', '톰포드 안경', '디올 안경', '포르쉐 안경']
  }
};

export const CORE_KEYWORDS = [
  '안경', '렌즈', '시력', '눈', '노안', '자외선', '운전', '컴퓨터', '학생', '근시',
  '패션', '선글라스', '봄', '여름', '가을', '겨울', '휴가', '여행', '입학', '개학'
];

export const MEDIA_POLICY = {
  preferOwnedAssets: true,
  externalImages: 'licensed-or-link-only',
  externalVideo: 'embed-or-link-only',
  fallback: 'ai-generation-prompt',
  note: '웹 이미지를 무단 다운로드·재업로드하지 않는다.'
};