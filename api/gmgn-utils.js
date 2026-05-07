const GMGN_BASE_URL = process.env.GMGN_BASE_URL || 'https://gmgn.ai';

function json(res, status, payload) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

async function gmgnRequest(path, query = {}) {
  const url = new URL(`${GMGN_BASE_URL}${path}`);
  Object.entries(query).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') {
      if (Array.isArray(v)) v.forEach(item => url.searchParams.append(k, String(item)));
      else url.searchParams.set(k, String(v));
    }
  });

  const res = await fetch(url.toString(), {
    headers: {
      'Accept': 'application/json, text/plain, */*',
      'User-Agent': 'metdegen/1.0 (+https://metdegen.app)',
      'Referer': 'https://gmgn.ai/'
    }
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GMGN upstream ${res.status}: ${body.slice(0, 240)}`);
  }

  return res.json();
}

module.exports = { gmgnRequest, json };
