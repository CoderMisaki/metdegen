import { state, MAX_CACHE, IGNORED_MINTS } from './config.js';
import { isValidSolAddress, normalizeAddressInput } from './utils.js';
import { fetchWithCache, fetchPinnedTokens, fetchGMGNTrending, normalizeGMGNTrending, fetchMeteoraDiscoveryAPI } from './api.js';
import { getDLMMInfoFromLabels, computeAdvancedMetrics, computeAlphaScore } from './engine.js';
import { updateStaleBadge, showInfoBox, hideInfoBox, showToast, renderList, fillModalData, openModal, closeModal } from './ui.js';

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
        reportError({ type: 'runtime', message: message ? String(message) : 'Unknown runtime error', source: source || '', lineno: lineno || 0, colno: colno || 0, error: error?.stack || error?.message || null }); 
        return false; 
    }; 
    window.addEventListener('unhandledrejection', function (event) { 
        const reason = event?.reason;
        
        let errorMessage = 'Unhandled promise rejection';
        let errorStack = null;

        if (reason instanceof Error) {
            errorMessage = reason.message;
            errorStack = reason.stack;
        } else if (typeof reason === 'string') {
            errorMessage = reason;
        } else {
            try {
                errorMessage = JSON.stringify(reason);
            } catch (e) {
                errorMessage = 'Unstringifiable Promise Rejection object';
            }
        }

        reportError({ 
            type: 'unhandledrejection', 
            message: errorMessage, 
            source: 'promise', 
            lineno: 0, 
            colno: 0, 
            error: errorStack || errorMessage 
        }); 
    });
})();

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

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
            modalPin.innerHTML = isPinned ? `<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="currentColor" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>` : `<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`; 
        } 
    }
}

function getReadableApiError(err) {
    if (!err) return 'Gagal memuat data agregator.';

    const msg = String(err.message || '').toLowerCase(); 
    if (err.status === 429 || msg.includes('429')) return 'Permintaan terlalu sering. API sedang membatasi akses sementara.'; 
    if (err.status === 403 || msg.includes('403')) return 'Akses ditolak oleh upstream. Cek header, key, atau kebijakan API.'; 
    if (err.status >= 500) return 'Server upstream sedang bermasalah. Coba lagi beberapa saat.'; 
    if (msg.includes('invalid json') || msg.includes('empty response')) return 'API mengirim response yang tidak valid atau kosong.'; 
    if (err.name === 'AbortError') return 'Request dibatalkan karena timeout.'; 
    return 'Gagal memuat data dari agregator.';
}

function getTrendingAddress(item) {
    return String(item?.mint || item?.address || item?.tokenAddress || item?.wallet || item?.owner || item?.baseToken?.address || item?.token_mint || '').trim();
}

function buildAlphaFromDexPair(pair, index) {
    return {
        name: `${pair.baseToken?.symbol || 'UN'}/${pair.quoteToken?.symbol || 'KN'}`,
        address: pair.pairAddress || '',
        tokenMint: pair.baseToken?.address || '',
        altMint: pair.quoteToken?.address || '',
        feePct: null, maxFeePct: null, currentFeePct: null, binStep: null, isDLMM: false,
        vol24h: Number(pair.volume?.h24 || 0), fees24h: null, tvl: Number(pair.liquidity?.usd || 0), price: Number(pair.priceUsd || 0),
        dexData: pair, logoUrl: pair.info?.imageUrl || pair.baseToken?.logoURI || `https://api.dicebear.com/9.x/identicon/svg?seed=${pair.baseToken?.address || index}&backgroundColor=1e1e1e`,
        priceChange: getBestPriceChange(pair), dexPrice: Number(pair.priceUsd || 0), pairAddress: pair.pairAddress || '',
        ageHours: pair.pairCreatedAt ? (Date.now() - pair.pairCreatedAt) / 3600000 : null,
        isExternal: true, rank: 0, trueRank: index + 1
    };
}

