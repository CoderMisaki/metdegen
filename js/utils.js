import { state } from './config.js';

export const sleep = ms => new Promise(r => setTimeout(r, ms)); 

export function safeExec(fn) { try { fn(); } catch(e) {} }

export function escapeHTML(str) {
    return String(str || "").replace(/[&<>'"]/g, tag => 
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag])
    );
}

const SOL_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export function isValidSolAddress(v) { return SOL_RE.test(String(v || '').trim()); }

export function normalizeAddressInput(q) { return String(q || '').trim(); }

export const formatMoney = (n) => {
    if (n === null || n === undefined) return "—";
    const num = Number(n);
    if (!Number.isFinite(num)) return "—";
    if (num === 0) return "$0.00";

    const absNum = Math.abs(num);
    const sign = num < 0 ? "-" : "";

    if (absNum >= 1e9) return sign + "$" + (absNum / 1e9).toFixed(2) + "B";
    if (absNum >= 1e6) return sign + "$" + (absNum / 1e6).toFixed(2) + "M";
    if (absNum >= 1e3) return sign + "$" + (absNum / 1e3).toFixed(2) + "K";
    return sign + "$" + absNum.toFixed(2);
};

export const formatPct = (n) => {
    if (n === null || n === undefined || Number.isNaN(n)) return "—";
    const num = Number(n);
    if (num === 0) return "0.00%";
    return (num > 0 ? "▲ +" : "▼ ") + Math.abs(num).toFixed(2) + "%";
};

export const formatNum = (n) => {
    if (n === null || n === undefined || !Number.isFinite(n)) return "—";
    if (n === 0) return "0";
    return new Intl.NumberFormat('en-US').format(Math.floor(n));
};

export const formatAddress = (addr) => (!addr || addr === "Unknown" || addr === "—" || addr.length < 8) ? "—" : `${addr.substring(0, 4)}...${addr.substring(addr.length - 4)}`;

export function getBestPriceChange(dex) {
    if (!dex || !dex.priceChange) return null;
    if (typeof dex.priceChange.h24 === 'number') return Number(dex.priceChange.h24);
    if (typeof dex.priceChange.h6 === 'number') return Number(dex.priceChange.h6);
    if (typeof dex.priceChange.h1 === 'number') return Number(dex.priceChange.h1);
    if (typeof dex.priceChange.m5 === 'number') return Number(dex.priceChange.m5);
    return null;
}

export function formatAge(hours) {
    if (hours === null || hours === undefined) return "—";
    
    // Perbaikan untuk hitungan di bawah 24 jam (Jam & Menit)
    if (hours < 24) {
        const h = Math.floor(hours);
        const m = Math.floor((hours - h) * 60);
        return m > 0 ? `${h}h ${m}m` : `${h}h`;
    }
    
    const totalDays = Math.floor(hours / 24);
    
    // Konversi ke format bulan (Meteora Style)
    if (totalDays >= 30) {
        const m = Math.floor(totalDays / 30);
        const d = totalDays % 30;
        return d > 0 ? `${m}mo ${d}d` : `${m}mo`;
    }
    
    const h = Math.floor(hours % 24);
    return h > 0 ? `${totalDays}d ${h}h` : `${totalDays}d`;
}
