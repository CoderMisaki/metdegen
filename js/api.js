import { fetchWithCache, getJson } from './utils.js';

export const fetchMeteoraPools = () => fetchWithCache(
  'meteora:pools',
  () => getJson('https://dlmm-api.meteora.ag/pair/all'),
  20_000,
);

export const fetchDexPairs = (query) => fetchWithCache(
  `dex:search:${query}`,
  () => getJson(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(query)}`),
  15_000,
);

export const fetchGmgnTrending = () => fetchWithCache(
  'gmgn:trending',
  () => getJson('/api/gmgn-trending'),
  20_000,
);

export const fetchGmgnAnalysis = (mint) => fetchWithCache(
  `gmgn:analysis:${mint}`,
  () => getJson(`/api/gmgn-analysis?mint=${encodeURIComponent(mint)}`),
  15_000,
);

export const fetchGmgnNewTokens = () => fetchWithCache(
  'gmgn:new-tokens',
  () => getJson('/api/gmgn-new-tokens'),
  20_000,
);
