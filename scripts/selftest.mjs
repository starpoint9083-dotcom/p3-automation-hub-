import worker from '../src/index-place-rank.js';

const env = {
  P3_VERSION: '0.5.0',
  P3_MODE: 'p1-p2-supervisor+place-rank',
  P1_BASE_URL: 'https://k-stella-shorts-factory.k-stella-p1.workers.dev',
  P2_BASE_URL: 'https://my-life-room-v13-live-0910.starpoint9083.workers.dev'
};
const cases = [
  ['https://local.test/health', 200, b => b.ok && b.service === 'p3-automation-hub' && b.integration === 'p1-p2-supervisor' && b.version === '0.5.0' && b.mode === 'p1-p2-supervisor+place-rank'],
  ['https://local.test/healthz', 200, b => b.ok && b.stage === 'deployment-channel'],
  ['https://local.test/preflight', 200, b => b.ok && b.checks.workerRuntime === true && b.checks.p2SupervisorConfigured === true && b.checks.p2TechnicalQualityGateConfigured === true && b.checks.p2FlowManifestObservationConfigured === true && b.safety?.p2CinemaBaselineLocked === true && b.safety?.paidVisualAIFromP3 === false],
  ['https://local.test/projects', 200, b => b.ok && Array.isArray(b.projects) && b.projects.some(p => p.project === 'P2')],
  ['https://local.test/projects/p2', 200, b => b.ok && b.project === 'P2' && b.control?.mode === 'read-only-supervisor' && b.probes?.quality === '/api/cinema/batch/quality-public' && b.probes?.flows === '/assets/cinema_flow_manifest_v1.json' && b.cinema_flow?.baseline === 'P2 Cinema Pilot Baseline v1' && b.cinema_flow?.baselineLocked === true && b.cinema_flow?.clipSlots === 9 && b.cinema_flow?.logicalCombinations === 27 && b.quality_gate?.technical === 'automatic-read-only' && b.quality_gate?.autoRegeneration === false],
  ['https://local.test/modules/place-rank', 200, b => b.ok && b.module === 'place-rank' && b.service.includes('스타포인트안경원') && Array.isArray(b.rows) && b.rows.some(r => r.keyword === '수영역 안경' && r.rank === 14) && b.policy?.captchaBypass === false],
  ['https://local.test/nope', 404, b => b.error === 'NOT_FOUND']
];

for (const [url, status, validate] of cases) {
  const res = await worker.fetch(new Request(url), env);
  const body = await res.json();
  if (res.status !== status || !validate(body)) {
    console.error('SELFTEST FAILED', url, res.status, body);
    process.exit(1);
  }
}

const dashboard = await worker.fetch(new Request('https://local.test/place-rank'), env);
const html = await dashboard.text();
if (dashboard.status !== 200 || !dashboard.headers.get('content-type')?.includes('text/html') || !html.includes('스타포인트안경원') || !html.includes('P3 매장 검색순위 모듈')) {
  console.error('SELFTEST FAILED place-rank dashboard', dashboard.status, dashboard.headers.get('content-type'));
  process.exit(1);
}

const post = await worker.fetch(new Request('https://local.test/projects/p2', { method: 'POST' }), env);
if (post.status !== 405) {
  console.error('SELFTEST FAILED method guard', post.status);
  process.exit(1);
}
console.log('SELFTEST PASS P3 base supervisor + place-rank API/dashboard + paid-AI guard');
