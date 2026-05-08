const GMGN_BASE_URL = process.env.GMGN_BASE_URL || 'https://gmgn.ai';

function json(res, status, payload) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

function buildHeaders() {
  return {
    'Accept': 'application/json, text/plain, */*',
    // Gunakan bahasa yang sama dengan browser Mises kamu
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Referer': 'https://gmgn.ai/?chain=sol',
    'Origin': 'https://gmgn.ai',
    
    // WAJIB: User-Agent harus sama persis dengan browser saat kamu ambil cookie
    'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
    
    // Mengambil data rahasia dari Environment Variables Vercel
    'Authorization': process.env.GMGN_AUTH,
    'Cookie': process.env.GMGN_COOKIE
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
    // Kalau kena 403 lagi, berarti cookie/auth sudah expired
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
