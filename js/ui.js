import { state } from './config.js';
import { formatUsd, formatNum, short } from './utils.js';

const poolList = document.getElementById('poolList');
const modal = document.getElementById('analysisModal');
const modalTitle = document.getElementById('modalTitle');
const modalBody = document.getElementById('modalBody');
const toastEl = document.getElementById('toast');

export function renderList(items){
  poolList.innerHTML = items.map((x)=>`
    <article class="card glass" data-mint="${x.mint}">
      <strong>${x.name || x.base_name || short(x.mint)}</strong>
      <div>Mint: ${short(x.mint)} | Trend 1m: ${formatNum(x.trend_1m)}%</div>
      <div>TVL: ${formatUsd(x.liquidity_locked || x.liquidity || 0)}</div>
    </article>`).join('');
}

export function bindCardClick(onOpen){
  poolList.onclick = (e)=>{
    const card = e.target.closest('[data-mint]');
    if(!card) return;
    onOpen(card.dataset.mint);
  };
}

export function openModal(data){
  state.selected = data;
  modalTitle.textContent = `${data.name || data.mint} — Analisis Masako`;
  modalBody.textContent = JSON.stringify(data, null, 2);
  modal.classList.add('show');
}

export function initModal(){
  document.getElementById('closeModal').onclick = ()=>modal.classList.remove('show');
  modal.onclick = (e)=> e.target === modal && modal.classList.remove('show');
}

export function toast(msg){
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  setTimeout(()=>toastEl.classList.remove('show'),1500);
}

export const setStatus = (msg)=> document.getElementById('statusArea').textContent = msg;
