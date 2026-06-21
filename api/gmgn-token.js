const { gmgnRequest, json, sendGmgnError } = require('./gmgn-utils');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });

  try {
    const { mint, pairAddress } = req.query || {};
    if (!mint && !pairAddress) {
      return json(res, 400, { error: 'mint or pairAddress is required' });
    }

    const target = mint || pairAddress;
    const resData = await gmgnRequest(
      `/defi/quotation/v1/tokens/sol/${encodeURIComponent(target)}`
    );

    const openApiData = resData?.data || {};
    const flattenedData = {
      ...(openApiData.token || {}),
      ...(openApiData.security || {}),
      smart_money: openApiData.smart_money || {}
    };

    return json(res, 200, { ok: true, source: 'gmgn', data: flattenedData });
  } catch (error) {
    return sendGmgnError(res, error);
  }
};
