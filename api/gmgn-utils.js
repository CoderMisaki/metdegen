const GMGN_BASE_URL = process.env.GMGN_BASE_URL || 'https://gmgn.ai';

function json(res, status, payload) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

function buildHeaders() {
  return {
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
    Referer: 'https://gmgn.ai/',
    Origin: 'https://gmgn.ai',
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
  };
}

async function gmgnRequest(path, query = {}) {
  const url = new URL(`${GMGN_BASE_URL}${path}`);

  Object.entries(query).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return;
    if (Array.isArray(v)) {
      v.forEach((item) => url.searchParams.append(k, String(item)));
    } else {
      url.searchParams.set(k, String(v));
    }
  });

  const res = await fetch(url.toString(), {
    headers: buildHeaders()
  });

  const text = await res.text();

  if (!res.ok) {
    throw new Error(`GMGN upstream ${res.status}: ${text.slice(0, 240)}`);
  }

  if (!text || !text.trim()) return {};

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

module.exports = { gmgnRequest, json };
