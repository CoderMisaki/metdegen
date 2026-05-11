const { json } = require('./gmgn-utils');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });

  try {
    const { pairAddress } = req.query || {};
    if (!pairAddress) return json(res, 400, { error: 'pairAddress is required' });

    // Server Vercel yang melakukan fetch, sehingga kebal CORS dan Adblocker
    const response = await fetch(`https://dlmm-api.meteora.ag/pair/${pairAddress}`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Masako-Engine/2.0 Backend',
      },
    });

    if (!response.ok) {
      return json(res, response.status, { error: `Meteora API Error: ${response.status}` });
    }

    const data = await response.json();
    return json(res, 200, data);
  } catch (error) {
    return json(res, 500, { ok: false, error: error.message });
  }
};
