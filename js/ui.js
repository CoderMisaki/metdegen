import { state } from './config.js';
import { safeExec, escapeHTML, formatAddress, formatMoney, formatPct, formatNum, formatAge } from './utils.js';
import { computeAdvancedMetrics, getVolatilityProfile, buildStrategy } from './engine.js';
import { fetchMeteoraAdvancedMetrics, fetchRugCheckSecure, fetchGMGNTokenAnalysis, normalizeGMGNToken, createRequestManager } from './api.js';

export function updateStaleBadge(isStale) {
    const el = document.getElementById('staleBadge');
    if (el) el.style.display = isStale ? 'inline-block' : 'none';
}

export function showInfoBox(title, desc, isWarning = false) {
    const box = document.getElementById('systemInfo');
    const descEl = document.getElementById('infoDesc');
    if (!box || !descEl) return;
    box.className = 'info-box show';
    if (isWarning) box.classList.add('warning');
    box.querySelector('.info-title').innerHTML = `${isWarning ? '⚠️' : '📡'} ${title}`;
    descEl.innerText = desc;
}

export function hideInfoBox() {
    const el = document.getElementById('systemInfo');
    if (el) el.className = 'info-box';
}

export function showToast(msg) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.innerText = msg; toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2000);
}

export async function copyText(text, typeName) {
    if (!text || text === "Unknown" || text === "—") return showToast("Address invalid");
    try { await navigator.clipboard.writeText(text); showToast(`${typeName} disalin!`); }
    catch (e) {
        const input = document.createElement('input'); input.value = text; document.body.appendChild(input);
        input.select(); try { document.execCommand('copy'); showToast(`${typeName} disalin!`); } catch(err){} document.body.removeChild(input);
    }
}

export function safeSetText(id, text, colorClass = '') {
    safeExec(() => {
        const el = document.getElementById(id);
        if (el) {
            el.innerHTML = text;
            if (colorClass) el.className = colorClass;
        }
    });
}

export function renderList(dataToRender) {
    const container = document.getElementById('poolList');
    if (!container) return;
    container.innerHTML = '';
    if (!dataToRender || dataToRender.length === 0) return;

    const batchRender = dataToRender.slice(0, 30);
    let bestBuyShown = false;
    let html = '';
    batchRender.forEach((pool, index) => {
        const isAlpha = pool.isExternal || state.currentView === 'alpha';
        const isPinned = state.pinnedTokens.has(pool.address);
        let col1Html = "";
        if (isAlpha) {
            const fdv = pool.dexData?.fdv !== undefined ? pool.dexData.fdv : null;
            col1Html = `<div class="metric-val text-primary">${fdv !== null ? formatMoney(fdv) : '—'}</div>`;
        } else {
            col1Html = `<div class="metric-val text-green">${pool.fees24h ? formatMoney(pool.fees24h) : '—'}</div>`;
        }
        const displayCA = pool.tokenMint || pool.altMint || pool.address || "N/A";
        const trColor = (pool.priceChange !== null && pool.priceChange !== undefined && !Number.isNaN(pool.priceChange)) ? (pool.priceChange > 0 ? 'text-green' : (pool.priceChange < 0 ? 'text-red' : 'text-secondary')) : 'text-secondary';
        let badgesHTML = '';
        if (isAlpha) badgesHTML += `<span class="badge badge-alpha">SCORE: ${pool.sniperScore || 0}</span>`;
        else badgesHTML += `<span class="badge badge-dlmm">DLMM POOL</span>`;
        if (pool.ageHours !== null && pool.ageHours < 48) badgesHTML += `<span class="badge badge-new">New</span>`;
        if (isAlpha && (pool.sniperScore > 60 || pool.priceChange <= -20)) {
            if (!bestBuyShown) { badgesHTML += `<span class="badge badge-buy">⭐ BEST ENTRY</span>`; bestBuyShown = true; }
            else { badgesHTML += `<span class="badge badge-hot">🔥 HOT</span>`; }
        }
        const rankDisp = isAlpha ? pool.trueRank : pool.rank;
        const rankLbl = isAlpha ? 'GLOB' : 'RANK';
        html += `
        <div class="pool-item" onclick="openModal('${pool.address}')">
            <button class="pin-btn pool-item-pin ${isPinned ? 'active' : ''}" onclick="togglePin('${pool.address}', event)" title="Pantau">
                <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="${isPinned ? 'currentColor' : 'none'}" stroke-linecap="round" stroke-linejoin="round">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                </svg>
            </button>
            <div class="pool-info">
                <div class="pool-rank">
                    <span class="rank-number">#${rankDisp}</span>
                    <span class="rank-label">${rankLbl}</span>
                </div>
                <img src="${pool.logoUrl}" class="pool-logo" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null; this.src='data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjNjY2IiBzdHJva2Utd2lkdGg9IjIiPjxjaXJybGUgY3g9IjEyIiBjeT0iMTIiIHI9IjEwIi8+PC9zdmc+'">
                <div class="pool-name-box">
                    <div class="pool-name truncate">${escapeHTML(pool.name)}</div>
                    <div class="badges-container">${badgesHTML}</div>
                    <div class="pool-ca truncate" style="margin-top: 4px;">CA: ${formatAddress(displayCA)}</div>
                </div>
            </div>
            <div class="pool-metrics">
                <div class="metric-col"><div class="metric-label">${isAlpha ? 'Market Cap' : '24H Fees'}</div>${col1Html}</div>
                <div class="metric-col"><div class="metric-label">Vol 24H</div><div class="metric-val text-primary">${pool.vol24h !== null ? formatMoney(pool.vol24h) : '—'}</div></div>
                <div class="metric-col"><div class="metric-label">Trend</div><div class="metric-val ${trColor}">${formatPct(pool.priceChange)}</div></div>
            </div>
        </div>`;
    });
    container.innerHTML = html;
}

