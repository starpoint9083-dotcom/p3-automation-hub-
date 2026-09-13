import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const historyPath = path.join(root, 'data', 'place-rank-history.json');
const generatedPath = path.join(root, 'src', 'place-rank-data.js');

const doc = JSON.parse(await fs.readFile(historyPath, 'utf8'));
const history = Array.isArray(doc.history) ? doc.history : [];
const latest = history.at(-1);

if (!latest || !Array.isArray(latest.results)) {
  console.error('PLACE_RANK_VERIFY no latest snapshot');
  process.exit(2);
}

function hasCapturedPlaceEvidence(item) {
  const sources = Array.isArray(item.captureSources) ? item.captureSources : [];
  return sources.some(source => {
    const type = String(source?.type || '');
    const count = Number(source?.count || 0);
    return count > 0 && (type === 'allSearch' || type === 'graphql');
  });
}

function looksLikeChromeUiOnly(item) {
  const sample = Array.isArray(item.sample) ? item.sample : [];
  if (!sample.length) return false;
  const uiTerms = [
    '로그인', '내정보 보기', '프로필 사진 변경', '로그아웃', '네이버ID',
    '보안설정', '내인증서', '네이버 멤버쉽', '내 페이포인트', '내 블로그',
    '거리순', '관련도순', '반경1km', '반경2km', '반경3km', '반경4km', '반경5km', '반경10km'
  ];
  const normalized = sample.map(value => String(value || '').trim());
  const uiCount = normalized.filter(value => uiTerms.some(term => value.includes(term))).length;
  return uiCount >= Math.min(4, normalized.length);
}

let corrected = 0;
for (const item of latest.results) {
  const rankIsValid = Number.isFinite(item?.rank);
  if (rankIsValid) continue;

  const evidence = hasCapturedPlaceEvidence(item);
  const uiOnly = looksLikeChromeUiOnly(item);
  const weakNetwork = Number(item?.networkResponses || 0) <= 1;

  if ((item.status === 'not-found' || item.status === 'no-results') && !evidence && (uiOnly || weakNetwork)) {
    item.status = 'unverified';
    item.resultCount = null;
    item.verification = 'insufficient-place-evidence';
    corrected += 1;
  }
}

latest.verification = {
  strategy: 'captured-place-evidence-v1',
  corrected,
  verifiedAt: new Date().toISOString()
};

await fs.writeFile(historyPath, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
await fs.writeFile(generatedPath, `export const placeRankData = ${JSON.stringify(doc, null, 2)};\n`, 'utf8');
console.log(`PLACE_RANK_VERIFY corrected=${corrected} checked=${latest.results.length}`);
