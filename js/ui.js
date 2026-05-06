import { state } from './config.js';
import { formatMoney, formatNum, short } from './utils.js';

const poolList = document.getElementById('poolList');
const modal = document.getElementById('analysisModal');
const modalTitle = document.getElementById('modalTitle');
const modalBody = document.getElementById('modalBody');
const toastEl = document.getElementById('toast');

export function renderAIStrategyBox(strategy = {}) {
  return `
    <section class="ai-box">
      <h4>Masako Engine Strategy</h4>
      <p><strong>Stance:</strong> ${strategy.stance || '-'}</p>
      <p><strong>Entry:</strong> ${strategy.entryZone || '-'}</p>
      <p><strong>Risk:</strong> ${strategy.riskPlan || '-'}</p>
      <ul>${(strategy.intel || []).map((x) => `<li>${x}</li>`).join('')}</ul>
    </section>
  `;
}

export function renderList(items) {
  poolList.innerHTML = items.map((x) => `
    <article class="card glass" data-mint="${x.mint}">
      <strong>${x.name || x.base_name || short(x.mint)}</strong>
      <div>Mint: ${short(x.mint)} | Trend 1m: ${formatNum(x.trend_1m)}%</div>
      <div>TVL: ${formatMoney(x.liquidity_locked || x.liquidity || 0)}</div>
    </article>`).join('');
}

export function fillModalData(data = {}) {
  const gmgn = data.gmgn || {};
  const strategyHtml = data.strategy ? renderAIStrategyBox(data.strategy) : '';
  modalBody.innerHTML = `
    <div class="modal-grid">
      <p><strong>Mint:</strong> ${data.mint || '-'}</p>
      <p><strong>Alpha Score:</strong> ${formatNum(data.alphaScore || 0)}</p>
      <p><strong>Bundle Ratio:</strong> ${formatNum((gmgn.bundle_ratio || 0) * 100)}%</p>
      <p><strong>Dev Tracking:</strong> ${formatNum((gmgn.dev_tracking_score || 0) * 100)}%</p>
      <p><strong>Rat Trader:</strong> ${formatNum((gmgn.rat_trader_ratio || 0) * 100)}%</p>
    </div>
    ${strategyHtml}
  `;
}

export function bindCardClick(onOpen) {
  poolList.onclick = (e) => {
    const card = e.target.closest('[data-mint]');
    if (!card) return;
    onOpen(card.dataset.mint);
  };
}

export function openModal(data) {
  state.activeModalData = data;
  modalTitle.textContent = `${data.name || data.mint} — Analisis Masako`;
  fillModalData(data);
  modal.classList.add('show');
}

export function initModal() {
  document.getElementById('closeModal').onclick = () => modal.classList.remove('show');
  modal.onclick = (e) => e.target === modal && modal.classList.remove('show');
}

export function toast(message) {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  setTimeout(() => toastEl.classList.remove('show'), 1700);
}

export const setStatus = (message) => {
  document.getElementById('statusArea').textContent = message;
};
