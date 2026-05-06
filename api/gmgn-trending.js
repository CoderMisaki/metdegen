import { gmgnFetch, send } from './_gmgn.js';

export default async function handler(req, res) {
  const { chain = 'sol', interval = '1m', limit = '50' } = req.query;
  const out = await gmgnFetch('/trending/tokens', { chain, interval, limit });
  return send(res, out.status, out.payload);
}
