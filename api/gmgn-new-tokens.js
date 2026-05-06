import { gmgnFetch, send } from './_gmgn.js';

export default async function handler(req, res) {
  const out = await gmgnFetch('/trench/new-tokens', { chain: 'sol', interval: 'seconds', strict: 'true' });
  return send(res, out.status, out.payload);
}
