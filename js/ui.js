import { state } from './config.js';
import { safeExec, escapeHTML, formatAddress, formatMoney, formatPct, formatNum, formatAge } from './utils.js';
import { computeAdvancedMetrics, getVolatilityProfile, buildStrategy } from './engine.js';
import { fetchMeteoraNative, fetchRugCheckSecure, fetchGMGNTokenAnalysis, fetchGMGNWallet, normalizeGMGNToken, normalizeGMGNWallet, createRequestManager } from './api.js';

export function updateStaleBadge(isStale) {
    document.getElementById('staleBadge').style.display = isStale ? 'inline-block' : 'none';
}

export function showInfoBox(title, desc, isWarning = false) {
    const box = document.getElementById('systemInfo');
    const descEl = document.getElementById('infoDesc');
    box.className = 'info-box show';
    if (isWarning) box.classList.add('warning');
    box.querySelector('.info-title').innerHTML = `${isWarning ? '⚠️' : '📡'} ${title}`;
    descEl.innerText = desc;
}

export function hideInfoBox() {
    document.getElementById('systemInfo').className = 'info-box';
}

export function showToast(msg) {
    const toast = document.getElementById('toast');
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
            if (colorClass) {
                el.className = colorClass; 
            }
        }
    });
}

export function renderList(dataToRender) {
    const container = document.getElementById('poolList');
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
        const trColor = (pool.priceChange !== null && pool.priceChange !== undefined && !Number.isNaN(pool.priceChange)) 
            ? (pool.priceChange > 0 ? 'text-green' : (pool.priceChange < 0 ? 'text-red' : 'text-secondary')) 
            : 'text-secondary';

        let badgesHTML = '';
        if (isAlpha) badgesHTML += `<span class="badge badge-alpha">SCORE: ${pool.sniperScore || 0}</span>`;
        else badgesHTML += `<span class="badge badge-dlmm">DLMM POOL</span>`;

        if (pool.ageHours !== null && pool.ageHours < 48) badgesHTML += `<span class="badge badge-new">New</span>`;
        
        if (isAlpha && (pool.sniperScore > 60 || pool.priceChange <= -20)) {
            if (!bestBuyShown) {
                badgesHTML += `<span class="badge badge-buy">⭐ BEST ENTRY</span>`;
                bestBuyShown = true;
            } else {
                badgesHTML += `<span class="badge badge-hot">🔥 HOT</span>`; 
            }
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
                    <img src="${pool.logoUrl}" class="pool-logo" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null; this.src='data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjNjY2IiBzdHJva2Utd2lkdGg9IjIiPjxjaXJjbGUgY3g9IjEyIiBjeT0iMTIiIHI9IjEwIi8+PC9zdmc+'">
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

    if (state.activeModalData) {
        const updatedPool = dataToRender.find(p => p.address === state.activeModalData.address);
        if (updatedPool) state.activeModalData = { ...updatedPool };
    }
}

export function renderAIStrategyBox(pool, rcData, top10pct, gmgnData = null) {
    const aiBox = document.getElementById('aiOutput');
    const isAlpha = pool.isExternal || state.currentView === 'alpha';
    if (!aiBox) return;

    try {
        const strategy = buildStrategy(pool, rcData, top10pct, gmgnData);
        let html = `
            <div class="ai-header">
                <span>REKOMENDASI SISTEM</span>
                <span class="ai-score-badge" style="color: ${strategy.recColor}; border-color: ${strategy.recColor};">${strategy.recommendation}</span>
            </div>
        `;
        
        if (isAlpha) {
            const mData = computeAdvancedMetrics(pool);
            html += `<p style="line-height: 1.6; color: #ececec; margin-bottom:12px;">${strategy.text}</p>`;
            html += `<div style="font-size:11px; padding:10px; background:rgba(255,255,255,0.05); border-radius:6px; color:var(--text-secondary);">`;
            html += `<b>Masako Volume Integrity Check:</b><br><br>`;
            html += `• Wash Trade / Bot Spam: ${mData.isBotSpam ? "<span style='color:var(--accent-red)'>⚠️ Terdeteksi (Tx Rata-rata < $1)</span>" : "<span style='color:var(--accent-green)'>✅ Bersih</span>"}<br>`;
            
            if (rcData) {
                html += `• Security Audit: Menggunakan engine RugCheck API dengan auto-filter Liquidity Pool.<br>`;
            }
            html += `</div>`;
        } else {
            html += `<div style="margin-bottom:12px;"><span style="color:white; font-weight:600;">1. Profil Volatilitas (Regime: ${strategy.v.regime.toUpperCase()}):</span><br>`;
            html += `Skor volatilitas: <b>${Math.floor(strategy.v.volatilityScore)}</b>. `;
            if (strategy.v.age < 48) html += `⚠️ Token baru rilis (< 48j). `;
            if (strategy.v.change > 15) html += `Pergerakan harga agresif. `;
            html += `</div>`;

            html += `<div style="margin-bottom:12px;"><span style="color:white; font-weight:600;">2. Efisiensi DLMM Meteora:</span><br>`;
            if (strategy.v.volTvl > 1) html += `💰 <b>Sangat Baik:</b> Volume melampaui TVL. Perputaran uang cepat, Fee tinggi.`;
            else if (strategy.v.volTvl > 0 && strategy.v.volTvl < 0.2) html += `⚠️ <b>Rendah:</b> TVL terlalu padat dibanding volume. Uang mati berisiko.`;
            else html += `🟢 <b>Normal:</b> Rasio perputaran TVL di level wajar.`;
            html += `</div>`;

            html += `<div><span style="color:white; font-weight:600;">3. Protokol Eksekusi Likuiditas:</span><br>`;
            html += `<p style="margin-top:4px; line-height: 1.6; color: #ececec;">${strategy.text}</p></div>`;
        }
        aiBox.innerHTML = html;
    } catch(e) {}
}


const rm = createRequestManager({ concurrency: 2 });

function unwrapGMGN(payload) {
    let d = payload?.data ?? payload;
    if (d && typeof d === 'object') {
        d = d.data ?? d.result ?? d.items?.[0] ?? d;
    }
    return d || {};
}

export async function fillModalData(pool) {
    if (!pool) return;

    const modalSession = Date.now();
    state.modalSession = modalSession;
    const dex = pool.dexData;
    const isAlpha = pool.isExternal || state.currentView === 'alpha';
    const isPinned = state.pinnedTokens.has(pool.address);
    
    const displayCA = pool.tokenMint || pool.altMint || pool.address || "N/A";
    const chartAddress = pool.pairAddress || pool.address;

    // Update Header Modals
    const logoEl = document.getElementById('mLogo');
    if (logoEl) {
        logoEl.src = pool.logoUrl;
        logoEl.onerror = function() { this.onerror = null; this.src = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjNjY2IiBzdHJva2Utd2lkdGg9IjIiPjxjaXJjbGUgY3g9IjEyIiBjeT0iMTIiIHI9IjEwIi8+PC9zdmc+"; };
    }
    safeSetText('mName', escapeHTML(pool.name), 'text-base font-bold');
    
    const modalPin = document.getElementById('modalPinBtn');
    if (modalPin) {
        modalPin.classList.toggle('active', isPinned);
        modalPin.innerHTML = isPinned 
            ? `<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="currentColor" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`
            : `<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;
    }

    const subtitleEl = document.getElementById('mSubtitle');
    if (subtitleEl) subtitleEl.innerText = isAlpha ? `DEXScreener | Rank Global #${pool.trueRank}` : `Meteora DLMM | Pair: ${chartAddress.substring(0,8)}...`;

    const mData = computeAdvancedMetrics(pool);
    let finalMc = dex?.fdv !== undefined ? dex.fdv : null;
    const activePrice = Number(pool.dexPrice || pool.price || 0);
    
    const elAlpha = document.getElementById('alphaMetrics');
    const elMeteora = document.getElementById('meteoraMetrics');

    if (isAlpha) {
        if(elAlpha) elAlpha.style.display = 'block';
        if(elMeteora) elMeteora.style.display = 'none';

        safeSetText('mPriceAlpha', activePrice > 0 ? (activePrice < 0.001 ? "$" + activePrice.toFixed(6) : formatMoney(activePrice)) : "—", "metric-val text-primary");
        safeSetText('mMCAlpha', finalMc !== null ? formatMoney(finalMc) : "—", "metric-val text-primary");
        safeSetText('mTVLAlpha', pool.tvl !== null ? formatMoney(pool.tvl) : "—", "metric-val text-primary");
        safeSetText('mVolAlpha', pool.vol24h !== null ? formatMoney(pool.vol24h) : "—", "metric-val text-primary");
        safeSetText('mAgeAlpha', formatAge(pool.ageHours), "metric-val text-primary");
        
        const isPos = typeof pool.priceChange === 'number' && pool.priceChange > 0;
        const isNeg = typeof pool.priceChange === 'number' && pool.priceChange < 0;
        safeSetText('mChangeAlpha', formatPct(pool.priceChange), typeof pool.priceChange === 'number' ? (isPos ? 'metric-val text-green' : (isNeg ? 'metric-val text-red' : 'metric-val text-secondary')) : 'metric-val text-secondary');

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
        
        let whaleStatus = "Normal"; let whaleClass = "metric-small text-secondary";
        if (mData.isBotSpam) { whaleStatus = "Bot Spam"; whaleClass = "metric-small text-red"; }
        else if (mData.whaleAccumulation) { whaleStatus = "Dip Accumulation"; whaleClass = "metric-small text-green"; }
        else if (!mData.validUsdTrend) { whaleStatus = "Distribusi / Dump"; whaleClass = "metric-small text-red"; }
        safeSetText('valMicro4Alpha', whaleStatus, whaleClass);

        safeSetText('valMicro5Alpha', mData.volSpike.toFixed(1) + 'x', "metric-small text-primary");
        safeSetText('valMicro6Alpha', mData.avgTxSize1m > 0 ? formatMoney(mData.avgTxSize1m) : '—', "metric-small text-primary");

    } else {
        if(elAlpha) elAlpha.style.display = 'none';
        if(elMeteora) elMeteora.style.display = 'block';

        document.getElementById('dlmmLoading').innerText = '(Fetching native data...)';
        
        fetchMeteoraNative(chartAddress).then(mtData => {
            if (state.modalSession !== modalSession) return;
            document.getElementById('dlmmLoading').innerText = ''; 
            try {
                const volatility = getVolatilityProfile(pool); 

                let activeTvl = 0; let fee24h = 0; let baseFee = pool.feePct || 0; let maxFee = 0;
                let binStep = pool.binStep || 0; let vol24h = pool.vol24h || 0; 
                
                if (mtData) {
                    if(mtData.active_tvl !== undefined) activeTvl = Number(mtData.active_tvl);
                    if(mtData.fees_24h !== undefined) fee24h = Number(mtData.fees_24h);
                    if(mtData.base_fee_percentage !== undefined) baseFee = Number(mtData.base_fee_percentage);
                    if(mtData.max_fee_percentage !== undefined) maxFee = Number(mtData.max_fee_percentage);
                    if(mtData.bin_step !== undefined) binStep = Number(mtData.bin_step);
                    if(mtData.trade_volume_24h !== undefined) vol24h = Number(mtData.trade_volume_24h);
                }

                if (!activeTvl && pool.tvl) {
                    const activeTvlRatio = binStep < 20 ? 0.15 : (binStep > 80 ? 0.40 : 0.25);
                    activeTvl = pool.tvl * activeTvlRatio;
                }
                if (!maxFee) maxFee = baseFee * 1.5;
                if (!fee24h) fee24h = pool.fees24h || 0;

                const activeTvlRatioPct = pool.tvl > 0 ? (activeTvl / pool.tvl) * 100 : 0;
                const feeActiveTvlPct = activeTvl > 0 ? (fee24h / activeTvl) * 100 : 0;
                const volActiveTvlPct = activeTvl > 0 ? (vol24h / activeTvl) * 100 : 0;
                
                const estLPs = Math.max(1, Math.floor(pool.tvl / 300));
                const estPositions = Math.floor(estLPs * 2.5);
                const estInRange = Math.floor(estPositions * (activeTvlRatioPct/100 || 0.4));

                const avgFeesMin = fee24h / 1440;
                const avgVolMin = vol24h / 1440;
                
                const txns24h = (dex?.txns?.h24?.buys || 0) + (dex?.txns?.h24?.sells || 0);
                const traders = Math.max(1, Math.floor(txns24h * 0.45));
                const feeTvlPct = pool.tvl > 0 ? (fee24h / pool.tvl) * 100 : 0;

                safeSetText('dlmmAge', formatAge(pool.ageHours));
                safeSetText('dlmmVolat', volatility.change.toFixed(2) + '%');
                
                safeSetText('dlmmActiveTVL', `${formatMoney(activeTvl)}<div class="m-subval">(${activeTvlRatioPct.toFixed(0)}% of TVL)</div>`);
                
                safeSetText('dlmmFeesActive', feeActiveTvlPct > 999 ? formatNum(feeActiveTvlPct) + '%' : feeActiveTvlPct.toFixed(0) + '%');
                safeSetText('dlmmVolActive', volActiveTvlPct > 999 ? formatNum(volActiveTvlPct) + '%' : volActiveTvlPct.toFixed(0) + '%');
                
                safeSetText('dlmmTotalLPs', mtData ? "Verified" : formatNum(estLPs)); 
                safeSetText('dlmmOpenPos', formatNum(estPositions));
                safeSetText('dlmmInRange', formatNum(estInRange));
                
                safeSetText('dlmmAvgFeeMin', formatMoney(avgFeesMin));
                safeSetText('dlmmAvgVolMin', formatMoney(avgVolMin));
                safeSetText('dlmmTraders', formatNum(traders));
                safeSetText('dlmmSwaps', formatNum(txns24h));
                
                safeSetText('dlmm24hFees', formatMoney(fee24h), "m-val text-green");
                safeSetText('dlmm24hFeesTVL', feeTvlPct.toFixed(2) + '%');
                safeSetText('dlmmBinStep', binStep, "m-val text-blue");
                safeSetText('dlmmBaseFee', baseFee + '%');
                safeSetText('dlmmMaxFee', maxFee + '%');
                safeSetText('dlmmTVL', formatMoney(pool.tvl));
            } catch (e) {
                console.error("Meteora Parsing Error:", e);
            }
        }).catch(e => {
            if (state.modalSession !== modalSession) return;
            document.getElementById('dlmmLoading').innerText = '(Fetch Timeout)';
        });


    const mint = pool.tokenMint || pool.altMint;
    const modalSignal = rm.abortPreviousModal();
    rm.debounce('modal_gmgn', () => rm.enqueue(() => Promise.allSettled([
        fetchGMGNTokenAnalysis({ mint, pairAddress: pool.pairAddress || pool.address }, modalSignal),
        fetchGMGNWallet({ wallet: pool.address }, modalSignal)
    ])), 150).then(([tokenRes, walletRes]) => {
        if (state.modalSession !== modalSession) return;
        const tokenRaw = tokenRes.status === 'fulfilled' ? tokenRes.value : null;
        const walletRaw = walletRes.status === 'fulfilled' ? walletRes.value : null;

        const tData = normalizeGMGNToken(tokenRaw);
        const wData = normalizeGMGNWallet(walletRaw);

        pool.gmgnData = { ...tData, smartMoney: wData };

        const ratVal = tData.rat_trader_amount_percentage ?? tData.rat_ratio ?? tData.ratTraderRatio ?? null;
        const bundleVal = tData.bluechip_owner_percentage ?? tData.bundle_ratio ?? tData.bundleRatio ?? null;
        const devStatus = tData.is_show_alert === true ? '🚨 ALERT' : '✅ CLEAN';
        const walletProfit = wData?.profit || {};
        const winRateVal = walletProfit.average_win_rate ?? walletProfit.win_rate ?? null;
        const pnlVal = walletProfit.total_pnl ?? walletProfit.pnl ?? null;

        safeSetText(
          'gmgnRat',
          ratVal != null ? `${(Number(ratVal) * 100).toFixed(1)}%` : 'Unavailable',
          ratVal != null && Number(ratVal) >= 0.25 ? 'metric-small text-red' : 'metric-small text-green'
        );

        safeSetText(
          'gmgnBundle',
          bundleVal != null ? `${(Number(bundleVal) * 100).toFixed(1)}%` : 'Unavailable',
          bundleVal != null && Number(bundleVal) >= 0.25 ? 'metric-small text-red' : 'metric-small text-green'
        );

        safeSetText('gmgnDev', devStatus, 'metric-small text-primary');

        safeSetText(
          'gmgnSmart',
          winRateVal != null
            ? `WR ${(Number(winRateVal) * 100).toFixed(1)}% | P&L ${formatMoney(Number(pnlVal ?? 0))}`
            : 'Unavailable',
          (winRateVal != null && Number(winRateVal) >= 0.6 && Number(pnlVal ?? 0) > 0)
            ? 'metric-small text-green'
            : 'metric-small text-secondary'
        );
    }).catch(() => {
        if (state.modalSession !== modalSession) return;
        safeSetText('gmgnRat', 'Unavailable', 'metric-small text-secondary');
    });
    }

    safeSetText('beHolders', 'Mengaudit...', 'metric-small text-secondary');
    safeSetText('beMint', 'Mengaudit...', 'metric-small text-secondary');
    safeSetText('beFreeze', 'Mengaudit...', 'metric-small text-secondary');
    safeSetText('beCreator', 'Mengaudit...', 'metric-small text-secondary');

    let dummyTop10 = 0;
    renderAIStrategyBox(pool, null, dummyTop10);

    fetchRugCheckSecure(pool.tokenMint).then(rcData => {
        if (state.modalSession !== modalSession) return;
        if(rcData) {
            let finalTop10 = 0;
            
            if (rcData.risks && Array.isArray(rcData.risks)) {
                rcData.risks.forEach(r => {
                    if (r.name.toLowerCase().includes('top 10') || r.description.toLowerCase().includes('top 10')) {
                        const match = r.description.match(/(\d+(\.\d+)?)%/);
                        if (match) finalTop10 = parseFloat(match[1]) / 100;
                    }
                });
            }
            
            if (finalTop10 === 0 && rcData.topHolders && Array.isArray(rcData.topHolders)) {
                 const cleanHolders = rcData.topHolders.filter(h => h.pct < 50);
                 finalTop10 = cleanHolders.slice(0, 10).reduce((acc, curr) => acc + (curr.pct || 0), 0) / 100;
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

            safeSetText('beHolders', finalTop10 > 0 ? (finalTop10 * 100).toFixed(1) + '%' : 'Aman ✅', finalTop10 > 0.25 ? 'metric-small text-red' : (finalTop10 > 0.15 ? 'metric-small text-orange' : 'metric-small text-green'));
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
    });

    const btnCopy = document.getElementById('mCopyBtn');
    if (btnCopy) btnCopy.onclick = () => copyText(displayCA, 'CA');
    
    const btnDex = document.getElementById('mDexLinkBtn');
    if (btnDex) btnDex.href = `https://dexscreener.com/solana/${chartAddress}`;

    const btnRug = document.getElementById('mRugCheckBtn');
    if (btnRug) btnRug.href = `https://rugcheck.xyz/tokens/${displayCA}`;
    
    const btnLink = document.getElementById('mLinkBtn');
    if (btnLink) {
        if (isAlpha) {
            btnLink.innerText = "Trade DEX ↗";
            btnLink.className = "btn btn-solid";
            btnLink.href = `https://raydium.io/swap/?inputCurrency=sol&outputCurrency=${displayCA}`;
        } else {
            btnLink.innerText = "⚡ Open DLMM ↗";
            btnLink.className = "btn btn-meteora";
            btnLink.href = `https://app.meteora.ag/dlmm/${chartAddress}?referrer=pools`;
        }
    }
}

export function openModal(addr) {
    const targetData = state.currentView === 'meteora' ? state.poolsData : state.alphaData;
    const pool = targetData.find(p => p.address === addr);
    if(!pool) return;
    
    state.activeModalData = { ...pool };
    state.selectedPoolKey = state.activeModalData.address;
    
    document.getElementById('analysisModal').classList.add('active');
    requestAnimationFrame(() => fillModalData(state.activeModalData));
}

export function closeModal() { 
    document.getElementById('analysisModal').classList.remove('active'); 
    state.selectedPoolKey = null; 
    state.activeModalData = null;
    state.modalSession = 0;
}
