import { state, MAX_CACHE } from './config.js?v=4';
import { isValidSolAddress } from './utils.js?v=4';
import { fetchWithCache, fetchPinnedTokens, fetchGMGNTrending } from './api.js?v=4';
import { getDLMMInfoFromLabels, computeAdvancedMetrics, computeAlphaScore } from './engine.js?v=4';
import { updateStaleBadge, showInfoBox, hideInfoBox, showToast, renderList, fillModalData, openModal, closeModal } from './ui.js?v=4';

// Global Error Tracker
(function setupGlobalErrorTracker() {
    async function reportError(payload) {
        try {
            await fetch('/api/log-error', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...payload, url: window.location.href, timestamp: new Date().toISOString() })
            });
        } catch (_) {}
    }

    window.onerror = function (message, source, lineno, colno, error) {
        reportError({
            type: 'runtime',
            message: message ? String(message) : 'Unknown runtime error',
            source: source || '',
            lineno: lineno || 0,
            colno: colno || 0,
            error: error?.stack || error?.message || null
        });
        return false;
    };

    window.addEventListener('unhandledrejection', function (event) {
        const reason = event?.reason;
        reportError({
            type: 'unhandledrejection',
            message: reason?.message || (typeof reason === 'string' ? reason : 'Unhandled promise rejection'),
            source: 'promise',
            lineno: 0,
            colno: 0,
            error: reason?.stack || JSON.stringify(reason || null)
        });
    });
})();


