import { state, MAX_CACHE } from './config.js';
import { isValidSolAddress } from './utils.js';

function createHttpError(status, url, body = '') {
    const err = new Error(`HTTP ${status} at ${url}${body ? `: ${body}` : ''}`);
    err.name = 'ApiHttpError';
    err.status = status;
    err.url = url;
    return err;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function isRetryableStatus(status) {
    return [408, 425, 429, 500, 502, 503, 504].includes(Number(status));
}

function getFriendlyBody(text) {
    if (!text) return '';
    return String(text).replace(/\s+/g, ' ').slice(0, 220);
}

function safeJsonParse(text, url) {
    try {
        return JSON.parse(text);
    } catch {
        const snippet = getFriendlyBody(text);
        const err = new Error(`Invalid JSON from ${url}${snippet ? `: ${snippet}` : ''}`);
        err.name = 'ApiParseError';
        err.url = url;
        throw err;
    }
}

function cleanupSessionStorage(prefixes = ['mt_native_', 'rc_sec_'], maxEntries = 100) {
    try {
        const now = Date.now();
        const entries = [];
        for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i);
            if (!key || !prefixes.some(p => key.startsWith(p))) continue;
            const raw = sessionStorage.getItem(key);
            let parsed = null;
            try { parsed = raw ? JSON.parse(raw) : null; } catch {}
            const time = Number(parsed?.time || 0);
            entries.push({ key, time });
            if (!time || now - time > 300000) sessionStorage.removeItem(key);
        }
        const fresh = entries.filter(e => e.time > 0).sort((a, b) => b.time - a.time);
        if (fresh.length > maxEntries) {
            fresh.slice(maxEntries).forEach(e => sessionStorage.removeItem(e.key));
        }
    } catch {}
}

function cacheSet(map, key, value, maxSize = MAX_CACHE) {
    if (map.size >= maxSize) {
        const firstKey = map.keys().next().value;
        map.delete(firstKey);
    }
    map.set(key, value);
}

export function json(res, status, payload) {
    res.status(status).setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(payload));
}

export async function fetchWithCache(url, ttl = 60000, signal = null) {
    const now = Date.now();
    const cached = state.apiCache.get(url);
    if (cached && (now - cached.time < ttl)) { return cached.data; }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(new Error('Request timeout')), 15000);
    let abortListener = null;
    if (signal) {
        abortListener = () => controller.abort(signal.reason || new Error('Aborted'));
        signal.addEventListener('abort', abortListener, { once: true });
    }
    let lastErr = null;
    try {
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const res = await fetch(url, { signal: controller.signal, cache: 'no-store', headers: { 'Accept': 'application/json, text/plain, */*' } });
                if (!res.ok) {
                    const bodyText = getFriendlyBody(await res.text().catch(() => ''));
                    const err = createHttpError(res.status, url, bodyText);
                    if (res.status === 429) {
                        const retryAfter = Number(res.headers.get('retry-after') || 0);
                        const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 700 * (attempt + 1);
                        lastErr = err;
                        if (attempt < 2) { await sleep(waitMs); continue; }
                    }
                    if (isRetryableStatus(res.status) && attempt < 2) {
                        lastErr = err;
                        await sleep(500 * (attempt + 1));
                        continue;
                    }
                    throw err;
                }
                const text = await res.text();
                if (!text || !text.trim()) { throw new Error(`Empty response from ${url}`); }
                const data = safeJsonParse(text, url);
                cacheSet(state.apiCache, url, { data, time: now });
                return data;
            } catch (err) {
                lastErr = err;
                if (err?.name === 'AbortError') throw err;
                if (attempt < 2 && (err?.status === 429 || err?.status >= 500 || err?.name === 'TypeError' || err?.name === 'ApiParseError')) {
                    await sleep(500 * (attempt + 1));
                    continue;
                }
                break;
            }
        }
        if (cached) return cached.data;
        throw lastErr || new Error(`Request failed: ${url}`);
    } finally {
        clearTimeout(timeoutId);
        if (signal && abortListener) { signal.removeEventListener('abort', abortListener); }
    }
}

// ==== METEORA APIs ====
export async function fetchMeteoraDiscoveryAPI(signal = null) {
    const query = 'page_size=50&filter_by=base_token_has_critical_warnings%3Dfalse%26quote_token_has_critical_warnings%3Dfalse%26pool_type%3Ddlmm%26base_token_market_cap%3E%3D150000%26base_token_holders%3E%3D100%26volume%3E%3D1000%26active_tvl%3E%3D10000%26fee_active_tvl_ratio%3E%3D0.01%26base_token_organic_score%3E%3D20%26quote_token_organic_score%3E%3D20&timeframe=24h&category=top';
    return fetchWithCache(`https://pool-discovery-api.datapi.meteora.ag/pools?${query}`, 45000, signal);
}

export async function fetchMeteoraAdvancedMetrics(poolAddress, signal = null) {
    if (!poolAddress) return null;
    const url = `https://pool-discovery-api.datapi.meteora.ag/pools?filter_by=pool_address%3D${poolAddress}&page_size=1`;
    return fetchWithCache(url, 30000, signal);
}

