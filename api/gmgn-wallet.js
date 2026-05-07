const { gmgnRequest, json } = require('./gmgn-utils');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });

  try {
    const { wallet } = req.query || {};
    if (!wallet) return json(res, 400, { error: 'wallet is required' });

    const [profit, activity] = await Promise.all([
      gmgnRequest(`/pf/api/v1/wallet/sol/${encodeURIComponent(wallet)}/profit_stat/7d`),
      gmgnRequest('/vas/api/v1/wallet_activity/sol', { wallet })
    ]);

    return json(res, 200, {
      ok: true,
      source: 'gmgn',
      data: { profit, activity }
    });
  } catch (error) {
    return json(res, 500, { ok: false, error: error.message });
  }
};
