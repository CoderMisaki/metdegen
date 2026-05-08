const { gmgnRequest, json } = require('./gmgn-utils');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });

  try {
    const { mint, pairAddress } = req.query || {};
    if (!mint && !pairAddress) {
      return json(res, 400, { error: 'mint or pairAddress is required' });
    }

    const target = mint || pairAddress;
    const data = await gmgnRequest(
      `/api/v1/mutil_window_token_security_launchpad/sol/${encodeURIComponent(target)}`
    );

    return json(res, 200, { ok: true, source: 'gmgn', data });
  } catch (error) {
    return json(res, error.code === 'GMGN_BLOCKED' ? 502 : 500, {
      ok: false,
      code: error.code || 'GMGN_ERROR',
      error: error.message
    });
  }
};
