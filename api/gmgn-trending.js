const { gmgnRequest, json } = require('./gmgn-utils');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
  try {
    const { interval = '1m', limit = 50, chain = 'sol', mode = 'trending' } = req.query || {};
    const endpoint = `/defi/quotation/v1/rank/${encodeURIComponent(chain)}/swaps/${encodeURIComponent(interval)}`;
    const data = await gmgnRequest(endpoint, {
      orderby: 'swaps',
      direction: 'desc',
      limit
    });
    return json(res, 200, { ok: true, source: 'gmgn', mode, data });
  } catch (error) {
    return json(res, 500, { ok: false, error: error.message });
  }
};
