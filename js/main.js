import { state, REFRESH_MS } from './config.js';
import { fetchMeteoraPools, fetchGmgnTrending, fetchGmgnAnalysis } from './api.js';
import { mergeIntel, computeAlphaScore } from './engine.js';
import { renderList, bindCardClick, initModal, openModal, setStatus, toast } from './ui.js';

async function loadView(){
  setStatus('Memuat data Meteora DLMM + GMGN intel...');
  const [pools, trending] = await Promise.all([fetchMeteoraPools(), fetchGmgnTrending()]);
  state.pools = mergeIntel(Array.isArray(pools) ? pools : (pools?.pairs||[]), trending?.data || []);
  renderList(state.pools);
  setStatus(`Loaded ${state.pools.length} pools.`);
}

async function openAnalysis(mint){
  const base = state.pools.find((p)=>p.mint===mint) || {mint};
  const gmgn = await fetchGmgnAnalysis(mint);
  const score = computeAlphaScore({ pool: base, gmgn: gmgn?.data || {}, rugcheck: gmgn?.rugcheck || {} });
  openModal({ ...base, gmgn: gmgn?.data, alphaScore: score });
}

function initEvents(){
  document.getElementById('searchBtn').onclick = ()=>{
    const q = document.getElementById('searchInput').value.trim().toLowerCase();
    const filtered = state.pools.filter((p)=>(p.name||'').toLowerCase().includes(q) || (p.mint||'').toLowerCase().includes(q));
    renderList(filtered);
    toast(`Ditemukan ${filtered.length} token`);
  };
  document.getElementById('btnMeteora').onclick = ()=>{ state.view='meteora'; toast('View Meteora DLMM'); };
  document.getElementById('btnAlpha').onclick = ()=>{ state.view='alpha'; toast('View Signal Alpha'); };
}

initModal();
bindCardClick(openAnalysis);
initEvents();
loadView();
setInterval(loadView, REFRESH_MS);
