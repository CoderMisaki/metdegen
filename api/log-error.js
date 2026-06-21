const { json } = require('./gmgn-utils');

const MAX_FIELD_LENGTH = 500;

function truncate(value, maxLength = MAX_FIELD_LENGTH) {
  if (value === undefined || value === null) return value;
  const text = String(value);
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const origin = req.headers.origin || '';
  const allowedOrigin = process.env.APP_ORIGIN || '';
  if (allowedOrigin && origin && origin !== allowedOrigin) {
    return json(res, 403, { ok: false, error: 'Forbidden origin' });
  }

  try {
    const { message, source, lineno, colno, error, type, url } = req.body || {};
    console.error('[GlobalErrorMonitor]', {
      type: truncate(type || 'unknown', 80),
      message: truncate(message || 'Unknown error'),
      source: truncate(source || ''),
      lineno: Number(lineno) || 0,
      colno: Number(colno) || 0,
      error: truncate(error || null),
      url: truncate(url || '')
    });

    return json(res, 200, { ok: true });
  } catch (err) {
    return json(res, 500, { ok: false, error: err.message });
  }
};
