import { state } from './config.js';
import { formatMoney } from './utils.js';

function extractGMGNMetrics(gmgn = {}) {
    const root = gmgn?.data?.data ?? gmgn?.data ?? gmgn ?? {};
    const smartMoney =
        root.smartMoney?.data?.data ??
        root.smartMoney?.data ??
        root.smartMoney ??
        root.smart_money ??
        {};

    const ratTraderRatio = Number(
        root.rat_trader_amount_percentage ??
        root.rat_ratio ??
        root.ratTraderRatio ??
        0
    );

    const bundleRatio = Number(
        root.bluechip_owner_percentage ??
        root.bundle_ratio ??
        root.bundleRatio ??
        0
    );

    const devStatus = root.is_show_alert === true ? '🚨 ALERT' : '✅ CLEAN';

    const smartMoneyWinRate = Number(
        smartMoney.average_win_rate ??
        smartMoney.win_rate ??
        smartMoney.winRate ??
        0
    );

    const smartMoneyPnL = Number(
        smartMoney.total_pnl ??
        smartMoney.pnl ??
        smartMoney.realized_pnl ??
        0
    );

    const smartMoneyAccumulation = Number(
        smartMoney.net_buy_amount ??
        smartMoney.net_buy ??
        smartMoney.netBuy ??
        0
    );

    return { ratTraderRatio, bundleRatio, devStatus, smartMoneyWinRate, smartMoneyPnL, smartMoneyAccumulation };
}


export function getDLMMInfoFromLabels(labels) {
    let binStep = null;
    let fee = null;
    let isDLMM = false;
    let isDAMM = false;
    if (Array.isArray(labels)) {
        labels.forEach(lbl => {
            if (typeof lbl === 'string') {
                const upper = lbl.toUpperCase();
                if (upper === 'DLMM') isDLMM = true;
                if (upper.includes('DYNAMIC') || upper.includes('DAMM') || upper.includes('DYN')) isDAMM = true;
                if (upper.includes('BIN STEP:')) binStep = parseInt(lbl.replace(/\D/g, ''));
                if (upper.includes('FEE:')) fee = parseFloat(lbl.replace(/[^\d.]/g, ''));
            }
        });
    }
    return { binStep, fee, isDLMM: isDLMM || binStep !== null, isDAMM };
}

export function computeAdvancedMetrics(p, avgVolBaseline = 0) {
    const vol24 = Number(p.vol24h || 0);
    const vol5m = p.dexData?.volume?.m5 !== undefined ? Number(p.dexData.volume.m5) : (Number(p.dexData?.volume?.h1 || 0) / 12);
    const vol1m = Number(p.dexData?.volume?.h1 || 0);
    
    const buys = Number(p.dexData?.txns?.h24?.buys || 0);
    const sells = Number(p.dexData?.txns?.h24?.sells || 0);
    const buys1m = Number(p.dexData?.txns?.h1?.buys || 0);
    const sells1m = Number(p.dexData?.txns?.h1?.sells || 0);

    const totalTx1m = buys1m + sells1m;
    const totalTx24 = buys + sells;

    const buyVol1m = totalTx1m > 0 ? (buys1m / totalTx1m) * vol1m : 0;
    const sellVol1m = totalTx1m > 0 ? (sells1m / totalTx1m) * vol1m : 0;
    const buyVol24 = totalTx24 > 0 ? (buys / totalTx24) * vol24 : 0;
    const sellVol24 = totalTx24 > 0 ? (sells / totalTx24) * vol24 : 0;

    const avgTxSize1m = totalTx1m > 0 ? vol1m / totalTx1m : 0;
    const avgTxSize24 = totalTx24 > 0 ? vol24 / totalTx24 : 0;

    const isBotSpam = avgTxSize1m > 0 && avgTxSize1m < 1; 
    const isUsdBuyDominant1H = buyVol1m > sellVol1m;
    const isUsdBuyDominant24H = buyVol24 > sellVol24;
    const validUsdTrend = isUsdBuyDominant1H && isUsdBuyDominant24H; 
    const isBuyDominant = validUsdTrend; 

    const liquidity = Number(p.tvl || 0);
    const priceChange = Number(p.priceChange || 0);
    const priceChange5m = Number(p.dexData?.priceChange?.m5 || 0);

    const baseline = avgVolBaseline > 0 ? (avgVolBaseline / 288) : (vol24 / 288);
    const volSpike = baseline > 0 ? vol5m / baseline : 0;
    
    const buySellRatio = sells > 0 ? buys / sells : (buys > 0 ? 2 : 1);
    const buySellRatio1m = sells1m > 0 ? buys1m / sells1m : (buys1m > 0 ? 2 : 1);
    const volTvl = liquidity > 0 ? vol24 / liquidity : 0;

    const whaleActive = avgTxSize1m > (avgTxSize24 * 3) && avgTxSize1m > 300 && !isBotSpam; 
    const whaleAccumulation = whaleActive && buyVol1m > (sellVol1m * 1.5);

    const liquidityRisk = (liquidity < 5000 ? 2 : 0) + (volTvl > 10 ? 2 : 0) + ((volTvl > 20 && priceChange5m < -5) ? 3 : 0);
    const momentum = (priceChange * 0.5) + (volSpike * 5) + (buySellRatio * 4);

    return { 
        volSpike, buySellRatio, buySellRatio1m, volTvl, liquidityRisk, momentum, 
        whaleActive, whaleAccumulation, priceChange5m, avgTxSize24, avgTxSize1m, 
        buys1m, sells1m, totalTx1m, 
        buyVol1m, sellVol1m, buyVol24, sellVol24,
        isBotSpam, isBuyDominant, validUsdTrend 
    };
}

