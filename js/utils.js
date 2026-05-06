import { MAX_CACHE, state } from './config.js';

export const formatNum = (n = 0) => Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(Number(n) || 0);
export const formatMoney = (n = 0) => `$${formatNum(n)}`;
export const formatAge = (tsMs) => {
  if (!tsMs) return '-';
  const diff = Math.max(0, Date.now() - Number(tsMs));
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'baru saja';
  if (mins < 60) return `${mins}m`; 
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}j`;
  return `${Math.floor(hrs / 24)}h`;
};
export const short = (s = '') => (s.length > 12 ? `${s.slice(0, 6)}...${s.slice(-4)}` : s);

export async function getJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.json();
}

export async function fetchWithCache(key, fetcher, ttl = 10_000) {
  const now = Date.now();
  const hit = state.apiCache.get(key);
  if (hit && now - hit.at < ttl) return hit.value;

  const value = await fetcher();
  state.apiCache.set(key, { at: now, value });

  if (state.apiCache.size > MAX_CACHE) {
    const firstKey = state.apiCache.keys().next().value;
    state.apiCache.delete(firstKey);
  }
  return value;
}
