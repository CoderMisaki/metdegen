const { gmgnRequest, json } = require('./gmgn-utils');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });

  try {
    const { interval = '1m', limit = 50, mode = 'trending' } = req.query || {};
    const isTrench = String(mode).toLowerCase() === 'trench';

    const path = isTrench
      ? '/trs/api/v1/trenches_rank'
      : '/api/v1/rank/sol/swaps/1h';

    const query = isTrench
      ? {}
      : {
          orderby: 'swaps',
          direction: 'desc',
          limit,
          'filters[]': ['renounced', 'frozen']
        };

    const data = isTrench
      ? await gmgnRequest(path, query, { method: 'POST', body: {} })
      : await gmgnRequest(path, query);

    return json(res, 200, {
      ok: true,
      source: 'gmgn',
      mode: isTrench ? 'trench' : 'trending',
      data
    });
  } catch (error) {
    return json(res, error.code === 'GMGN_BLOCKED' ? 502 : 500, {
      ok: false,
      code: error.code || 'GMGN_ERROR',
      error: error.message
    });
  }
};
