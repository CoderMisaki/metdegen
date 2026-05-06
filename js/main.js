import { REFRESH_MS, state } from './config.js';
import { fetchGmgnAnalysis, fetchGmgnTrending, fetchMeteoraPools } from './api.js';
import { buildStrategy, computeAlphaScore, mergeIntel } from './engine.js';
import { bindCardClick, initModal, openModal, renderList, setStatus, toast } from './ui.js';

async function loadMeteoraView() {
  state.isMeteoraLoading = true;
  setStatus('Memuat Meteora DLMM + GMGN trending...');
  try {
    const [pools, trending] = await Promise.all([fetchMeteoraPools(), fetchGmgnTrending()]);
    const normalizedPools = Array.isArray(pools) ? pools : pools?.pairs || [];
    state.poolsData = mergeIntel(normalizedPools, trending?.data || []);
    renderList(state.poolsData);
    setStatus(`Loaded ${state.poolsData.length} DLMM pools.`);
  } catch (error) {
    console.error(error);
    setStatus('Gagal memuat data. Coba refresh lagi.');
    toast(`Error: ${error.message}`);
  } finally {
    state.isMeteoraLoading = false;
  }
}

async function openAnalysisModal(mint) {
  const base = state.poolsData.find((p) => p.mint === mint) || { mint };
  const gmgnPayload = await fetchGmgnAnalysis(mint);
  const gmgn = gmgnPayload?.data || {};
  const alphaScore = computeAlphaScore({ pool: base, gmgn, rugcheck: gmgnPayload?.rugcheck || {} });
  const strategy = buildStrategy({ pool: base, gmgn, alphaScore });

  openModal({
    ...base,
    gmgn,
    alphaScore,
    strategy,
  });
}

function initEvents() {
  document.getElementById('searchBtn').onclick = () => {
    state.searchQuery = document.getElementById('searchInput').value.trim().toLowerCase();
    const filtered = state.poolsData.filter((p) =>
      (p.name || p.base_name || '').toLowerCase().includes(state.searchQuery)
      || (p.mint || '').toLowerCase().includes(state.searchQuery));

    renderList(filtered);
    toast(`Ditemukan ${filtered.length} token`);
  };

  document.getElementById('btnMeteora').onclick = () => {
    state.currentView = 'meteora';
    renderList(state.poolsData);
    toast('View Meteora DLMM aktif');
  };

  document.getElementById('btnAlpha').onclick = () => {
    state.currentView = 'alpha';
    const alphaSorted = [...state.poolsData].sort((a, b) => (b.trend_1m || 0) - (a.trend_1m || 0));
    renderList(alphaSorted);
    toast('View Signal Alpha aktif');
  };
}

function boot() {
  initModal();
  bindCardClick(openAnalysisModal);
  initEvents();
  loadMeteoraView();

  if (state.refreshTimer) clearInterval(state.refreshTimer);
  state.refreshTimer = setInterval(loadMeteoraView, REFRESH_MS);
}

boot();
