import { gmgnFetch, send } from './_gmgn.js';

export default async function handler(req, res) {
  const { mint } = req.query;
  if (!mint) return send(res, 400, { error: 'mint is required' });

  const [analysis, walletTracking, pnl] = await Promise.all([
    gmgnFetch('/token/analysis', { chain: 'sol', mint }),
    gmgnFetch('/wallet/tracking', { chain: 'sol', mint, segment: 'smart_money' }),
    gmgnFetch('/wallet/pnl', { chain: 'sol', mint, tier: 'elite' }),
  ]);

  const payload = {
    data: analysis.payload?.data || analysis.payload,
    walletTracking: walletTracking.payload,
    walletPnl: pnl.payload,
    rugcheck: { is_rugged: false },
    notes: 'Read-only analytics only. No signing or wallet execution.',
  };

  const status = [analysis.status, walletTracking.status, pnl.status].includes(429) ? 429 : 200;
  return send(res, status, payload);
}
