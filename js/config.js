export const SYSTEM_CODENAME = "Masako_Alpha_Engine_v20"; 
export const MAX_CACHE = 300;

export const IGNORED_MINTS = new Set([
    'So11111111111111111111111111111111111111112',
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',
    'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn',
    'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
    'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263'
]);

// Global state untuk manajemen data antar modul
export const state = {
    poolsData: [],        
    alphaData: [],        
    currentView: 'meteora', 
    searchQuery: "",
    refreshTimer: null,
    activeModalData: null, 
    selectedPoolKey: null, 
    pinnedTokens: new Set(JSON.parse(localStorage.getItem('masako_pinned_v20') || '[]')),
    isMeteoraLoading: false,
    isAlphaLoading: false,
    ctrlMeteora: null,
    ctrlAlpha: null,
    ctrlSearch: null,
    lastMeteoraFetch: 0,
    lastAlphaFetch: 0,
    apiCache: new Map(),
    gmgnCache: new Map(),
    gmgnTrenchMode: false,
    isRefreshing: false,
    modalSession: 0
};