export function renderAIStrategyBox(pool, rcData, top10pct, gmgnData = null) {
    const aiBox = document.getElementById('aiOutput');
    if (!aiBox) return;
    const isAlpha = pool.isExternal || state.currentView === 'alpha';
    try {
        const strategy = buildStrategy(pool, rcData, top10pct, gmgnData);
        let html = `<div class="ai-header"><span>REKOMENDASI SISTEM</span><span class="ai-score-badge" style="color: ${strategy.recColor}; border-color: ${strategy.recColor};">${strategy.recommendation}</span></div>`;
        if (isAlpha) {
            const mData = computeAdvancedMetrics(pool);
            html += `<p style="line-height: 1.6; color: #ececec; margin-bottom:12px;">${strategy.text}</p>`;
            html += `<div style="font-size:11px; padding:10px; background:rgba(255,255,255,0.05); border-radius:6px; color:var(--text-secondary);"><b>Volume Integrity Check:</b><br><br>• Wash Trade: ${mData.isBotSpam ? "<span style='color:var(--accent-red)'>⚠️ Terdeteksi</span>" : "<span style='color:var(--accent-green)'>✅ Bersih</span>"}<br></div>`;
        } else {
            html += `<div style="margin-bottom:12px;"><span style="color:white; font-weight:600;">1. Profil Volatilitas (${strategy.v.regime.toUpperCase()}):</span><br>Skor: <b>${Math.floor(strategy.v.volatilityScore)}</b>. ${strategy.v.change > 15 ? 'Agresif.' : 'Stabil.'}</div>`;
            html += `<div><span style="color:white; font-weight:600;">2. Protokol Eksekusi:</span><br><p style="margin-top:4px; line-height: 1.6; color: #ececec;">${strategy.text}</p></div>`;
        }
        aiBox.innerHTML = html;
    } catch(e) {}
}

const rm = createRequestManager({ concurrency: 2 });

