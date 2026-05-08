const GMGN_BASE_URL = process.env.GMGN_BASE_URL || 'https://gmgn.ai';

function json(res, status, payload) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

function buildHeaders() {
  const headers = {
    'Accept': 'application/json, text/plain, */*',
    'Accept-Encoding': 'gzip, deflate, br, zstd',
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Origin': 'https://gmgn.ai',
    'Referer': 'https://gmgn.ai/?chain=sol',
    'Sec-CH-UA':
      '"Mises";v="141", "Not?A_Brand";v="8", "Chromium";v="141"',
    'Sec-CH-UA-Mobile': '?1',
    'Sec-CH-UA-Platform': '"Android"',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    'Priority': 'u=1, i',
    'User-Agent':
      'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
  };

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

async function gmgnRequest(
  path,
  query = {},
  {
    method = 'GET',
    body = null,
    retries = 2
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

  console.log('\n============================');
  console.log('[GMGN REQUEST]');
  console.log('URL:', url.toString());
  console.log('METHOD:', method);
  console.log('COOKIE EXISTS:', Boolean(headers.Cookie));
  console.log('AUTH EXISTS:', Boolean(headers.Authorization));
  console.log('COOKIE LENGTH:', headers.Cookie?.length || 0);
  console.log('AUTH LENGTH:', headers.Authorization?.length || 0);
  console.log('============================\n');

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const controller = new AbortController();

      const timeout = setTimeout(() => {
        controller.abort();
      }, 20000);

      const fetchOptions = {
        method,
        headers,
        redirect: 'follow',
        signal: controller.signal
      };

      if (body) {
        fetchOptions.body =
          typeof body === 'string'
            ? body
            : JSON.stringify(body);

        fetchOptions.headers['Content-Type'] =
          'application/json';
      }

      const res = await fetch(url.toString(), fetchOptions);

      clearTimeout(timeout);

      const text = await res.text();

      console.log('\n[GMGN RESPONSE]');
      console.log('STATUS:', res.status);
      console.log('FINAL URL:', res.url);
      console.log(
        'BODY PREVIEW:',
        text.slice(0, 300)
      );
      console.log('----------------------\n');

      if (!res.ok) {
        if (
          [408, 425, 429, 500, 502, 503, 504].includes(res.status) &&
          attempt < retries
        ) {
          console.log(
            `[GMGN] Retry ${attempt + 1}/${retries}`
          );

          await sleep(1000 * (attempt + 1));
          continue;
        }

        throw new Error(
          `GMGN upstream ${res.status}: ${text.slice(0, 300)}`
        );
      }

      if (!text?.trim()) {
        return {};
      }

      try {
        return JSON.parse(text);
      } catch {
        return {
          raw: text
        };
      }
    } catch (err) {
      console.error('[GMGN ERROR]', err);

      if (attempt < retries) {
        await sleep(1000 * (attempt + 1));
        continue;
      }

      throw err;
    }
  }
}

module.exports = {
  gmgnRequest,
  json
};
