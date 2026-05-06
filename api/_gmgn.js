const GMGN_BASE = process.env.GMGN_BASE_URL || 'https://api.gmgn.ai/v1';

export async function gmgnFetch(path, query = {}) {
  const key = process.env.GMGN_API_KEY;
  if (!key) return { ok: false, status: 500, payload: { error: 'GMGN_API_KEY missing' } };
  const url = new URL(`${GMGN_BASE}${path}`);
  Object.entries(query).forEach(([k, v]) => v !== undefined && url.searchParams.set(k, String(v)));

  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    method: 'GET',
  });

  if (resp.status === 429) {
    return { ok: false, status: 429, payload: { error: 'Rate limit', retryAfter: resp.headers.get('retry-after') || '5' } };
  }

  const json = await resp.json().catch(() => ({}));
  return { ok: resp.ok, status: resp.status, payload: json };
}

export function send(res, status, payload) {
  res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=30');
  res.status(status).json(payload);
}
