const GMGN_BASE_URL = process.env.GMGN_BASE_URL || 'https://gmgn.ai';

function json(res, status, payload) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

function buildHeaders() {
  const headers = {
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
    Origin: 'https://gmgn.ai',
    Referer: 'https://gmgn.ai/?chain=sol',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    'User-Agent':
      process.env.GMGN_USER_AGENT ||
      'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
  };

  const secChUa = process.env.GMGN_SEC_CH_UA?.trim();
  const secChUaMobile = process.env.GMGN_SEC_CH_UA_MOBILE?.trim();
  const secChUaPlatform = process.env.GMGN_SEC_CH_UA_PLATFORM?.trim();

  headers['Sec-CH-UA'] = secChUa || '"Mises";v="141", "Not?A_Brand";v="8", "Chromium";v="141"';
  headers['Sec-CH-UA-Mobile'] = secChUaMobile || '?1';
  headers['Sec-CH-UA-Platform'] = secChUaPlatform || '"Android"';
  headers.Priority = 'u=1, i';

  if (process.env.GMGN_AUTH?.trim()) {
    headers.Authorization = process.env.GMGN_AUTH.trim();
  }

  if (process.env.GMGN_COOKIE?.trim()) {
    headers.Cookie = process.env.GMGN_COOKIE.trim();
  }

  return headers;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isCloudflareHtml(text = '') {
  const t = String(text || '').toLowerCase();
  return (
    t.includes('cloudflare') ||
    t.includes('just a moment') ||
    t.includes('attention required') ||
    t.includes('cf-browser-verification') ||
    t.includes('cf-chl') ||
    t.includes('managed challenge')
  );
}

async function gmgnRequest(
  path,
  query = {},
  {
    method = 'GET',
    body = null,
    retries = 1
  } = {}
) {
  const url = new URL(`${GMGN_BASE_URL}${path}`);

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

  if (debug) {
    console.log('\n============================');
    console.log('[GMGN REQUEST]');
    console.log('URL:', url.toString());
    console.log('METHOD:', method);
    console.log('COOKIE EXISTS:', Boolean(headers.Cookie));
    console.log('AUTH EXISTS:', Boolean(headers.Authorization));
    console.log('COOKIE LENGTH:', headers.Cookie?.length || 0);
    console.log('AUTH LENGTH:', headers.Authorization?.length || 0);
    console.log('============================\n');
  }

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    try {
      const fetchOptions = {
        method,
        headers,
        redirect: 'follow',
        signal: controller.signal
      };

      if (body !== null && body !== undefined) {
        fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
        fetchOptions.headers['Content-Type'] = 'application/json';
      }

      const res = await fetch(url.toString(), fetchOptions);
      const text = await res.text();

      if (debug) {
        console.log('\n[GMGN RESPONSE]');
        console.log('STATUS:', res.status);
        console.log('FINAL URL:', res.url);
        console.log('BODY PREVIEW:', text.slice(0, 300));
        console.log('----------------------\n');
      }

      if (!res.ok) {
        if (res.status === 403 && isCloudflareHtml(text)) {
          const err = new Error(`GMGN blocked by Cloudflare/anti-bot: ${text.slice(0, 180)}`);
          err.code = 'GMGN_BLOCKED';
          err.status = 403;
          err.url = url.toString();
          err.body = text.slice(0, 300);
          throw err;
        }

        if ([408, 425, 429, 500, 502, 503, 504].includes(res.status) && attempt < retries) {
          await sleep(800 * (attempt + 1));
          continue;
        }

        const err = new Error(`GMGN upstream ${res.status}: ${text.slice(0, 300)}`);
        err.code = 'GMGN_UPSTREAM_ERROR';
        err.status = res.status;
        err.url = url.toString();
        err.body = text.slice(0, 300);
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
        throw err;
      }

      if (debug) {
        console.error('[GMGN ERROR]', err);
      }

      if (err?.code === 'GMGN_BLOCKED') {
        throw err;
      }

      if (attempt < retries) {
        await sleep(800 * (attempt + 1));
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