async function toggleGMGNTrench() {
    state.gmgnTrenchMode = !state.gmgnTrenchMode;

    const btn = document.getElementById('btnGMGNTrench'); 
    if (btn) btn.classList.toggle('active', state.gmgnTrenchMode); 
    
    if (!state.gmgnTrenchMode) { 
        state.alphaData = state.alphaBaseData.map(p => ({ ...p })); 
        showInfoBox('GMGN Trench Off', 'Mode trench dimatikan. Menampilkan semua signal Alpha.'); 
        applyFiltersAndRender(); return; 
    } 
    
    if (state.currentView !== 'alpha') switchView('alpha'); 
    const statusArea = document.getElementById('statusArea'); 
    statusArea.style.display = 'block'; 
    statusArea.innerText = 'Mengambil GMGN trenches lalu enrichment DexScreener...'; 
    
    if (state.ctrlAlpha) state.ctrlAlpha.abort(); 
    state.ctrlAlpha = new AbortController(); 
    const signal = state.ctrlAlpha.signal; 
    
    try { 
        const trenchRes = await fetchGMGNTrending({ mode: 'trench', limit: 80 }, signal); 
        if (signal?.aborted) return; 
        const trenchList = normalizeGMGNTrending(trenchRes); 
        const mints = [...new Set(trenchList.map(getTrendingAddress).filter(Boolean))]; 
        if (mints.length === 0) throw new Error('GMGN trench list empty'); 
        
        const pairs = []; 
        for (let i = 0; i < mints.length; i += 30) { 
            const chunk = mints.slice(i, i + 30).join(','); 
            const dexRes = await fetchWithCache(`https://api.dexscreener.com/latest/dex/tokens/${chunk}`, 30000, signal).catch(() => null); 
            if (signal?.aborted) return; 
            if (dexRes?.pairs && Array.isArray(dexRes.pairs)) { pairs.push(...dexRes.pairs.filter(p => p.chainId === 'solana')); } 
        } 
        const uniq = Array.from(new Map(pairs.map(p => [p.pairAddress, p])).values()); 
        const built = uniq.map((pair, i) => buildAlphaFromDexPair(pair, i)).filter(p => p.address); 
        if (built.length === 0) throw new Error('GMGN trenches found, but DexScreener enrichment returned empty'); 
        
        const totalVol = built.reduce((sum, p) => sum + (p.vol24h || 0), 0); 
        const avgVol = built.length > 0 ? totalVol / built.length : 0; 
        built.forEach(p => p.sniperScore = computeAlphaScore(p, avgVol)); 
        built.sort((a, b) => (b.sniperScore || 0) - (a.sniperScore || 0)); 
        
        state.alphaBaseData = built.map(p => ({ ...p })); 
        state.alphaData = built.map(p => ({ ...p })); 
        showInfoBox('GMGN Trench Active', `Mode trench aktif. ${built.length} token berhasil dibangun dari GMGN trenches.`, false); 
        applyFiltersAndRender(); 
    } catch (e) { 
        showInfoBox('GMGN Trench Error', `Gagal memuat trench GMGN: ${e.message}`, true); 
        state.gmgnTrenchMode = false; 
        if (btn) btn.classList.remove('active'); 
        state.alphaData = state.alphaBaseData.map(p => ({ ...p })); 
        applyFiltersAndRender(); 
    } finally { 
        statusArea.style.display = 'none'; 
    }
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
            statusArea.innerText = 'Menjalankan Radar Meteora DLMM...'; 
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
        const res = await fetchWithCache(`https://api.dexscreener.com/latest/dex/search?q=${q}`, 60000, signal).catch(() => null); 
        if (signal?.aborted || !res) return; 
        const solPairs = (res?.pairs || []).filter(p => p.chainId === 'solana'); 
        if (Array.isArray(solPairs) && solPairs.length > 0) { 
            solPairs.forEach((pair, i) => { 
                const pairAddr = pair.pairAddress || pair.url?.split('/').pop() || ""; 
                if (!state.alphaData.find(p => p.address === pairAddr)) { 
                    const newExt = { 
                        name: `${pair.baseToken?.symbol || 'UN'}/${pair.quoteToken?.symbol || 'KN'}`, 
                        address: pairAddr, tokenMint: pair.baseToken?.address || "", altMint: pair.quoteToken?.address || "", 
                        feePct: null, maxFeePct: null, currentFeePct: null, binStep: null, isDLMM: false, 
                        vol24h: Number(pair.volume?.h24 || 0), fees24h: null, tvl: Number(pair.liquidity?.usd || 0), price: Number(pair.priceUsd || 0), 
                        dexData: pair, logoUrl: pair.info?.imageUrl || pair.baseToken?.logoURI || `https://api.dicebear.com/9.x/identicon/svg?seed=${pair.baseToken?.address || i}&backgroundColor=1e1e1e`, 
                        priceChange: getBestPriceChange(pair), dexPrice: Number(pair.priceUsd || 0), pairAddress: pairAddr, 
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
        let mappedData = [];
        let useFallback = false;

        try {
            statusArea.innerText = 'Memanggil API Meteora Pool Discovery...';
            const meteoraRes = await fetchMeteoraDiscoveryAPI(signal);
            if (signal?.aborted) return;

            if (meteoraRes && Array.isArray(meteoraRes.data) && meteoraRes.data.length > 0) {
                mappedData = meteoraRes.data.map((pool, index) => {
                    const tokenX = pool.token_x || {};
                    const tokenY = pool.token_y || {};
                    
                    // MEMPERBAIKI NAMA FIELD ASLI DARI JSON METEORA
                    const vol24h = Number(pool.volume || pool.trade_volume_24h || 0);
                    const tvl = Number(pool.tvl || pool.liquidity || 0);
                    const fees24h = Number(pool.fee || pool.fees_24h || 0);
                    const baseFee = Number(pool.base_fee_percentage || 0.3); // fallback standar 0.3%
                    
                    const newPool = {
                        name: pool.name || `${tokenX.symbol || 'UN'}/${tokenY.symbol || 'KN'}`,
                        address: pool.pool_address,
                        tokenMint: tokenX.address,
                        altMint: tokenY.address,
                        feePct: baseFee,
                        maxFeePct: Number(pool.max_fee_percentage || baseFee * 1.5),
                        vol24h: vol24h,
                        fees24h: fees24h,
                        tvl: tvl,
                        dexData: pool, 
                        logoUrl: tokenX.icon || `https://api.dicebear.com/9.x/identicon/svg?seed=${tokenX.address || index}&backgroundColor=1e1e1e`,
                        priceChange: 0, 
                        dexPrice: Number(tokenX.price || 0),
                        pairAddress: pool.pool_address,
                        ageHours: pool.created_at ? (Date.now() - (pool.created_at * 1000)) / 3600000 : null,
                        isExternal: false,
                        binStep: Number(pool.bin_step || pool.binStep || 0),
                        isDLMM: true 
                    };
                    
                    newPool.trendScore = (Math.log10(newPool.vol24h + 1) * 30) + (Math.min(newPool.vol24h / (newPool.tvl || 1), 100) * 15);
                    return newPool;
                });
            } else {
                throw new Error("Meteora API mengembalikan array kosong atau JSON tidak valid.");
            }

        } catch (meteoraErr) {
            if (meteoraErr.name === 'AbortError') throw meteoraErr;
            console.error("[METEORA API ERROR] Gagal mengeksekusi JSON Meteora Pool Discovery!", meteoraErr.message);
            useFallback = true;
        }

        if (useFallback) {
            statusArea.innerText = 'Fallback: Menyaring Pair DLMM Meteora dari DexScreener...';

            const [boostsRes, profilesRes] = await Promise.allSettled([
                fetchWithCache('https://api.dexscreener.com/token-boosts/top/v1', 60000, signal).catch(() => null),
                fetchWithCache('https://api.dexscreener.com/token-profiles/latest/v1', 60000, signal).catch(() => null)
            ]);
            
            if (signal?.aborted) return;
            
            let mintAddressesToFetch = [];
            if (boostsRes.status === 'fulfilled' && Array.isArray(boostsRes.value)) mintAddressesToFetch.push(...boostsRes.value.map(x => x.tokenAddress));
            if (profilesRes.status === 'fulfilled' && Array.isArray(profilesRes.value)) mintAddressesToFetch.push(...profilesRes.value.map(x => x.tokenAddress));
            
            if (mintAddressesToFetch.length === 0) {
                mintAddressesToFetch = ['So11111111111111111111111111111111111111112', 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbAbdFSvAwwR', 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263'];
            }
            
            const uniqueMints = [...new Set(mintAddressesToFetch.filter(m => m && isValidSolAddress(m)))];
            let allMeteoraPairs = [];
            const pinnedDexData = await fetchPinnedTokens(signal);
            
            if (pinnedDexData.length > 0) allMeteoraPairs.push(...pinnedDexData.filter(x => x.dexId === 'meteora'));
            
            for(let i=0; i < uniqueMints.length; i+=30) {
                const chunk = uniqueMints.slice(i, i+30).join(',');
                const res = await fetchWithCache(`https://api.dexscreener.com/latest/dex/tokens/${chunk}`, 30000, signal).catch(() => null);
                if (signal?.aborted) return;
                
                if(res && res.pairs) {
                    const filteredPairs = res.pairs.filter(x => x.chainId === 'solana' && x.dexId === 'meteora');
                    allMeteoraPairs.push(...filteredPairs);
                }
                await sleep(200);
            }
            
            if (allMeteoraPairs.length === 0) throw new Error("Tidak ada pool Meteora ditemukan dari Fallback.");
            
            mappedData = allMeteoraPairs.map((dex, index) => {
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
        }

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
            if(t) {
                try { fillModalData(t); } catch(e){}
            }
        }

    } catch (err) {
        if (err.name !== 'AbortError') {
            if (state.poolsData.length > 0) {
                updateStaleBadge(true);
                showInfoBox("Data Lama Dipakai", "Refresh gagal, jadi sistem memakai data cache terakhir yang masih ada.", true);
            } else {
                if (statusArea) statusArea.style.display = 'none';
                const friendly = getReadableApiError(err);
                showInfoBox("Kendala API", friendly, true);
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
            fetchWithCache('https://api.dexscreener.com/token-boosts/top/v1', 60000, signal).catch(() => null),
            fetchWithCache('https://api.dexscreener.com/token-profiles/latest/v1', 60000, signal).catch(() => null)
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
            const res = await fetchWithCache(`https://api.dexscreener.com/latest/dex/tokens/${chunk}`, 30000, signal).catch(() => null);
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
                vol24h: Number(pair.volume?.h24 || 0), fees24h: null, tvl: Number(pair.liquidity?.usd || 0), price: Number(pair.priceUsd || 0),
                dexData: pair, logoUrl: pair.info?.imageUrl || pair.baseToken?.logoURI || `https://api.dicebear.com/9.x/identicon/svg?seed=${pair.baseToken?.address || i}&backgroundColor=1e1e1e`,
                priceChange: getBestPriceChange(pair), dexPrice: Number(pair.priceUsd || 0), pairAddress: pair.pairAddress,
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
            return fdv >= 10000 && fdv <= 50000000 && tvl >= 3000 && vol24 >= 50000 && !m.isBotSpam && m.validUsdTrend && m.volSpike >= 1.0 && p.priceChange >= -70;
        });

        validMemes.forEach(p => p.sniperScore = computeAlphaScore(p, avgVol));

        const filteredList = validMemes.sort((a,b) => b.sniperScore - a.sniperScore)
            .slice(0, 30)
            .filter(p => state.pinnedTokens.has(p.address) || p.sniperScore > 0);

        if (filteredList.length > 0) {
            state.alphaBaseData = filteredList.map(p => ({ ...p }));
            state.alphaData = filteredList.map(p => ({ ...p }));
            updateStaleBadge(false);
        } else if (state.alphaData.length === 0) {
            if (statusArea) statusArea.style.display = 'none';
            showInfoBox("Radar Standby", "Tidak ada sinyal Alpha yang lolos filter anti-bot dan dominasi USD Buy hari ini.", true);
        }

        if (filteredList.length > 0 && state.currentView === 'alpha') {
            applyFiltersAndRender();
        }

    } catch (err) {
        if (err.name !== 'AbortError') {
            if (state.alphaData.length > 0) {
                updateStaleBadge(true);
                showInfoBox("Data Lama Dipakai", "Refresh gagal, jadi sistem memakai data cache terakhir yang masih ada.", true);
            } else {
                if (statusArea) statusArea.style.display = 'none';
                const friendly = getReadableApiError(err);
                showInfoBox("Kendala API Agregator", friendly, true);
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
    state.refreshTimer = setInterval(async () => {
        if (document.visibilityState !== "visible") return;
        if (state.isRefreshing) return;

        state.isRefreshing = true;
        try {
            if (state.currentView === 'meteora') await loadPools();
            else await fetchAlphaSignals();
        } finally {
            state.isRefreshing = false;
        }
    }, 30000);
}

function startCacheCleanup() {
    setInterval(() => {
        const now = Date.now();
        for (const [key, value] of state.apiCache.entries()) {
            if (!value?.time || now - value.time > 300000) state.apiCache.delete(key);
        }
        for (const [key, value] of state.gmgnCache.entries()) {
            if (!value?.time || now - value.time > 300000) state.gmgnCache.delete(key);
        }
    }, 60000);
}

// BINDING KE WINDOW GLOBAL UNTUK MENCEGAH ERROR DI HTML
window.switchView = switchView;
window.applyFiltersAndRender = applyFiltersAndRender;
window.closeModal = closeModal;
window.openModal = openModal;
window.togglePin = togglePin;
window.toggleGMGNTrench = toggleGMGNTrench;

function getBestPriceChange(dex) {
    if (!dex || !dex.priceChange) return null;
    if (typeof dex.priceChange.h24 === 'number') return Number(dex.priceChange.h24);
    if (typeof dex.priceChange.h6 === 'number') return Number(dex.priceChange.h6);
    if (typeof dex.priceChange.h1 === 'number') return Number(dex.priceChange.h1);
    if (typeof dex.priceChange.m5 === 'number') return Number(dex.priceChange.m5);
    return null;
}

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
    startCacheCleanup();
};
