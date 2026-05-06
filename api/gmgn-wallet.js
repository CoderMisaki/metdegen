const { gmgnRequest, json } = require('./gmgn-utils');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
  try {
    const { mint, wallet, limit = 30 } = req.query || {};
    if (!mint && !wallet) return json(res, 400, { error: 'mint or wallet is required' });

    const data = await gmgnRequest('/wallet/smart-money', { mint, wallet, limit });
    return json(res, 200, { ok: true, source: 'gmgn', data });
  } catch (error) {
    return json(res, 500, { ok: false, error: error.message });
  }
};
