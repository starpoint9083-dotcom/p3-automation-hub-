import baseWorker from './index.js';
import { getPlaceRankPayload, placeRankDashboard } from './place-rank.js';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff'
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: JSON_HEADERS });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/place-rank') return placeRankDashboard();
    if (request.method === 'GET' && url.pathname === '/modules/place-rank') return json(getPlaceRankPayload());
    return baseWorker.fetch(request, env, ctx);
  }
};
