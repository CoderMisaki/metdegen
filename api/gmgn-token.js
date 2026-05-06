const { gmgnRequest, json } = require('./gmgn-utils');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
  try {
    const { mint, pairAddress } = req.query || {};
    if (!mint && !pairAddress) return json(res, 400, { error: 'mint or pairAddress is required' });

    const targetMint = mint || pairAddress;
    const data = await gmgnRequest(`/defi/quotation/v1/tokens/security/sol/${encodeURIComponent(targetMint)}`);
    return json(res, 200, { ok: true, source: 'gmgn', data });
  } catch (error) {
    return json(res, 500, { ok: false, error: error.message });
  }
};
