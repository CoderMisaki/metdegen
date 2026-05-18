const crypto = require('crypto');

// Arahkan ke OpenAPI, bukan website utama
const GMGN_BASE_URL = process.env.GMGN_BASE_URL || 'https://openapi.gmgn.ai';

function json(res, status, payload) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

function buildHeaders() {
  const headers = {
    Accept: 'application/json'
  };

  // Gunakan API Key resmi, bukan Cookie/Auth sesi browser
  if (process.env.GMGN_API_KEY) {
    headers['X-APIKEY'] = process.env.GMGN_API_KEY.trim();
  }

  return headers;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function gmgnRequest(
  path,
  query = {},
  { method = 'GET', body = null, retries = 2 } = {} // Tambah retries
) {
  const url = new URL(`${GMGN_BASE_URL}${path}`);

  // 1. Otomatis injeksi parameter wajib OpenAPI (seperti di Charon)
  url.searchParams.set('client_id', crypto.randomUUID());
  url.searchParams.set('timestamp', Math.floor(Date.now() / 1000).toString());

  // 2. Set parameter dari query
  Object.entries(query).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return;
    if (Array.isArray(v)) {
      v.forEach((item) => url.searchParams.append(k, String(item)));
    } else {
      url.searchParams.set(k, String(v));
    }
  });

  const headers = buildHeaders();
  const debug = process.env.GMGN_DEBUG === '1';

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    try {
      const fetchOptions = {
        method,
        headers,
        signal: controller.signal
      };

      if (body !== null && body !== undefined) {
        fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
        fetchOptions.headers['Content-Type'] = 'application/json';
      }

      const res = await fetch(url.toString(), fetchOptions);
      const text = await res.text();

      // Handling Rate Limit (429) dari server API
      if (res.status === 429) {
        if (attempt < retries) {
          // Cek apakah server menyuruh kita menunggu dengan waktu spesifik
          const retryAfter = res.headers.get('retry-after');
          const waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 : 2500 * (attempt + 1);
          if (debug) console.warn(`[GMGN] Rate limited, retrying in ${waitTime}ms...`);
          await sleep(waitTime);
          continue;
        }
      }

      if (!res.ok) {
        const err = new Error(`GMGN Error ${res.status}: ${text.slice(0, 150)}`);
        err.code = res.status === 403 ? 'GMGN_BLOCKED' : 'GMGN_API_ERROR';
        err.status = res.status;
        throw err;
      }

      if (!text || !text.trim()) return {};

      try {
        return JSON.parse(text);
      } catch {
        return { raw: text };
      }
    } catch (err) {
      if (err?.name === 'AbortError') {
        err.code = 'GMGN_TIMEOUT';
      }

      if (attempt < retries && !['GMGN_BLOCKED'].includes(err.code)) {
        await sleep(1500 * (attempt + 1));
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }
}

module.exports = {
  gmgnRequest,
  json
};
