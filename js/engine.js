import { IGNORED_MINTS } from './config.js';

export function computeAdvancedMetrics(pool = {}) {
  const vol24h = Number(pool?.day?.volume ?? pool?.volume_24h ?? 0);
  const buy24h = Number(pool?.day?.trade_count_buy ?? pool?.buys_24h ?? 0);
  const sell24h = Number(pool?.day?.trade_count_sell ?? pool?.sells_24h ?? 0);
  const liquidity = Number(pool?.liquidity_locked ?? pool?.liquidity ?? 0);
  const txCount = buy24h + sell24h;

  const turnover = liquidity > 0 ? vol24h / liquidity : 0;
  const buyPressure = txCount > 0 ? (buy24h / txCount) * 100 : 50;
  const liquidityHealth = liquidity > 100_000 ? 100 : liquidity > 50_000 ? 75 : liquidity > 10_000 ? 45 : 20;

  return {
    vol24h,
    liquidity,
    txCount,
    turnover,
    buyPressure,
    liquidityHealth,
  };
}

export function computeAlphaScore({ pool, gmgn, rugcheck }) {
  const metrics = computeAdvancedMetrics(pool);
  const ratTrader = Number(gmgn?.rat_trader_ratio ?? 0);
  const bundleRatio = Number(gmgn?.bundle_ratio ?? 0);
  const devTracking = Number(gmgn?.dev_tracking_score ?? 0);
  const sniperRatio = Number(gmgn?.sniper_ratio ?? 0);

  const momentumScore = Math.min(35, metrics.turnover * 12);
  const pressureScore = (metrics.buyPressure / 100) * 20;
  const liquidityScore = (metrics.liquidityHealth / 100) * 20;
  const devScore = Math.min(20, devTracking * 20);

  const bundlePenalty = Math.min(18, bundleRatio * 25);
  const ratPenalty = Math.min(15, ratTrader * 15);
  const sniperPenalty = Math.min(12, sniperRatio * 15);
  const rugPenalty = rugcheck?.is_rugged ? 40 : 0;

  const raw = momentumScore + pressureScore + liquidityScore + devScore - bundlePenalty - ratPenalty - sniperPenalty - rugPenalty;
  return Math.max(0, Math.min(100, raw));
}

export function buildStrategy({ pool, gmgn, alphaScore }) {
  const notes = [];
  if ((gmgn?.bundle_ratio ?? 0) > 0.25) notes.push('Bundle ratio tinggi, tunggu retrace sebelum entry.');
  if ((gmgn?.dev_tracking_score ?? 0) > 0.7) notes.push('Dev tracking kuat, struktur holder relatif sehat.');
  if ((gmgn?.rat_trader_ratio ?? 0) > 0.35) notes.push('Banyak rat-trader terdeteksi, aktifkan stop ketat.');

  let stance = 'Watchlist';
  if (alphaScore >= 70) stance = 'Aggressive Long';
  else if (alphaScore >= 55) stance = 'Controlled Long';
  else if (alphaScore < 35) stance = 'Avoid';

  return {
    stance,
    entryZone: alphaScore >= 55 ? 'Breakout + retest VWAP 5m' : 'Belum ideal untuk entry',
    riskPlan: alphaScore >= 70 ? 'Risk 1.5% per posisi, scale-out bertahap.' : 'Risk maksimal 0.5% sampai validasi lanjutan.',
    intel: notes,
    devTracking: gmgn?.dev_tracking_score ?? null,
    bundleRatio: gmgn?.bundle_ratio ?? null,
  };
}

export function mergeIntel(pools = [], trending = []) {
  return pools
    .map((pool) => {
      const mint = pool?.mint_x || pool?.address || pool?.mint;
      return { ...pool, mint };
    })
    .filter((pool) => pool.mint && !IGNORED_MINTS.has(pool.mint))
    .map((pool) => {
      const trend = trending.find((t) => t.mint === pool.mint) || {};
      return {
        ...pool,
        trend_1m: Number(trend?.momentum_1m ?? 0),
        trend_5m: Number(trend?.momentum_5m ?? 0),
        sentiment: trend?.sentiment ?? 'neutral',
        gmgnSnapshot: trend,
      };
    })
    .sort((a, b) => (b.trend_1m || 0) - (a.trend_1m || 0));
}
