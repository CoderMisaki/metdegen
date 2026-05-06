const { json } = require('./gmgn-utils');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

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
