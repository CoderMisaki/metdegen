const { gmgnRequest, json, sendGmgnError } = require('./gmgn-utils');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });

  try {
    const { interval = '1m', limit = 50, mode = 'trending' } = req.query || {};
    const isTrench = String(mode).toLowerCase() === 'trench';

    const path = isTrench
      ? '/defi/quotation/v1/rank/sol/swaps/1h'
      : `/defi/quotation/v1/rank/sol/swaps/${interval}`;

    const query = {
      orderby: 'swaps',
      direction: 'desc',
      limit
    };

    const resData = await gmgnRequest(path, query);
    const rankList = resData?.data?.rank || resData?.data || [];

    return json(res, 200, {
      ok: true,
      source: 'gmgn',
      mode: isTrench ? 'trench' : 'trending',
      data: rankList
    });
  } catch (error) {
    return sendGmgnError(res, error);
  }
};
