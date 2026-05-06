import { state, MAX_CACHE } from './config.js';
import { isValidSolAddress } from './utils.js';

export function setCacheLimit(map, key, value, maxSize = MAX_CACHE) {
    if (value === null || value === undefined || value === "" || Number.isNaN(value)) {
        return map.get(key) ?? null;
    }
    if (map.size >= maxSize) {
        const firstKey = map.keys().next().value;
        map.delete(firstKey);
    }
    map.set(key, value);
    return value;
}

export async function fetchWithCache(url, ttl = 60000, signal = null) {
    const now = Date.now();
    if (state.apiCache.has(url)) {
        const c = state.apiCache.get(url);
        if (now - c.time < ttl) return c.data;
    }
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); 
    
    if (signal) {
        signal.addEventListener('abort', () => {
            clearTimeout(timeoutId);
            controller.abort();
        });
    }

    try {
        const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
        clearTimeout(timeoutId);
        if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
        const data = await res.json();
        setCacheLimit(state.apiCache, url, { data, time: now });
        return data;
    } catch (e) {
        clearTimeout(timeoutId);
        if (state.apiCache.has(url)) return state.apiCache.get(url).data; 
        throw e; 
    }
}

export async function fetchMeteoraNative(pairAddress) {
    if(!pairAddress) return null;
    const cacheKey = 'mt_native_' + pairAddress;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
        const parsed = JSON.parse(cached);
        if (Date.now() - parsed.time < 120000) return parsed.data; 
    }
    try {
        const res = await fetch(`https://dlmm-api.meteora.ag/pair/${pairAddress}`);
        if (!res.ok) return null;
        const data = await res.json();
        sessionStorage.setItem(cacheKey, JSON.stringify({ data: data, time: Date.now() }));
        return data;
    } catch(e) { return null; }
}

export async function fetchRugCheckSecure(mint) {
    if(!mint || !isValidSolAddress(mint)) return null;
    const cacheKey = 'rc_sec_' + mint;
    const cached = sessionStorage.getItem(cacheKey);
    
    if (cached) {
        const parsed = JSON.parse(cached);
        if (Date.now() - parsed.time < 300000) return parsed.data; 
    }

    try {
        const res = await fetch(`https://api.rugcheck.xyz/v1/tokens/${mint}/report`);
        if (!res.ok) return null; 
        const data = await res.json();
        sessionStorage.setItem(cacheKey, JSON.stringify({ data: data, time: Date.now() }));
        return data;
    } catch(e) { return null; }
}

export async function fetchPinnedTokens(signal) {
    if (state.pinnedTokens.size === 0) return [];
    const arrPins = Array.from(state.pinnedTokens);
    let fetchedPairs = [];

    for(let i=0; i < arrPins.length; i+=30) {
        const chunk = arrPins.slice(i, i+30).join(',');
        const res = await fetchWithCache(`https://api.dexscreener.com/latest/dex/tokens/${chunk}`, 30000, signal).catch(()=>null);
        if (signal?.aborted) return [];
        if(res && res.pairs) {
            const validSolana = res.pairs.filter(x => x.chainId === 'solana');
            fetchedPairs.push(...validSolana);
        }
    }
    return fetchedPairs;
}