export async function fillModalData(pool) {
    if (!pool) return;
    const modalSession = Date.now();
    state.modalSession = modalSession;
    
    const dex = pool.dexData;
    const isAlpha = pool.isExternal || state.currentView === 'alpha';
    const chartAddress = pool.pairAddress || pool.address;
    const displayCA = pool.tokenMint || pool.altMint || pool.address || "N/A";

    // Header Updates
    safeSetText('mName', escapeHTML(pool.name));
    const logoEl = document.getElementById('mLogo');
    if (logoEl) logoEl.src = pool.logoUrl;
    const subtitleEl = document.getElementById('mSubtitle');
    if (subtitleEl) subtitleEl.innerText = isAlpha ? `Global Rank #${pool.trueRank}` : `DLMM Pair: ${chartAddress.substring(0,8)}...`;

    const elAlpha = document.getElementById('alphaMetrics');
    const elMeteora = document.getElementById('meteoraMetrics');

    const mData = computeAdvancedMetrics(pool);

    if (isAlpha) {
        if(elAlpha) elAlpha.style.display = 'block';
        if(elMeteora) elMeteora.style.display = 'none';
        
        const activePrice = Number(pool.dexPrice || 0);
        safeSetText('mPriceAlpha', activePrice > 0 ? formatMoney(activePrice) : "—");
        safeSetText('mMCAlpha', formatMoney(dex?.fdv || 0));
        safeSetText('mTVLAlpha', formatMoney(pool.tvl || 0));
        safeSetText('mVolAlpha', formatMoney(pool.vol24h || 0));
        safeSetText('mAgeAlpha', formatAge(pool.ageHours));
        safeSetText('mChangeAlpha', formatPct(pool.priceChange));

        const buys1H = dex?.txns?.h1?.buys;
        const sells1H = dex?.txns?.h1?.sells;
        const buys24H = dex?.txns?.h24?.buys;
        const sells24H = dex?.txns?.h24?.sells;

        let trades1hStr = (buys1H !== undefined && sells1H !== undefined) ? `${formatNum(buys1H)} B / ${formatNum(sells1H)} S` : "—";
        let trades24hStr = (buys24H !== undefined && sells24H !== undefined) ? `${formatNum(buys24H)} B / ${formatNum(sells24H)} S` : "—";

        const usdVol1HHtml = trades1hStr !== "—" ? `<span>${trades1hStr}</span><br><span style="font-size:10px; color:var(--accent-green)">${formatMoney(mData.buyVol1m)}</span> <span style="font-size:10px; color:#666;">/</span> <span style="font-size:10px; color:var(--accent-red)">${formatMoney(mData.sellVol1m)}</span>` : "—";
        const usdVol24HHtml = trades24hStr !== "—" ? `<span>${trades24hStr}</span><br><span style="font-size:10px; color:var(--accent-green)">${formatMoney(mData.buyVol24)}</span> <span style="font-size:10px; color:#666;">/</span> <span style="font-size:10px; color:var(--accent-red)">${formatMoney(mData.sellVol24)}</span>` : "—";

        safeSetText('valMicro1Alpha', usdVol24HHtml, "metric-small text-primary");
        safeSetText('valMicro2Alpha', usdVol1HHtml, "metric-small text-primary");
        safeSetText('valMicro3Alpha', formatMoney(dex?.volume?.h1 || 0), "metric-small text-primary");

        let whaleStatus = "Normal";
        let whaleClass = "metric-small text-secondary";
        if (mData.isBotSpam) { whaleStatus = "Bot Spam"; whaleClass = "metric-small text-red"; }
        else if (mData.whaleAccumulation) { whaleStatus = "Dip Accumulation"; whaleClass = "metric-small text-green"; }
        else if (!mData.validUsdTrend) { whaleStatus = "Distribusi / Dump"; whaleClass = "metric-small text-red"; }

        safeSetText('valMicro4Alpha', whaleStatus, whaleClass);
        safeSetText('valMicro5Alpha', mData.volSpike.toFixed(1) + 'x', "metric-small text-primary");
        safeSetText('valMicro6Alpha', mData.avgTxSize1m > 0 ? formatMoney(mData.avgTxSize1m) : '—', "metric-small text-primary");

    } else {
        if(elAlpha) elAlpha.style.display = 'none';
        if(elMeteora) elMeteora.style.display = 'block';
        document.getElementById('dlmmLoading').innerText = '(Fetching real-time metrics...)';
        
        fetchMeteoraAdvancedMetrics(chartAddress).then(res => {
            if (state.modalSession !== modalSession) return;
            document.getElementById('dlmmLoading').innerText = '';
            
            const mtData = (res && res.data && res.data.length > 0) ? res.data[0] : null;
            if (mtData) {
                const activeTvl = Number(mtData.active_tvl || 0);
                const fee24h = Number(mtData.fee || 0);
                const vol24h = Number(mtData.volume || 0);
                const tvl = Number(mtData.tvl || pool.tvl || 0);
                
                const binStep = Number(mtData.dlmm_params?.bin_step || pool.binStep || 0);
                const volatility = Number(mtData.volatility || 0);
                
                const baseFee = pool.feePct || 0.3; 
                const maxFee = pool.maxFeePct || baseFee * 1.5;

                safeSetText('dlmmAge', formatAge(pool.ageHours));
                safeSetText('dlmmVolat', volatility.toFixed(2) + '%');
                safeSetText('dlmmActiveTVL', `${formatMoney(activeTvl)}<div class="m-subval">(${(tvl > 0 ? (activeTvl/tvl)*100 : 0).toFixed(0)}% of TVL)</div>`);
                safeSetText('dlmmFeesActive', (mtData.fee_active_tvl_ratio || 0).toFixed(2) + '%');
                safeSetText('dlmmVolActive', (mtData.volume_active_tvl_ratio || 0).toFixed(0) + '%');
                safeSetText('dlmmTotalLPs', formatNum(mtData.unique_lps || mtData.total_lps || 0));
                safeSetText('dlmmOpenPos', formatNum(mtData.open_positions || 0));
                safeSetText('dlmmInRange', formatNum(mtData.active_positions || 0));
                safeSetText('dlmmAvgFeeMin', formatMoney(fee24h / 1440));
                safeSetText('dlmmAvgVolMin', formatMoney(vol24h / 1440));
                safeSetText('dlmmTraders', formatNum(mtData.unique_traders || 0));
                safeSetText('dlmmSwaps', formatNum(mtData.swap_count || 0));
                safeSetText('dlmm24hFees', formatMoney(fee24h), "m-val text-green");
                safeSetText('dlmm24hFeesTVL', tvl > 0 ? (fee24h / tvl * 100).toFixed(2) + '%' : '—');
                safeSetText('dlmmBinStep', binStep, "m-val text-blue");
                safeSetText('dlmmBaseFee', baseFee + '%');
                safeSetText('dlmmMaxFee', maxFee + '%');
                safeSetText('dlmmTVL', formatMoney(tvl));
            }
        });
    }

    safeSetText('beHolders', 'Mengaudit...', 'metric-small text-secondary');
    safeSetText('beCreator', 'Mengaudit...', 'metric-small text-secondary');
    safeSetText('beMint', 'Mengaudit...', 'metric-small text-secondary');
    safeSetText('beFreeze', 'Mengaudit...', 'metric-small text-secondary');

    fetchRugCheckSecure(pool.tokenMint).then(rcData => {
        if (state.modalSession !== modalSession) return;
        if(rcData) {
            let finalTop10 = 0;
            
            // LOGIC KEMBALI SEPERTI SEMULA: TOTAL RAW DATA 10 BESAR TANPA FILTER APAPUN
            if (rcData.topHolders && Array.isArray(rcData.topHolders)) {
                finalTop10 = rcData.topHolders.slice(0, 10).reduce((acc, curr) => acc + (curr.pct || 0), 0) / 100;
            }

            let creatorPct = 0;
            if (rcData.risks && Array.isArray(rcData.risks)) {
                rcData.risks.forEach(r => {
                    if (r.name.toLowerCase().includes('creator') || r.description.toLowerCase().includes('creator')) {
                        const match = r.description.match(/(\d+(\.\d+)?)%/);
                        if (match) creatorPct = parseFloat(match[1]) / 100;
                    }
                });
            }

            const isMint = rcData.token?.mintAuthority !== null;
            const isFreeze = rcData.token?.freezeAuthority !== null;

            // MENYESUAIKAN BATAS AMAN KARENA LP DIHITUNG (Batas amannya kita naikkan agar tidak selalu merah)
            safeSetText('beHolders', finalTop10 > 0 ? (finalTop10 * 100).toFixed(2) + '%' : 'Aman ✅', finalTop10 > 0.40 ? 'metric-small text-red' : (finalTop10 > 0.30 ? 'metric-small text-orange' : 'metric-small text-green'));
            safeSetText('beCreator', creatorPct > 0 ? (creatorPct * 100).toFixed(1) + '%' : 'Aman ✅', creatorPct > 0.1 ? 'metric-small text-red' : 'metric-small text-green');
            safeSetText('beMint', isMint ? "Ya 🚨" : "Tidak ✅", isMint ? "metric-small text-red" : "metric-small text-green");
            safeSetText('beFreeze', isFreeze ? "Ya 🚨" : "Tidak ✅", isFreeze ? "metric-small text-red" : "metric-small text-green");

            renderAIStrategyBox(pool, rcData, finalTop10);
        } else {
            safeSetText('beHolders', 'Gagal Audit', 'metric-small text-red');
            safeSetText('beCreator', 'Gagal Audit', 'metric-small text-red');
            safeSetText('beMint', 'Gagal Audit', 'metric-small text-red');
            safeSetText('beFreeze', 'Gagal Audit', 'metric-small text-red');
        }
    }).catch(e => {
        if (state.modalSession !== modalSession) return;
        safeSetText('beHolders', 'Timeout', 'metric-small text-red');
        safeSetText('beCreator', 'Timeout', 'metric-small text-red');
        safeSetText('beMint', 'Timeout', 'metric-small text-red');
        safeSetText('beFreeze', 'Timeout', 'metric-small text-red');
    });

    // GMGN Analytics
    const modalSignal = rm.abortPreviousModal();
    rm.enqueue(() => fetchGMGNTokenAnalysis({ mint: pool.tokenMint || pool.altMint, pairAddress: chartAddress }, modalSignal)).then(tokenRaw => {
        if (state.modalSession !== modalSession) return;
        const tData = normalizeGMGNToken(tokenRaw);
        safeSetText('gmgnRat', tData.rat_ratio ? (tData.rat_ratio*100).toFixed(1)+'%' : '—');
        safeSetText('gmgnDev', tData.is_show_alert ? '🚨 ALERT' : '✅ CLEAN');
    }).catch(()=>{});

    // Buttons
    document.getElementById('mCopyBtn').onclick = () => copyText(displayCA, 'CA');
    document.getElementById('mDexLinkBtn').href = `https://dexscreener.com/solana/${chartAddress}`;
    const btnRug = document.getElementById('mRugCheckBtn');
    if (btnRug) btnRug.href = `https://rugcheck.xyz/tokens/${displayCA}`;

    const btnLink = document.getElementById('mLinkBtn');
    if (isAlpha) {
        btnLink.innerText = "Trade DEX ↗"; btnLink.className = "btn btn-solid";
        btnLink.href = `https://raydium.io/swap/?outputCurrency=${displayCA}`;
    } else {
        btnLink.innerText = "⚡ Open DLMM ↗"; btnLink.className = "btn btn-meteora";
        btnLink.href = `https://app.meteora.ag/dlmm/${chartAddress}`;
    }
}

export function openModal(addr) {
    const targetData = state.currentView === 'meteora' ? state.poolsData : state.alphaData;
    const pool = targetData.find(p => p.address === addr);
    if(!pool) return;
    state.activeModalData = { ...pool };
    state.selectedPoolKey = pool.address;
    const modal = document.getElementById('analysisModal');
    if (modal) modal.classList.add('active');
    requestAnimationFrame(() => fillModalData(state.activeModalData));
}

export function closeModal() {
    const modal = document.getElementById('analysisModal');
    if (modal) modal.classList.remove('active');
    state.selectedPoolKey = null;
    state.modalSession = 0;
}
