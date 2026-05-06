import { state, MAX_CACHE } from './config.js';

export const formatNum = (n=0)=>Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(Number(n)||0);
export const formatUsd = (n=0)=>`$${formatNum(n)}`;
export const short = (s='') => s.length>12?`${s.slice(0,6)}...${s.slice(-4)}`:s;

export async function fetchWithCache(key, fn, ttl=10_000){
  const now = Date.now();
  const hit = state.cache.get(key);
  if(hit && now-hit.at < ttl) return hit.value;
  const value = await fn();
  state.cache.set(key,{at:now,value});
  if(state.cache.size > MAX_CACHE) state.cache.delete(state.cache.keys().next().value);
  return value;
}

export async function getJson(url, options={}){
  const r = await fetch(url, options);
  if(!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
