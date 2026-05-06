import { ignoredMints } from './config.js';

export function computeVolatility(pool){
  const vol = Number(pool?.day?.volume||pool?.volume_24h||0);
  const tvl = Number(pool?.liquidity||pool?.liquidity_locked||1);
  return Math.min(100, (vol / Math.max(tvl,1)) * 20);
}

export function computeAlphaScore({pool, gmgn, rugcheck}){
  const ratTrader = Number(gmgn?.rat_trader_ratio ?? 0);
  const bundle = Number(gmgn?.bundle_ratio ?? 0);
  const devTrack = Number(gmgn?.dev_tracking_score ?? 0);
  const riskPenalty = rugcheck?.is_rugged ? 35 : 0;
  const vol = computeVolatility(pool);
  return Math.max(0, Math.min(100, (vol*0.5) + (devTrack*0.35) - (bundle*15) - (ratTrader*10) - riskPenalty));
}

export function mergeIntel(pools = [], trending = []){
  return pools
    .filter((p) => !ignoredMints.includes(p?.mint_x || p?.address))
    .map((pool) => {
      const mint = pool?.mint_x || pool?.address;
      const trend = trending.find((t) => t.mint === mint) || {};
      return { ...pool, mint, trend_1m: trend.momentum_1m ?? 0, sentiment: trend.sentiment ?? 'neutral' };
    })
    .sort((a,b)=> (b.trend_1m||0) - (a.trend_1m||0));
}