export function computeAlphaScore(p, avgVol = 0, gmgn = null) {
    const m = computeAdvancedMetrics(p, avgVol);
    const age = p.ageHours || 999;
    
    let score = 50; 

    if (m.isBotSpam || !m.validUsdTrend) return 0; 

    score += Math.min(m.volSpike * 5, 15);
    if (m.buyVol1m > m.sellVol1m * 1.5) score += 15;

    if (m.volTvl > 0.5 && m.volTvl < 5) score += 20;
    else if (m.volTvl >= 5 && m.volTvl <= 15) score += 10;

    if (m.whaleAccumulation) score += 20;
    if (age < 24) score += 10;

    if (m.volTvl > 20 && Math.abs(m.priceChange5m) < 1) score -= 30;

    const g = extractGMGNMetrics(gmgn || p.gmgnData);
    if (g.bundleRatio >= 0.35) score -= 55;
    else if (g.bundleRatio >= 0.2) score -= 30;

    if (g.ratTraderRatio >= 0.35) score -= 45;
    else if (g.ratTraderRatio >= 0.2) score -= 20;

    if (g.smartMoneyWinRate >= 0.65 && g.smartMoneyAccumulation > 0) score += 22;
    if (g.smartMoneyPnL > 0) score += 8;
    if (p.priceChange < -40 && !m.isBuyDominant) score -= 30;
    score -= (m.liquidityRisk * 10);

    return Math.max(0, Math.min(100, Math.floor(score)));
}

export function getVolatilityProfile(pool) {
    const change = Number.isFinite(pool.priceChange) ? Math.abs(pool.priceChange) : 0;
    const volTvl = (pool.tvl > 0 && pool.vol24h > 0) ? pool.vol24h / pool.tvl : 0;
    const age = pool.ageHours ?? 999;
    const bin = Number(pool.binStep || 0);

    const volatilityScore = (change * 2) + (volTvl * 20) + (bin / 4) + (age < 48 ? 12 : age < 168 ? 4 : 0);

    let regime = "low";
    if (volatilityScore >= 80) regime = "extreme";
    else if (volatilityScore >= 50) regime = "high";
    else if (volatilityScore >= 25) regime = "medium";

    return { volatilityScore, regime, change, volTvl, age, bin };
}

