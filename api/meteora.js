const { json } = require('./gmgn-utils');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });

  try {
    const { pairAddress } = req.query || {};
    if (!pairAddress) return json(res, 400, { error: 'pairAddress is required' });

    // Gunakan header browser asli Chrome agar lolos dari Cloudflare WAF Meteora
    const response = await fetch(`https://dlmm-api.meteora.ag/pair/${pairAddress}`, {
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Origin': 'https://app.meteora.ag',
        'Referer': 'https://app.meteora.ag/',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-site',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      }
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
