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

function normalizeRetryAfter(value) {
  if (!value) return '3';

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds > 0) {
    return String(Math.ceil(seconds));
  }

  const retryAt = Date.parse(value);
  if (Number.isFinite(retryAt)) {
    return String(Math.max(1, Math.ceil((retryAt - Date.now()) / 1000)));
  }

  return '3';
}

async function gmgnRequest(
  path,
  query = {},
  { method = 'GET', body = null } = {}
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

    if (res.status === 429) {
      const err = new Error(`GMGN rate limited: ${text.slice(0, 150)}`);
      err.code = 'GMGN_RATE_LIMITED';
      err.status = 429;
      err.retryAfter = normalizeRetryAfter(res.headers.get('retry-after'));
      throw err;
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
      err.status = 504;
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

function sendGmgnError(res, error) {
  if (error?.code === 'GMGN_RATE_LIMITED' || error?.status === 429) {
    res.setHeader('Retry-After', normalizeRetryAfter(error.retryAfter));
    return json(res, 429, {
      ok: false,
      code: 'GMGN_RATE_LIMITED',
      error: 'GMGN API rate limited. Retry after the provided delay.'
    });
  }

  return json(res, error.code === 'GMGN_BLOCKED' ? 502 : 500, {
    ok: false,
    code: error.code || 'GMGN_ERROR',
    error: error.message
  });
}

module.exports = {
  gmgnRequest,
  json,
  sendGmgnError
};
