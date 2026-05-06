import { fetchWithCache, getJson } from './utils.js';

export const fetchMeteoraPools = () => fetchWithCache('meteora', () =>
  getJson('https://dlmm-api.meteora.ag/pair/all')
);

export const fetchDexPairs = (query) => fetchWithCache(`dex:${query}`, () =>
  getJson(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(query)}`)
);

export const fetchGmgnTrending = () => fetchWithCache('gmgn:trending', () => getJson('/api/gmgn-trending'), 20_000);
export const fetchGmgnAnalysis = (mint) => fetchWithCache(`gmgn:analysis:${mint}`, () => getJson(`/api/gmgn-analysis?mint=${mint}`), 15_000);
