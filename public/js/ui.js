// Gemeinsame UI-Bausteine.
import { sfx } from './sound.js';

export const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('de-DE');
export const fmtSigned = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + fmt(Math.abs(n));
export const payoutFor = (bet, mult) => Math.floor(Math.round(bet * mult * 1e6) / 1e6);
export const fmtMult = (m) => Number(m).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '×';

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/** Erzeugt Elemente aus einem HTML-String */
export function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.childElementCount === 1 ? t.content.firstElementChild : t.content;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function toast(msg, type = '') {
  const box = document.getElementById('toasts');
  const t = h(`<div class="toast ${type}">${esc(msg)}</div>`);
  box.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 350); }, 2800);
}

export function confetti(count = 80) {
  const colors = ['#e3b341', '#f6d77a', '#2ecc71', '#ffffff', '#e5484d'];
  for (let i = 0; i < count; i++) {
    const c = document.createElement('div');
    c.className = 'confetti';
    c.style.left = Math.random() * 100 + 'vw';
    c.style.background = colors[i % colors.length];
    c.style.animationDuration = 1.8 + Math.random() * 1.8 + 's';
    c.style.animationDelay = Math.random() * 0.5 + 's';
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 4200);
  }
}

/** Gewinn-Feedback: Sound + bei großem Gewinn Konfetti */
export function celebrate(payout, bet) {
  if (payout <= 0) return;
  if (payout >= bet * 10) { sfx.bigWin(); confetti(); bigWin(payout, bet); }
  else if (payout > bet) sfx.win();
  else sfx.coin();
}

/** Große Einblendung mit hochzählendem Gewinn (ab 10× Einsatz) */
export function bigWin(payout, bet) {
  const mult = payout / Math.max(1, bet);
  const title = mult >= 100 ? 'MEGA WIN' : mult >= 30 ? 'HUGE WIN' : 'BIG WIN';
  const el = h(`<div class="bigwin"><div class="bigwin-rays"></div><div class="bigwin-card">
    <div class="bigwin-title">${title}</div><div class="bigwin-amount">0</div>
    <div class="bigwin-mult">${mult.toLocaleString('de-DE', { maximumFractionDigits: 2 })}× Einsatz</div></div></div>`);
  document.body.appendChild(el);
  const amt = el.querySelector('.bigwin-amount');
  const t0 = performance.now(), dur = 1600;
  const step = (t) => {
    const k = Math.min(1, (t - t0) / dur);
    amt.textContent = '+' + fmt(payout * (1 - Math.pow(1 - k, 3)));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 500); };
  setTimeout(close, 2800);
}

export function modal(contentEl, { closable = true } = {}) {
  const m = document.getElementById('modal');
  const card = document.getElementById('modalCard');
  card.replaceChildren(contentEl);
  m.classList.remove('hidden');
  const close = () => { m.classList.add('hidden'); m.onclick = null; document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape' && closable) close(); };
  m.onclick = (e) => { if (e.target === m && closable) close(); };
  document.addEventListener('keydown', onKey);
  return close;
}

export function confirmDialog(title, text, okLabel = 'OK', danger = false) {
  return new Promise((resolve) => {
    const el = h(`<div>
      <h2>${esc(title)}</h2><p class="muted">${esc(text)}</p>
      <div class="row" style="justify-content:flex-end;margin-top:16px">
        <button class="btn btn-ghost" data-r="0">Abbrechen</button>
        <button class="btn ${danger ? 'btn-red' : 'btn-gold'}" data-r="1">${esc(okLabel)}</button>
      </div></div>`);
    const close = modal(el);
    el.querySelectorAll('[data-r]').forEach((b) => b.addEventListener('click', () => { close(); resolve(b.dataset.r === '1'); }));
  });
}

/**
 * Einsatz-Eingabe mit Schnellbuttons ½, 2x, Max.
 * getBalance: Funktion, die das aktuelle Guthaben liefert.
 */
export const MAX_BET = 1_000_000_000; // wie server/util.js

export function betControl({ game, getBalance, min = 1, initial = 100, label = 'Einsatz' }) {
  const key = `casino.bet.${game}`;
  let start = initial;
  try { start = Number(localStorage.getItem(key)) || initial; } catch { /* egal */ }
  const el = h(`<label class="field">${esc(label)}
    <div class="bet-row">
      <input class="input" type="number" inputmode="numeric" min="${min}" max="${MAX_BET}" step="1">
      <button class="btn btn-sm" type="button" data-bq="half">½</button>
      <button class="btn btn-sm" type="button" data-bq="double">2×</button>
      <button class="btn btn-sm" type="button" data-bq="max">Max</button>
    </div></label>`);
  const input = el.querySelector('input');
  const clamp = (v) => {
    const bal = Math.max(min, Math.min(MAX_BET, Math.floor(getBalance())));
    v = Math.floor(Number(v) || 0);
    return Math.min(Math.max(v, min), bal);
  };
  const set = (v, doClamp = true) => {
    input.value = doClamp ? clamp(v) : Math.max(min, Math.floor(Number(v) || min));
    try { localStorage.setItem(key, input.value); } catch { /* egal */ }
    api.onChange?.(api.value);
  };
  el.querySelectorAll('[data-bq]').forEach((b) => b.addEventListener('click', (e) => {
    e.preventDefault();
    sfx.chip();
    const v = Number(input.value) || min;
    if (b.dataset.bq === 'half') set(Math.floor(v / 2));
    if (b.dataset.bq === 'double') set(v * 2);
    if (b.dataset.bq === 'max') set(getBalance());
  }));
  input.addEventListener('change', () => set(input.value));
  input.addEventListener('input', () => api.onChange?.(Math.floor(Number(input.value) || 0)));
  const api = {
    el,
    onChange: null,
    get value() { return Math.floor(Number(input.value) || 0); },
    set value(v) { set(v); },
    setDisabled(d) { el.querySelectorAll('input,button').forEach((x) => (x.disabled = d)); },
  };
  set(start, false);
  return api;
}

/** Segment-Umschalter (z. B. Risiko: niedrig/mittel/hoch) */
export function segmented(options, value, onChange) {
  const el = h(`<div class="seg">${options.map((o) => `<button type="button" data-v="${esc(o.value)}">${esc(o.label)}</button>`).join('')}</div>`);
  const buttons = [...el.querySelectorAll('button')];
  const api = {
    el,
    value,
    set(v) {
      api.value = v;
      buttons.forEach((b) => b.classList.toggle('on', b.dataset.v === String(v)));
    },
    setDisabled(d) { buttons.forEach((b) => (b.disabled = d)); },
  };
  buttons.forEach((b) => b.addEventListener('click', () => {
    const opt = options.find((o) => String(o.value) === b.dataset.v);
    sfx.click();
    api.set(opt.value);
    onChange?.(opt.value);
  }));
  api.set(value);
  return api;
}

const SUIT_RED = new Set(['♥', '♦']);
const RANK = { 11: 'B', 12: 'D', 13: 'K', 14: 'A' };
export const rankLabel = (r) => RANK[r] || String(r);

/** Spielkarte als Element. card = {r, s} oder null (verdeckt) */
export function cardEl(card, cls = '') {
  if (!card) return h(`<div class="card back ${cls}"></div>`);
  const r = rankLabel(card.r);
  return h(`<div class="card ${SUIT_RED.has(card.s) ? 'red' : ''} ${cls}">
    <div class="c-top"><span>${r}</span><span>${card.s}</span></div>
    <div class="c-mid">${card.s}</div>
    <div class="c-bot"><span>${r}</span><span>${card.s}</span></div></div>`);
}
