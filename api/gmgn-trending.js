const { gmgnRequest, json } = require('./gmgn-utils');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
  try {
    const { interval = '1h', limit = 50, mode = 'trending' } = req.query || {};
    const isTrench = String(mode).toLowerCase() === 'trench';

    const path = isTrench ? '/trs/api/v1/trenches_rank' : '/api/v1/rank/sol/swaps/1h';
    const data = await gmgnRequest(path, {
      orderby: 'swaps', direction: 'desc', limit,
      'filters[]': ['renounced', 'frozen'], interval
    });
    return json(res, 200, { ok: true, source: 'gmgn', mode, data });
  } catch (error) {
    return json(res, 500, { ok: false, error: error.message });
  }
};
