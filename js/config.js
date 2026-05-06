export const MAX_CACHE = 120;
export const REFRESH_MS = 30_000;
export const ignoredMints = ["So11111111111111111111111111111111111111112"];

export const state = {
  view: 'meteora',
  pools: [],
  alpha: [],
  selected: null,
  cache: new Map(),
  pinned: new Set(JSON.parse(localStorage.getItem('masako:pinned') || '[]')),
};