export function buildStrategy(pool, rcData = null, top10pct = 0, gmgn = null) {
    const v = getVolatilityProfile(pool);
    let recommendation = ""; let recColor = ""; let text = "";

    let isMintable = false; let isFreezable = false; let creatorPct = 0;

    if (rcData) {
        isMintable = rcData.token?.mintAuthority !== null;
        isFreezable = rcData.token?.freezeAuthority !== null;
        if (rcData.risks && Array.isArray(rcData.risks)) {
            rcData.risks.forEach(r => {
                if (r.name.toLowerCase().includes('creator') || r.description.toLowerCase().includes('creator')) {
                    const match = r.description.match(/(\d+(\.\d+)?)%/);
                    if (match) creatorPct = parseFloat(match[1]) / 100;
                }
            });
        }
    }

    if (state.currentView === 'alpha' || pool.isExternal) {
        const m = computeAdvancedMetrics(pool);
        const score = pool.sniperScore || 0;
        const g = extractGMGNMetrics(gmgn || pool.gmgnData);
        
        if (m.isBotSpam) {
            recommendation = "AVOID / BOT SPAM DETECTED"; recColor = "#ef4444";
            text = "🚨 Transaksi didominasi oleh bot pencetak volume (Rata-rata tx < $1). Filter strict aktif menolak pool ini.";
        } else if (!m.validUsdTrend) {
            recommendation = "AVOID / SELL PRESSURE"; recColor = "#ef4444";
            text = `⚠️ Volume USD Sell lebih besar dari Buy (Sell: ${formatMoney(m.sellVol1m)} vs Buy: ${formatMoney(m.buyVol1m)}). Tren distribusi.`;
        } else if (top10pct > 0.25) { 
            recommendation = "HIGH RISK / WALLET CONCENTRATION"; recColor = "#ef4444";
            text = `⚠️ Peringatan: ${(top10pct*100).toFixed(1)}% suplai dikuasai oleh Top 10 Holder (Batas aman < 25%). Potensi RUG sangat tinggi!`;
        } else if (creatorPct > 0.5) {
            recommendation = "HIGH RISK / CREATOR HOARDING"; recColor = "#ef4444";
            text = `⚠️ Kreator token menahan suplai sangat besar (${(creatorPct*100).toFixed(0)}%). Risiko exit liquidity sangat tinggi.`;
        } else if ((g.bundleRatio >= 0.35 || g.ratTraderRatio >= 0.35)) {
            recommendation = "RED FLAG / GMGN RISK DETECTED"; recColor = "#ef4444";
            text = `🚨 GMGN red flag: Bundle ${(g.bundleRatio*100).toFixed(1)}% | Rat Trader ${(g.ratTraderRatio*100).toFixed(1)}%. Hindari entry agresif.`;
        } else if (g.smartMoneyWinRate >= 0.65 && g.smartMoneyAccumulation > 0 && score > 55) {
            recommendation = "SMART MONEY FOLLOW"; recColor = "#10b981";
            text = `🧠 Akumulasi Smart Money terkonfirmasi. Win rate ${(g.smartMoneyWinRate*100).toFixed(1)}% dengan net buy positif.`;
        } else if (m.whaleAccumulation && score > 60) {
            recommendation = "STRONG BUY (ORGANIC DIP)"; recColor = "#10b981";
            text = `🚀 Momentum kuat. Dominasi USD Buy terkonfirmasi (Buy ${formatMoney(m.buyVol1m)} vs Sell ${formatMoney(m.sellVol1m)}). Smart money akumulasi.`;
        } else {
            recommendation = "WATCHLIST (NEUTRAL)"; recColor = "#3b82f6";
            text = "Aktivitas pasar dalam batas aman. Dominasi volume dolar seimbang dengan kecenderungan buy.";
        }
    } else {
        if (isMintable || isFreezable) {
            recommendation = "HIGH RISK LP (MINT/FREEZE ACTIVE)"; recColor = "#ef4444";
            text = "⚠️ PERINGATAN: Otoritas sentral (Mint/Freeze) masih aktif menurut audit keamanan. Sangat berisiko untuk DLMM jangka panjang.";
        } else if (v.regime === "extreme") {
            recommendation = "AGGRESSIVE / WIDE RANGE"; recColor = "#ef4444";
            text = "Volatilitas ekstrem. Hindari penyediaan likuiditas sempit (Curve). Gunakan Spot/Bid-Ask dengan bin lebar untuk mitigasi Impermanent Loss.";
        } else if (v.regime === "high") {
            recommendation = "CAUTIOUS / WIDE RANGE"; recColor = "#f59e0b";
            text = "Volatilitas sedang menuju tinggi. Cocok untuk rentang menengah-lebar. Hindari parameter terlalu padat karena risiko lonjakan harga seketika.";
        } else if (v.regime === "medium") {
            recommendation = "BALANCED / CONCENTRATED"; recColor = "#10b981";
            text = "Kondisi pasar stabil. Likuiditas terpusat (Concentrated) sangat ideal untuk menangkap volume transaksi (fee capture) maksimal.";
        } else {
            recommendation = "STABLE / TIGHT RANGE"; recColor = "#3b82f6";
            text = "Pergerakan harga tenang. Strategi rentang ketat (Tight Range) efisien. Pilihan tepat untuk akumulasi yield persentase tinggi.";
        }
    }

    return { recommendation, recColor, text, v };
}