export async function fetchMeteoraNative(pairAddress) {
    if (!pairAddress) return null;
    cleanupSessionStorage();
    const cacheKey = 'mt_native_' + pairAddress;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) { try { const parsed = JSON.parse(cached); if (Date.now() - parsed.time < 120000) return parsed.data; } catch {} }
    try {
        // PERBAIKAN: Gunakan endpoint dlmm-api yang asli dan valid
        const res = await fetch(`https://dlmm-api.meteora.ag/pair/${pairAddress}`, { headers: { 'Accept': 'application/json' } });
        if (!res.ok) return null;
        const text = await res.text();
        if (!text || !text.trim()) return null;
        const data = safeJsonParse(text, `https://dlmm-api.meteora.ag/pair/${pairAddress}`);
        sessionStorage.setItem(cacheKey, JSON.stringify({ data, time: Date.now() }));
        return data;
    } catch { return null; }
}

// ==== SECURITY & THIRD PARTY APIs ====

export async function fetchRugCheckSecure(mint) {
    if (!mint || !isValidSolAddress(mint)) return null;

    cleanupSessionStorage();
    const cacheKey = 'rc_sec_' + mint;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) { 
        try { 
            const parsed = JSON.parse(cached); 
            if (Date.now() - parsed.time < 300000) return parsed.data; 
        } catch {} 
    }
    try {
        const res = await fetch(`/api/rugcheck?mint=${mint}`, { headers: { 'Accept': 'application/json' } });
        if (!res.ok) return null;
        const data = await res.json();
        if (!data) return null;
        sessionStorage.setItem(cacheKey, JSON.stringify({ data, time: Date.now() }));
        return data;
    } catch { return null; }
}

// === API BARU: AMBIL DAFTAR DOMPET DEX DARI RUGCHECK ===
export async function fetchRugCheckKnownAccounts(signal = null) {
    // Cache sangat lama (24 jam) karena daftar akun ini jarang berubah
    return fetchWithCache('https://api.rugcheck.xyz/public/known_accounts.json', 86400000, signal).catch(() => ({}));
}

export async function fetchPinnedTokens(signal) {
    if (state.pinnedTokens.size === 0) return [];
    const arrPins = Array.from(state.pinnedTokens);
    const fetchedPairs = [];
    for (let i = 0; i < arrPins.length; i += 30) {
        const chunk = arrPins.slice(i, i + 30).join(',');
        const res = await fetchWithCache(`https://api.dexscreener.com/latest/dex/tokens/${chunk}`, 30000, signal).catch(() => null);
        if (signal?.aborted) return [];
        if (res && Array.isArray(res.pairs)) { fetchedPairs.push(...res.pairs.filter(x => x.chainId === 'solana')); }
    }
    return fetchedPairs;
}

export async function fetchGMGNTokenAnalysis({ mint, pairAddress }, signal = null) {
    const q = new URLSearchParams();
    if (mint) q.set('mint', mint);
    if (pairAddress) q.set('pairAddress', pairAddress);
    return fetchWithCache(`/api/gmgn-token?${q.toString()}`, 45000, signal);
}

export async function fetchGMGNTrending({ interval = '1m', limit = 50, mode = 'trending' } = {}, signal = null) {
    const q = new URLSearchParams({ interval, limit: String(limit), mode });
    return fetchWithCache(`/api/gmgn-trending?${q.toString()}`, mode === 'trench' ? 45000 : 8000, signal);
}

// ==== UTILS & MANAGERS ====
export function normalizeGMGNToken(payload = {}) {
    const root = payload?.data ?? payload ?? {};
    return root.data || root.result || root.token || root || {};
}

export function normalizeGMGNTrending(payload = {}) {
    const root = payload?.data ?? payload ?? {};
    const list = root.tokens || root.list || root.items || root.rows || root.trends || root.data || root.result || [];
    return Array.isArray(list) ? list : [];
}

const requestManager = { queue: [], active: 0, limit: 3, timers: new Map(), modalController: null };

export function createRequestManager({ concurrency = 3 } = {}) {
    requestManager.limit = Math.max(1, concurrency);
    return {
        enqueue(task) {
            return new Promise((resolve, reject) => {
                requestManager.queue.push(async () => {
                    try { resolve(await task()); } catch (e) { reject(e); }
                });
                drainQueue();
            });
        },
        debounce(key, fn, wait = 200) {
            clearTimeout(requestManager.timers.get(key));
            return new Promise(resolve => {
                const id = setTimeout(async () => resolve(await fn()), wait);
                requestManager.timers.set(key, id);
            });
        },
        abortPreviousModal() {
            if (requestManager.modalController) requestManager.modalController.abort();
            requestManager.modalController = new AbortController();
            return requestManager.modalController.signal;
        }
    };
}

function drainQueue() {
    while (requestManager.active < requestManager.limit && requestManager.queue.length) {
        const job = requestManager.queue.shift();
        requestManager.active++;
        Promise.resolve(job()).finally(() => { requestManager.active--; drainQueue(); });
    }
}
