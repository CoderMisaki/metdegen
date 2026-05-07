const { json } = require('./gmgn-utils');

const RATE_WINDOW_MS = 60_000;
const RATE_MAX_PER_IP = 60;
const rateMap = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const rec = rateMap.get(ip) || { count: 0, resetAt: now + RATE_WINDOW_MS };
  if (now > rec.resetAt) {
    rec.count = 0;
    rec.resetAt = now + RATE_WINDOW_MS;
  }
  rec.count += 1;
  rateMap.set(ip, rec);
  return rec.count > RATE_MAX_PER_IP;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const origin = req.headers.origin || '';
  const allowedOrigin = process.env.APP_ORIGIN || '';
  if (allowedOrigin && origin && origin !== allowedOrigin) {
    return json(res, 403, { ok: false, error: 'Forbidden origin' });
  }

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  if (isRateLimited(ip)) return json(res, 429, { ok: false, error: 'Rate limit exceeded' });

  try {
    const { message, source, lineno, colno, error, type, url } = req.body || {};
    console.error('[GlobalErrorMonitor]', {
      type: type || 'unknown',
      message: message || 'Unknown error',
      source: source || '',
      lineno: lineno || 0,
      colno: colno || 0,
      error: error || null,
      url: url || ''
    });

    return json(res, 200, { ok: true });
  } catch (err) {
    return json(res, 500, { ok: false, error: err.message });
  }
};
