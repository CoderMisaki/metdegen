const GMGN_BASE_URL = process.env.GMGN_BASE_URL || 'https://gmgn.ai';

function json(res, status, payload) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

async function gmgnRequest(path, query = {}) {
  const apiKey = process.env.GMGN_API_KEY;
  if (!apiKey) throw new Error('GMGN_API_KEY is not configured');

  const url = new URL(`${GMGN_BASE_URL}${path}`);
  Object.entries(query).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  });

  const res = await fetch(url.toString(), {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'x-api-key': apiKey,
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Referer': 'https://gmgn.ai/',
      'Origin': 'https://gmgn.ai',
      'Sec-Ch-Ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin'
    }
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GMGN upstream ${res.status}: ${body.slice(0, 240)}`);
  }

  return res.json();
}

module.exports = { gmgnRequest, json };