function togglePin(address, event) {
    if (event) event.stopPropagation();
    if (!address) return;
    
    if (state.pinnedTokens.has(address)) {
        state.pinnedTokens.delete(address);
        showToast("Dihapus dari pantauan");
    } else {
        state.pinnedTokens.add(address);
        showToast("Token disematkan!");
    }
    
    localStorage.setItem('masako_pinned_v20', JSON.stringify([...state.pinnedTokens]));
    applyFiltersAndRender();

    if (state.selectedPoolKey === address) {
        const modalPin = document.getElementById('modalPinBtn');
        if (modalPin) {
            const isPinned = state.pinnedTokens.has(address);
            modalPin.classList.toggle('active', isPinned);
            modalPin.innerHTML = isPinned 
                ? `<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="currentColor" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`
                : `<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;
        }
    }
}


async function toggleGMGNTrench() {
    state.gmgnTrenchMode = !state.gmgnTrenchMode;
    document.getElementById('btnGMGNTrench').classList.toggle('active', state.gmgnTrenchMode);

    if (!state.gmgnTrenchMode) return applyFiltersAndRender();

    if (state.currentView !== 'alpha') switchView('alpha');
    try {
        const res = await fetchGMGNTrending({ interval: '1m', limit: 80, mode: 'trench' });
        const trench = Array.isArray(res?.data?.tokens) ? res.data.tokens : (Array.isArray(res?.data) ? res.data : []);
        const allow = new Set(trench.map(t => t.mint || t.address).filter(Boolean));
        state.alphaData = state.alphaData.filter(p => allow.has(p.tokenMint) || allow.has(p.address));
        applyFiltersAndRender();
    } catch (e) {}
}

function switchView(view) {
    if (state.currentView === view) return;
    state.currentView = view;
    
    if (state.ctrlMeteora && view !== 'meteora') { state.ctrlMeteora.abort(); state.isMeteoraLoading = false; }
    if (state.ctrlAlpha && view !== 'alpha') { state.ctrlAlpha.abort(); state.isAlphaLoading = false; }
    if (state.ctrlSearch) { state.ctrlSearch.abort(); }
    
    state.searchQuery = "";
    document.getElementById('searchInput').value = "";
    
    document.getElementById('poolList').innerHTML = '';
    updateStaleBadge(false);
    hideInfoBox();

    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    
    const statusArea = document.getElementById('statusArea');
    const sortMeteora = document.getElementById('sortMeteora');

    if(view === 'meteora') {
        document.getElementById('btnMeteora').classList.add('active');
        document.getElementById('colFeeBin').innerText = "24H Fees";
        sortMeteora.style.display = 'block';
        
        if (state.poolsData.length === 0) {
            statusArea.style.display = 'block';
            statusArea.innerText = 'Mencari Pool DLMM Asli di Meteora...';
            loadPools();
        } else {
            statusArea.style.display = 'none';
            applyFiltersAndRender();
        }
    } else if(view === 'alpha') {
        document.getElementById('btnAlpha').classList.add('active');
        document.getElementById('colFeeBin').innerText = "Market Cap";
        sortMeteora.style.display = 'none';
        
        if (state.alphaData.length === 0) {
            statusArea.style.display = 'block';
            statusArea.innerText = 'Algoritma mengekstrak data pasar organik (Filter Ketat USD Buy > Sell)...';
            fetchAlphaSignals();
        } else {
            statusArea.style.display = 'none';
            applyFiltersAndRender();
        }
    }
}

function filterPoolsByAddress(q) {
    const term = normalizeAddressInput(q).toLowerCase();
    if (!term) return state.currentView === 'meteora' ? state.poolsData : state.alphaData;

    const targetData = state.currentView === 'meteora' ? state.poolsData : state.alphaData;
    const exactMatch = targetData.filter(p => p.address.toLowerCase() === term || p.tokenMint.toLowerCase() === term);
    if (exactMatch.length > 0) return exactMatch;

    return targetData.filter(p => {
        const fields = [p.address, p.tokenMint, p.altMint, p.name].filter(Boolean).map(v => String(v).toLowerCase());
        return fields.some(v => v.includes(term));
    });
}

async function executeSearch() {
    const q = document.getElementById('searchInput').value;
    state.searchQuery = q;
    hideInfoBox();
    
    const filtered = filterPoolsByAddress(q);

    if (filtered.length > 0) {
        renderList(filtered);
    } else {
        renderList([]);
        if (q.length >= 2) {
            await fetchSearchDirectly(q);
        } else {
            showToast("Masukkan Ticker atau CA yang valid.");
        }
    }
}

async function fetchSearchDirectly(q) {
    if (state.ctrlSearch) state.ctrlSearch.abort();
    state.ctrlSearch = new AbortController();
    const signal = state.ctrlSearch.signal;

    const statusArea = document.getElementById('statusArea');
    statusArea.style.display = 'block'; 
    statusArea.innerText = 'Pencarian memindai database on-chain...';

    try {
        const res = await fetchWithCache(`https://api.dexscreener.com/latest/dex/search?q=${q}`, 60000, signal);
        if (signal?.aborted) return;

        const solPairs = (res?.pairs || []).filter(p => p.chainId === 'solana');

        if (Array.isArray(solPairs) && solPairs.length > 0) {
            solPairs.forEach((pair, i) => {
                const pairAddr = pair.pairAddress || pair.url?.split('/').pop() || "";
                if (!state.alphaData.find(p => p.address === pairAddr)) {
                    const newExt = {
                        name: `${pair.baseToken?.symbol || 'UN'}/${pair.quoteToken?.symbol || 'KN'}`,
                        address: pairAddr, tokenMint: pair.baseToken?.address || "", altMint: pair.quoteToken?.address || "",
                        feePct: null, maxFeePct: null, currentFeePct: null, binStep: null, isDLMM: false,
                        vol24h: Number(pair.volume?.h24 || 0), fees24h: null, tvl: Number(pair.liquidity?.usd || 0),
                        price: Number(pair.priceUsd || 0), dexData: pair,
                        logoUrl: pair.info?.imageUrl || pair.baseToken?.logoURI || `https://api.dicebear.com/9.x/identicon/svg?seed=${pair.baseToken?.address || i}&backgroundColor=1e1e1e`,
                        priceChange: getBestPriceChange(pair),
                        dexPrice: Number(pair.priceUsd || 0), pairAddress: pairAddr,
                        ageHours: pair.pairCreatedAt ? (Date.now() - pair.pairCreatedAt) / 3600000 : null,
                        isExternal: true, rank: 0, trueRank: 0
                    };
                    newExt.sniperScore = computeAlphaScore(newExt);
                    state.alphaData.unshift(newExt);
                }
            });
            if (state.currentView !== 'alpha') switchView('alpha');
            applyFiltersAndRender();
        } else {
            statusArea.style.display = 'none';
            showInfoBox("Pencarian Kosong", "Tidak ada token valid yang ditemukan dari hasil pencarian Anda.");
        }
    } catch (e) { 
        if(e.name !== 'AbortError') {
            statusArea.style.display = 'none';
            showInfoBox("Koneksi Lemah", "Permintaan pencarian memakan waktu terlalu lama. Coba sesaat lagi.", true);
        }
    }
}

async function loadPools() {
    if (state.isMeteoraLoading || state.currentView !== 'meteora') return; 
    
    if (Date.now() - state.lastMeteoraFetch < 15000) return;
    state.lastMeteoraFetch = Date.now();

    state.isMeteoraLoading = true;
    hideInfoBox();
    
    if (state.ctrlMeteora) state.ctrlMeteora.abort();
    state.ctrlMeteora = new AbortController();
    const signal = state.ctrlMeteora.signal;

    const statusArea = document.getElementById('statusArea');
    if (state.poolsData.length === 0) {
        statusArea.style.display = 'block';
        statusArea.innerText = 'Mengakses Data DLMM Meteora Murni...';
    }

    try {
        const [boostsRes, profilesRes] = await Promise.allSettled([
            fetchWithCache('https://api.dexscreener.com/token-boosts/top/v1', 60000, signal),
            fetchWithCache('https://api.dexscreener.com/token-profiles/latest/v1', 60000, signal)
        ]);
        
        if (signal?.aborted) return;

        let mintAddressesToFetch = [];
        if (boostsRes.status === 'fulfilled' && Array.isArray(boostsRes.value)) {
            mintAddressesToFetch.push(...boostsRes.value.map(x => x.tokenAddress));
        }
        if (profilesRes.status === 'fulfilled' && Array.isArray(profilesRes.value)) {
            mintAddressesToFetch.push(...profilesRes.value.map(x => x.tokenAddress));
        }

        if (mintAddressesToFetch.length === 0) {
             mintAddressesToFetch = ['So11111111111111111111111111111111111111112', 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbAbdFSvAwwR', 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263'];
        }

        const uniqueMints = [...new Set(mintAddressesToFetch.filter(m => m && isValidSolAddress(m)))];
        
        statusArea.innerText = 'Menyaring Pair DLMM (Anti-DAMM)...';

        let allMeteoraPairs = [];
        const pinnedDexData = await fetchPinnedTokens(signal);
        if (pinnedDexData.length > 0) {
             allMeteoraPairs.push(...pinnedDexData.filter(x => x.dexId === 'meteora'));
        }

        for(let i=0; i < uniqueMints.length; i+=30) {
            const chunk = uniqueMints.slice(i, i+30).join(',');
            const res = await fetchWithCache(`https://api.dexscreener.com/latest/dex/tokens/${chunk}`, 30000, signal).catch(()=>null);
            if (signal?.aborted) return;
            
            if(res && res.pairs) {
                const filteredPairs = res.pairs.filter(x => x.chainId === 'solana' && x.dexId === 'meteora');
                allMeteoraPairs.push(...filteredPairs);
            }
            await sleep(200); 
        }

        if (allMeteoraPairs.length === 0) throw new Error("Tidak ada pool Meteora ditemukan.");

        const mappedData = allMeteoraPairs.map((dex, index) => {
            const dlmmInfo = getDLMMInfoFromLabels(dex.labels);
            const tokenMint = dex.baseToken?.address;
            const altMint = dex.quoteToken?.address;
            const vol24h = Number(dex.volume?.h24 || 0);
            const tvl = Number(dex.liquidity?.usd || 0);
            
            const feePct = dlmmInfo.fee !== null ? dlmmInfo.fee : 0.3;
            const estimatedFees24h = vol24h * (feePct / 100);

            const newPool = {
                name: `${dex.baseToken?.symbol || 'UN'}/${dex.quoteToken?.symbol || 'KN'}`,
                address: dex.pairAddress, 
                tokenMint: tokenMint,
                altMint: altMint,
                feePct: feePct, 
                maxFeePct: feePct * 1.5,
                vol24h: vol24h, 
                fees24h: estimatedFees24h,
                tvl: tvl,
                dexData: dex, 
                logoUrl: dex.info?.imageUrl || dex.baseToken?.logoURI || `https://api.dicebear.com/9.x/identicon/svg?seed=${tokenMint || index}&backgroundColor=1e1e1e`, 
                priceChange: getBestPriceChange(dex),
                dexPrice: Number(dex.priceUsd || 0), 
                pairAddress: dex.pairAddress,
                ageHours: dex.pairCreatedAt ? (Date.now() - dex.pairCreatedAt) / 3600000 : null,
                isExternal: false,
                binStep: dlmmInfo.binStep,
                isDLMM: dlmmInfo.isDLMM && !dlmmInfo.isDAMM 
            };
            
            newPool.trendScore = (Math.log10(newPool.vol24h + 1) * 30) + (Math.min(newPool.vol24h / (newPool.tvl || 1), 100) * 15);
            return newPool;
        });

        const validPools = mappedData.filter(p => state.pinnedTokens.has(p.address) || (p.dexPrice > 0 && p.vol24h >= 1000 && p.tvl >= 1000 && p.isDLMM));
        
        const uniquePoolsMap = new Map();
        validPools.forEach(p => {
            if (!uniquePoolsMap.has(p.address) || p.tvl > uniquePoolsMap.get(p.address).tvl) {
                uniquePoolsMap.set(p.address, p);
            }
        });
        const finalUniquePools = Array.from(uniquePoolsMap.values());

        if (finalUniquePools.length > 0) {
            state.poolsData = finalUniquePools;
            updateStaleBadge(false);
        } 

        if (state.currentView === 'meteora') applyFiltersAndRender();
        
        if (state.selectedPoolKey) {
            const t = state.poolsData.find(p => p.address === state.selectedPoolKey);
            if(t) { try { fillModalData(t); } catch(e){} }
        }

    } catch (err) {
        if(err.name !== 'AbortError') {
            if (state.poolsData.length > 0) updateStaleBadge(true); 
            else {
                if (statusArea) statusArea.style.display = 'none';
                showInfoBox("Kendala API Agregator", "Gagal memuat pool Meteora dari DexScreener. Pastikan koneksi stabil.", true);
            }
        }
    } finally { 
        state.isMeteoraLoading = false; 
        if (statusArea && (state.poolsData.length > 0 || document.getElementById('systemInfo').classList.contains('show'))) {
            statusArea.style.display = 'none';
        }
    }
}

async function fetchAlphaSignals() {
    if (state.isAlphaLoading || state.currentView !== 'alpha') return; 
    
    if (Date.now() - state.lastAlphaFetch < 15000) return;
    state.lastAlphaFetch = Date.now();

    state.isAlphaLoading = true;
    hideInfoBox();
    
    if (state.ctrlAlpha) state.ctrlAlpha.abort();
    state.ctrlAlpha = new AbortController();
    const signal = state.ctrlAlpha.signal;

    const statusArea = document.getElementById('statusArea');
    if (state.alphaData.length === 0) {
        statusArea.style.display = 'block'; 
        statusArea.innerText = 'Algoritma mengekstrak data pasar organik (Filter Bot Spam aktif)...';
    }

    try {
        const [bRes, pRes] = await Promise.allSettled([
            fetchWithCache('https://api.dexscreener.com/token-boosts/top/v1', 60000, signal),
            fetchWithCache('https://api.dexscreener.com/token-profiles/latest/v1', 60000, signal)
        ]);
        
        if (signal?.aborted) return;

        let rawMints = [];
        if (bRes.status === 'fulfilled' && Array.isArray(bRes.value)) rawMints.push(...bRes.value.map(x => x.tokenAddress));
        if (pRes.status === 'fulfilled' && Array.isArray(pRes.value)) rawMints.push(...pRes.value.map(x => x.tokenAddress));
        
        const uniqueMints = [...new Set(rawMints.filter(m => m && !IGNORED_MINTS.has(m)))];

        let allPairs = [];
        const pinnedDexData = await fetchPinnedTokens(signal);
        if (pinnedDexData.length > 0) allPairs.push(...pinnedDexData);

        for(let i=0; i < uniqueMints.length; i+=30) {
            const chunk = uniqueMints.slice(i, i+30).join(',');
            const res = await fetchWithCache(`https://api.dexscreener.com/latest/dex/tokens/${chunk}`, 30000, signal).catch(()=>null);
            if (signal?.aborted) return;
            if(res && res.pairs) {
                 allPairs.push(...res.pairs.filter(x => x.chainId === 'solana' && !IGNORED_MINTS.has(x.baseToken?.address)));
            }
        }

        const uniquePairsMap = new Map();
        allPairs.forEach(p => uniquePairsMap.set(p.pairAddress, p));
        const finalRawPairs = Array.from(uniquePairsMap.values());

        if (finalRawPairs.length === 0) throw new Error("Data Kosong");

        finalRawPairs.sort((a,b) => (Number(b.volume?.h24) || 0) - (Number(a.volume?.h24) || 0));

        const candidates = [];
        for (let i = 0; i < finalRawPairs.length; i++) {
            const pair = finalRawPairs[i];
            const p = {
                name: `${pair.baseToken?.symbol || 'UN'}/${pair.quoteToken?.symbol || 'KN'}`,
                address: pair.pairAddress, tokenMint: pair.baseToken?.address || "", altMint: pair.quoteToken?.address || "",
                feePct: null, maxFeePct: null, currentFeePct: null, binStep: null, isDLMM: false,
                vol24h: Number(pair.volume?.h24 || 0), fees24h: null, tvl: Number(pair.liquidity?.usd || 0),
                price: Number(pair.priceUsd || 0), dexData: pair,
                logoUrl: pair.info?.imageUrl || pair.baseToken?.logoURI || `https://api.dicebear.com/9.x/identicon/svg?seed=${pair.baseToken?.address || i}&backgroundColor=1e1e1e`,
                priceChange: getBestPriceChange(pair),
                dexPrice: Number(pair.priceUsd || 0), pairAddress: pair.pairAddress,
                ageHours: pair.pairCreatedAt ? (Date.now() - pair.pairCreatedAt) / 3600000 : null,
                isExternal: true, rank: 0, trueRank: i + 1 
            };
            candidates.push(p);
        }

        const totalVol = candidates.reduce((sum, p) => sum + (p.vol24h || 0), 0);
        const avgVol = candidates.length > 0 ? totalVol / candidates.length : 0;

        const validMemes = candidates.filter(p => {
            if (state.pinnedTokens.has(p.address)) return true;

            const fdv = p.dexData?.fdv || 0;
            const tvl = p.tvl || 0;
            const vol24 = p.vol24h || 0;
            
            const m = computeAdvancedMetrics(p, avgVol);

            return fdv >= 10000 && fdv <= 50000000 && 
                   tvl >= 3000 && 
                   vol24 >= 50000 && 
                   !m.isBotSpam &&
                   m.validUsdTrend && 
                   m.volSpike >= 1.0 &&
                   p.priceChange >= -70;
        });

        validMemes.forEach(p => p.sniperScore = computeAlphaScore(p, avgVol));

        const filteredList = validMemes.sort((a,b) => b.sniperScore - a.sniperScore)
                                     .slice(0, 30)
                                     .filter(p => state.pinnedTokens.has(p.address) || p.sniperScore > 0);

        if (filteredList.length > 0) {
            state.alphaData = filteredList;
            updateStaleBadge(false);
        } else if (state.alphaData.length === 0) {
             if (statusArea) statusArea.style.display = 'none';
             showInfoBox("Radar Standby", "Tidak ada sinyal Alpha yang lolos filter anti-bot dan dominasi USD Buy hari ini.", true);
        }

        if (filteredList.length > 0 && state.currentView === 'alpha') {
            applyFiltersAndRender();
        }

    } catch (e) {
        if(e.name !== 'AbortError') {
            if (state.alphaData.length > 0) updateStaleBadge(true); 
            else {
                if (statusArea) statusArea.style.display = 'none';
                showInfoBox("Akses Dibatasi", "Agregator membatasi permintaan Anda. Sistem akan menyegarkan otomatis.", true);
            }
        }
    } finally {
        state.isAlphaLoading = false;
        if (statusArea && (state.alphaData.length > 0 || document.getElementById('systemInfo').classList.contains('show'))) {
            statusArea.style.display = 'none';
        }
    }
}

function applyFiltersAndRender() {
    let data = state.currentView === 'meteora' ? state.poolsData.slice() : state.alphaData.slice();
    
    if (state.currentView === 'meteora') {
        const sortType = document.getElementById('sortMeteora').value;
        if (sortType === 'fees') {
            data.sort((a, b) => (b.fees24h || 0) - (a.fees24h || 0));
        } else {
            data.sort((a, b) => (b.trendScore || 0) - (a.trendScore || 0));
        }
        data.forEach((p, idx) => p.rank = idx + 1);
    } else {
        data.sort((a, b) => (b.sniperScore || 0) - (a.sniperScore || 0));
    }

    data.sort((a, b) => {
        const aPinned = state.pinnedTokens.has(a.address) ? 1 : 0;
        const bPinned = state.pinnedTokens.has(b.address) ? 1 : 0;
        return bPinned - aPinned;
    });

    if (state.searchQuery) {
        const term = normalizeAddressInput(state.searchQuery).toLowerCase();
        data = data.filter(p => [p.address, p.tokenMint, p.altMint, p.name].filter(Boolean).map(v=>String(v).toLowerCase()).some(v=>v.includes(term)));
    }
    
    if (data.length > 0) {
        document.getElementById('statusArea').style.display = 'none';
    }

    renderList(data);
}

function startAutoRefresh() {
    if (state.refreshTimer) clearInterval(state.refreshTimer);
    state.refreshTimer = setInterval(() => {
        if (document.visibilityState === "visible") {
            if (state.currentView === 'meteora') loadPools();
            else fetchAlphaSignals();
        }
    }, 30000); 
}

// BINDING KE WINDOW GLOBAL UNTUK MENCEGAH ERROR DI HTML
window.switchView = switchView;
window.applyFiltersAndRender = applyFiltersAndRender;
window.closeModal = closeModal;
window.openModal = openModal;
window.togglePin = togglePin;
window.toggleGMGNTrench = toggleGMGNTrench;

// INITIALIZATION
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('searchBtn').onclick = executeSearch;
    document.getElementById('searchInput').addEventListener('keydown', (e) => { 
        if (e.key === 'Enter') executeSearch(); 
    });
});

document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
        const now = Date.now();
        if (state.currentView === 'meteora' && now - state.lastMeteoraFetch > 30000) loadPools();
        else if (state.currentView === 'alpha' && now - state.lastAlphaFetch > 30000) fetchAlphaSignals();
    }
});

window.onload = () => { 
    loadPools(); 
    startAutoRefresh(); 
};