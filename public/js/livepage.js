// Live-Bereich (wer spielt gerade wo + große Gewinne), Cases öffnen und Case Battles.
import { h, esc, fmt, sleep, toast, celebrate, confetti, segmented, confirmDialog } from './ui.js';
import { sfx } from './sound.js';
import { GAMES } from './app.js';
import { skinCard, caseArt } from './skins.js';

const PAGE_NAMES = { home: 'Startseite', live: 'Live', duels: 'Duelle', duel: 'Duell', cases: 'Cases', battle: 'Case Battle', stats: 'Statistik', leaderboard: 'Rangliste', settings: 'Einstellungen', admin: 'Admin' };
const whereName = (w) => GAMES.find((g) => g.id === w)?.name || PAGE_NAMES[w] || w;
const whereIcon = (w) => GAMES.find((g) => g.id === w)?.icon || { duels: '⚔️', duel: '⚔️', cases: '📦', battle: '📦', live: '🟢' }[w] || '🏠';
const ago = (t) => { const s = Math.round((Date.now() - t) / 1000); return s < 60 ? `vor ${s} s` : `vor ${Math.round(s / 60)} min`; };

// ===================== Live =====================
export async function live(root, ctx) {
  let alive = true, timer = 0;
  const el = h(`<div>
    <div class="page-head"><h1>🟢 Live</h1></div>
    <div class="live-grid">
      <div class="panel"><h2>Gerade online</h2><div class="live-online"></div></div>
      <div class="panel"><h2>🔥 Große Gewinne</h2><div class="live-feed"></div></div>
    </div>
    <a class="tile live-crash-tile" href="#/livecrash" style="--tile-a:#7a1f3d;--tile-b:#2a0614;margin-top:18px">
      <span class="tile-tag is-new">LIVE · Multiplayer</span><span class="tile-icon">🚀</span>
      <h3>Live-Crash</h3><p>Eine Rakete für alle – spring rein und spiel mit den anderen in derselben Runde.</p>
    </a></div>`);
  root.appendChild(el);
  const onEl = el.querySelector('.live-online'), feedEl = el.querySelector('.live-feed');

  async function refresh() {
    try {
      const r = await ctx.post('/api/live/ping', { where: 'live' });
      onEl.innerHTML = r.online.map((o) => {
        const canJoin = GAMES.some((g) => g.id === o.where) || ['duels', 'cases'].includes(o.where);
        return `<div class="live-row"><span class="avatar">${esc(o.name.slice(0, 1).toUpperCase())}</span>
          <span class="lr-name">${esc(o.name)}${o.name === ctx.state.me?.name ? ' <span class="muted">(du)</span>' : ''}</span>
          <span class="lr-where">${whereIcon(o.where)} ${esc(whereName(o.where))}</span>
          ${canJoin && o.name !== ctx.state.me?.name ? `<a class="btn btn-sm btn-gold" href="#/${esc(o.where)}">Dazu</a>` : ''}</div>`;
      }).join('') || '<p class="muted">Niemand online.</p>';
      feedEl.innerHTML = r.feed.map((f) => `<div class="live-row feed"><span class="lr-icon">${whereIcon(f.game)}</span>
        <span class="lr-name"><b>${esc(f.name)}</b> gewinnt <b class="gold">+${fmt(f.net)}</b> bei ${esc(whereName(f.game))} (${f.mult.toLocaleString('de-DE')}×)</span><span class="muted">${ago(f.at)}</span></div>`).join('')
        || '<p class="muted">Noch keine großen Gewinne – ab 10× Einsatz und 1.000 Chips Gewinn landet man hier.</p>';
    } catch { /* egal */ }
    if (alive) timer = setTimeout(refresh, 3000);
  }
  await refresh();
  return () => { alive = false; clearTimeout(timer); };
}

// ===================== Case-Bausteine =====================
let INFO = null;
async function caseInfo(ctx) { if (!INFO) INFO = await ctx.post('/api/cases/info'); return INFO; }

const itemCard = (it, rarities, cls = '') => skinCard(it, rarities, cls);

function pickWeighted(items) {
  let r = Math.random();
  for (const it of items) { r -= it.chance; if (r < 0) return it; }
  return items[0];
}

/** Lässt einen Streifen voller Skins laufen und hält beim Ziel an (axis 'x' = waagerecht, 'y' = senkrecht) */
function spin(box, caseObj, rarities, target, { duration = 4200, axis = 'x', sound = true } = {}) {
  return new Promise((resolve) => {
    const N = 42, T = 36;
    const items = Array.from({ length: N }, (_, i) => (i === T ? target : pickWeighted(caseObj.items)));
    box.innerHTML = `<div class="reel-track ${axis}">${items.map((it, i) => itemCard(it, rarities, i === T ? 'target' : '')).join('')}</div><div class="reel-marker ${axis}"></div>`;
    const track = box.firstElementChild;
    const card = track.children[T];
    const boxSize = axis === 'x' ? box.clientWidth : box.clientHeight;
    const pos = axis === 'x' ? card.offsetLeft + card.offsetWidth / 2 : card.offsetTop + card.offsetHeight / 2;
    const jitter = (Math.random() - 0.5) * (axis === 'x' ? card.offsetWidth : card.offsetHeight) * 0.6;
    const dist = pos - boxSize / 2 + jitter;
    track.style.transform = 'translate(0,0)';
    void track.offsetWidth;
    track.style.transition = `transform ${duration}ms cubic-bezier(.08,.6,.12,1)`;
    track.style.transform = axis === 'x' ? `translateX(${-dist}px)` : `translateY(${-dist}px)`;
    // Tick-Geräusch beim Vorbeiziehen
    const t0 = performance.now();
    let last = 0;
    const step = () => {
      const k = (performance.now() - t0) / duration;
      if (k >= 1) return;
      const e = 1 - Math.pow(1 - k, 3.2);
      const idx = Math.floor((e * dist) / (axis === 'x' ? card.offsetWidth + 6 : card.offsetHeight + 6));
      if (idx !== last) { last = idx; if (sound) sfx.tick(); }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    setTimeout(() => {
      track.style.transition = 'transform .35s ease-out';
      track.style.transform = axis === 'x' ? `translateX(${-(pos - boxSize / 2)}px)` : `translateY(${-(pos - boxSize / 2)}px)`;
      card.classList.add('landed');
      if (sound) sfx.reelStop();
      setTimeout(resolve, 380);
    }, duration + 50);
  });
}

// ===================== Cases (Öffnen + Battles) =====================
export async function cases(root, ctx) {
  const info = await caseInfo(ctx);
  let alive = true, timer = 0, tab = 'open', sel = info.cases[0].id, busy = false;
  try { tab = localStorage.getItem('casino.cases.tab') || 'open'; sel = localStorage.getItem('casino.cases.sel') || sel; } catch { /* egal */ }
  if (!info.cases.some((c) => c.id === sel)) sel = info.cases[0].id;
  const caseById = (id) => info.cases.find((c) => c.id === id);

  const el = h(`<div>
    <div class="page-head"><h1>📦 Cases</h1></div>
    <div class="tab-row"><button class="btn" data-t="open">📦 Case öffnen</button><button class="btn" data-t="battles">⚔️ Case Battles</button><button class="btn" data-t="inventory">🎒 Inventar <span class="inv-count muted"></span></button></div>
    <div class="case-picker"></div>
    <div class="cases-body"></div></div>`);
  root.appendChild(el);
  const picker = el.querySelector('.case-picker');
  const body = el.querySelector('.cases-body');

  function paintPicker() {
    picker.classList.toggle('hidden', tab === 'inventory');
    const box = (c) => `<button class="case-box ${c.id === sel ? 'on' : ''}" data-c="${c.id}" style="--cc:${c.color}">
      <span class="case-ico">${caseArt(c.color)}</span><b>${esc(c.name)}</b><span class="gold">${fmt(c.price)}</span></button>`;
    const group = (tier, title) => {
      const list = info.cases.filter((c) => (c.tier || 'standard') === tier);
      return list.length ? `<div class="case-group ${tier}"><h3>${title}</h3><div class="case-grid">${list.map(box).join('')}</div></div>` : '';
    };
    picker.innerHTML = group('standard', '📦 Standard-Cases') + group('highroller', '💎 High Roller – für die ganz großen Ziehungen');
    picker.querySelectorAll('[data-c]').forEach((b) => b.addEventListener('click', () => {
      if (busy) return;
      sel = b.dataset.c;
      try { localStorage.setItem('casino.cases.sel', sel); } catch { /* egal */ }
      sfx.click();
      paintPicker();
      paintBody();
    }));
  }

  function contents(c) {
    return `<details class="case-contents"><summary>Inhalt & Chancen</summary><div class="skin-grid">${
      [...c.items].sort((a, b) => b.value - a.value).map((it) => `<div>${itemCard(it, info.rarities)}<small class="muted">${(it.chance * 100).toLocaleString('de-DE', { maximumFractionDigits: 3 })} %</small></div>`).join('')}</div></details>`;
  }

  // ---------- Öffnen ----------
  let openCount = 1;
  try { openCount = Math.min(10, Math.max(1, Number(localStorage.getItem('casino.cases.count')) || 1)); } catch { /* egal */ }

  function paintOpen() {
    const c = caseById(sel);
    body.innerHTML = `<div class="panel">
      <div class="reels"></div>
      <div class="result-msg"></div>
      <div class="open-count"><span class="muted">Anzahl:</span><div class="count-seg"></div></div>
      <div class="row" style="justify-content:center"><button class="btn btn-gold btn-big open-btn" style="max-width:420px"></button></div>
      ${contents(c)}</div>`;
    const reels = body.querySelector('.reels');
    const btn = body.querySelector('.open-btn');
    const msg = body.querySelector('.result-msg');
    const label = () => { btn.textContent = `${openCount > 1 ? `${openCount}× ` : ''}${c.name} öffnen – ${fmt(c.price * openCount)}`; };
    // Walzen aufbauen: 1 Case = waagerecht, mehrere = senkrechte Walzen nebeneinander (wie bei CS2)
    const buildReels = () => {
      const multi = openCount > 1;
      reels.className = `reels ${multi ? 'multi' : ''}`;
      reels.style.setProperty('--n', Math.min(openCount, 5));
      reels.innerHTML = Array.from({ length: openCount }, () => `<div class="reel-box ${multi ? 'vertical multi' : 'solo'}"></div>`).join('');
      reels.querySelectorAll('.reel-box').forEach((box) => {
        const axis = multi ? 'y' : 'x';
        box.innerHTML = `<div class="reel-track ${axis}">${c.items.slice(0, 8).map((it) => itemCard(it, info.rarities)).join('')}</div><div class="reel-marker ${axis}"></div>`;
      });
    };
    const seg = segmented(Array.from({ length: 10 }, (_, i) => ({ value: i + 1, label: String(i + 1) })), openCount, (v) => {
      if (busy) return;
      openCount = v;
      try { localStorage.setItem('casino.cases.count', v); } catch { /* egal */ }
      label(); buildReels(); msg.className = 'result-msg'; msg.innerHTML = '';
    });
    body.querySelector('.count-seg').appendChild(seg.el);
    label(); buildReels();

    btn.addEventListener('click', async () => {
      if (busy) return;
      busy = true;
      btn.disabled = true;
      seg.setDisabled(true);
      msg.className = 'result-msg';
      msg.textContent = '';
      try {
        const r = await ctx.post('/api/cases/open', { caseId: c.id, count: openCount });
        ctx.setBalance(r.balance);
        setInvCount(r.invCount);
        const items = r.items || [r.item];
        if (items.length !== reels.children.length) { openCount = items.length; buildReels(); }
        const boxes = [...reels.querySelectorAll('.reel-box')];
        const multi = items.length > 1;
        // leicht versetzt anhalten lassen, damit es spannender wirkt
        await Promise.all(items.map((it, k) => spin(boxes[k], c, info.rarities, it, multi ? { axis: 'y', duration: 3600 + k * 180, sound: k === items.length - 1 } : {})));
        if (!alive) return;
        const total = items.reduce((a, x) => a + x.value, 0);
        const net = total - r.price;
        const best = items.reduce((a, x) => (x.value > a.value ? x : a), items[0]);
        msg.className = 'result-msg drop-msg ' + (net > 0 ? 'win' : 'lose');
        if (!multi) {
          const it = items[0], rar = info.rarities[it.rarity];
          msg.innerHTML = `<div class="drop-name" style="color:${rar.color}">${it.st ? '<span class="skin-st">StatTrak™</span> ' : ''}${esc(it.weapon)} | ${esc(it.finish)}</div>
            <div class="drop-sub"><span style="color:${rar.color}">${esc(rar.name)}</span> · ${esc(it.wearName)} · Float ${it.float.toFixed(4)} · <b class="gold">${fmt(it.value)} Chips</b></div>`;
        } else {
          const rar = info.rarities[best.rarity];
          msg.innerHTML = `<div class="drop-name">${items.length} Skins im Wert von <span class="gold">${fmt(total)}</span> Chips <span class="${net >= 0 ? 'pos' : 'neg'}" style="font-size:.9rem">(${net >= 0 ? '+' : '−'}${fmt(Math.abs(net))})</span></div>
            <div class="drop-sub">Bester Zug: <span style="color:${rar.color}">${best.st ? 'StatTrak™ ' : ''}${esc(best.weapon)} | ${esc(best.finish)}</span> · ${esc(best.wearName)} · <b class="gold">${fmt(best.value)}</b></div>`;
        }
        msg.insertAdjacentHTML('beforeend', `<div class="row drop-actions" style="justify-content:center;gap:8px;margin-top:8px">
          <button class="btn btn-sm btn-green sell-now">${multi ? 'Alle verkaufen' : 'Verkaufen'} (+${fmt(total)})</button><button class="btn btn-sm keep-now">🎒 Behalten</button></div>`);
        const actions = msg.querySelector('.drop-actions');
        actions.querySelector('.sell-now').addEventListener('click', async (e) => {
          e.target.disabled = true;
          try {
            const s2 = await ctx.post('/api/cases/sell', { ids: items.map((x) => x.id) });
            ctx.setBalance(s2.balance); setInvCount(s2.count); sfx.coin();
            actions.innerHTML = `<span class="pos">Verkauft: +${fmt(s2.amount)} Chips</span>`;
          } catch (err) { toast(err.message, 'err'); e.target.disabled = false; }
        });
        actions.querySelector('.keep-now').addEventListener('click', () => { actions.innerHTML = '<span class="muted">Liegt in deinem Inventar 🎒</span>'; });
        if (net > 0) celebrate(total, r.price); else sfx.lose();
      } catch (e) { toast(e.message, 'err'); }
      busy = false;
      btn.disabled = false;
      seg.setDisabled(false);
    });
  }

  // ---------- Battles ----------
  let rounds = 1, slots = 2;
  try { rounds = Number(localStorage.getItem('casino.cases.rounds')) || 1; slots = Number(localStorage.getItem('casino.cases.slots')) || 2; } catch { /* egal */ }

  function paintBattles() {
    const c = caseById(sel);
    body.innerHTML = `<div class="duel-grid">
      <div class="panel">
        <h2>Neues Battle</h2>
        <p class="muted" style="margin-top:0">Alle öffnen dieselben Cases. Wer den höchsten Gesamtwert zieht, bekommt <b>alle</b> Skins (als Chips).</p>
        <label class="field">Runden (Cases pro Spieler)<div class="r-seg"></div></label>
        <label class="field" style="margin-top:10px">Spieler<div class="s-seg"></div></label>
        <div class="kv" style="margin-top:10px"><span>Kosten pro Spieler</span><span class="gold cost">${fmt(c.price * rounds)}</span></div>
        <button class="btn btn-gold btn-big create-btn" style="margin-top:10px">BATTLE ERSTELLEN</button>
        ${contents(c)}
      </div>
      <div class="battle-lists"></div></div>`;
    const rSeg = segmented([1, 2, 3, 4, 5].map((v) => ({ value: v, label: String(v) })), rounds, (v) => { rounds = v; save(); body.querySelector('.cost').textContent = fmt(c.price * rounds); });
    const sSeg = segmented([2, 3, 4].map((v) => ({ value: v, label: `${v} Spieler` })), slots, (v) => { slots = v; save(); });
    body.querySelector('.r-seg').appendChild(rSeg.el);
    body.querySelector('.s-seg').appendChild(sSeg.el);
    function save() { try { localStorage.setItem('casino.cases.rounds', rounds); localStorage.setItem('casino.cases.slots', slots); } catch { /* egal */ } }
    body.querySelector('.create-btn').addEventListener('click', async () => {
      try {
        const r = await ctx.post('/api/cases/create', { caseId: sel, rounds, slots });
        ctx.setBalance(r.balance);
        sfx.chip();
        location.hash = `#/battle?id=${r.id}`;
      } catch (e) { toast(e.message, 'err'); }
    });
    refreshBattles();
  }

  async function refreshBattles() {
    clearTimeout(timer);
    if (!alive || tab !== 'battles') return;
    const lists = body.querySelector('.battle-lists');
    if (!lists) return;
    try {
      const r = await ctx.post('/api/cases/list');
      const row = (b, btns) => `<div class="duel-row"><span class="dg-icon">📦</span>
        <div class="dr-main"><b>${esc(b.caseName)} × ${b.rounds}</b><small>${b.players.map((p) => esc(p.name)).join(' · ')} ${b.status === 'waiting' ? `(${b.players.length}/${b.slots})` : ''}</small></div>
        <span class="dr-stake"><span class="chip-icon"></span>${fmt(b.cost)}</span><div class="dr-actions">${btns}</div></div>`;
      const sec = (title, arr, fn, empty) => `<div class="panel section"><h2>${title}</h2>${arr.length ? arr.map(fn).join('') : `<p class="muted" style="margin:0">${empty}</p>`}</div>`;
      lists.innerHTML =
        sec('⏳ Offene Battles', r.waiting, (b) => row(b, b.mine
          ? `<button class="btn btn-sm btn-green" data-a="bots" data-id="${b.id}">Mit Bots starten</button><button class="btn btn-sm" data-a="cancel" data-id="${b.id}">Abbrechen</button>`
          : b.joined ? '<span class="muted">dabei</span>' : `<button class="btn btn-sm btn-gold" data-a="join" data-id="${b.id}">Beitreten</button>`), 'Keine offenen Battles – erstell eins!') +
        sec('▶️ Laufende Battles', r.running, (b) => row(b, `<a class="btn btn-sm btn-gold" href="#/battle?id=${b.id}">Zuschauen</a>`), 'Gerade läuft kein Battle.') +
        sec('📜 Letzte Battles', r.done, (b) => row(b, `<span class="${b.players.find((p) => p.me)?.winner ? 'pos' : 'muted'}">${b.players.filter((p) => p.winner).map((p) => esc(p.name)).join(' & ')} gewinnt ${fmt(b.pot)}</span><a class="btn btn-sm btn-ghost" href="#/battle?id=${b.id}">Ansehen</a>`), 'Noch keine Battles.');
      lists.querySelectorAll('[data-a]').forEach((btn) => btn.addEventListener('click', async () => {
        try {
          const res = await ctx.post(`/api/cases/${btn.dataset.a}`, { id: btn.dataset.id });
          ctx.setBalance(res.balance);
          if (btn.dataset.a === 'cancel') { refreshBattles(); return; }
          location.hash = `#/battle?id=${res.id}`;
        } catch (e) { toast(e.message, 'err'); refreshBattles(); }
      }));
    } catch { /* egal */ }
    timer = setTimeout(refreshBattles, 3000);
  }

  // ---------- Inventar ----------
  function setInvCount(n) { el.querySelector('.inv-count').textContent = n ? `(${n})` : ''; }
  let invSort = 'new';
  try { invSort = localStorage.getItem('casino.inv.sort') || 'new'; } catch { /* egal */ }
  const RAR_ORDER = ['mythic', 'legendary', 'epic', 'rare', 'common'];
  async function paintInventory() {
    body.innerHTML = '<div class="panel"><p class="muted">Lade Inventar …</p></div>';
    let inv;
    try { inv = await ctx.post('/api/cases/inventory'); } catch (e) { body.innerHTML = `<div class="panel"><p class="neg">${esc(e.message)}</p></div>`; return; }
    if (!alive || tab !== 'inventory') return;
    setInvCount(inv.count);
    const selected = new Set();
    const sorted = () => {
      const a = [...inv.items];
      if (invSort === 'value') a.sort((x, y) => y.value - x.value);
      else if (invSort === 'rarity') a.sort((x, y) => RAR_ORDER.indexOf(x.rarity) - RAR_ORDER.indexOf(y.rarity) || y.value - x.value);
      return a;
    };
    body.innerHTML = `<div class="panel inv-panel">
      <div class="inv-head">
        <div><h2 style="margin:0">🎒 Inventar</h2><span class="muted">${fmt(inv.count)} / ${fmt(inv.max)} Skins · Gesamtwert <b class="gold">${fmt(inv.total)}</b> Chips</span></div>
        <div class="row" style="gap:8px;flex-wrap:wrap">
          <select class="input inv-sort" style="width:auto"><option value="new">Neueste zuerst</option><option value="value">Wertvollste zuerst</option><option value="rarity">Nach Seltenheit</option></select>
          <button class="btn btn-green sell-sel" disabled>Auswahl verkaufen</button>
          <button class="btn btn-ghost sell-all" ${inv.count ? '' : 'disabled'}>Alles verkaufen</button>
        </div>
      </div>
      <p class="muted" style="margin:6px 0 12px;font-size:.85rem">Tippe Skins an, um sie auszuwählen. Verkauft wird zum angezeigten Wert.</p>
      <div class="skin-grid inv-grid"></div></div>`;
    const grid = body.querySelector('.inv-grid');
    const sellSel = body.querySelector('.sell-sel');
    const paintGrid = () => {
      grid.innerHTML = inv.items.length ? sorted().map((it) => skinCard(it, info.rarities, selected.has(it.id) ? 'inv on' : 'inv', `data-id="${esc(it.id)}" title="${esc(it.caseName)} · ${esc(it.wearName)} · Float ${it.float.toFixed(4)}"`)).join('')
        : '<p class="muted">Noch leer – öffne ein Case!</p>';
      const sum = inv.items.filter((x) => selected.has(x.id)).reduce((a, x) => a + x.value, 0);
      sellSel.disabled = !selected.size;
      sellSel.textContent = selected.size ? `${selected.size} verkaufen (+${fmt(sum)})` : 'Auswahl verkaufen';
    };
    paintGrid();
    const sortSel = body.querySelector('.inv-sort');
    sortSel.value = invSort;
    sortSel.addEventListener('change', () => { invSort = sortSel.value; try { localStorage.setItem('casino.inv.sort', invSort); } catch { /* egal */ } paintGrid(); });
    grid.addEventListener('click', (e) => {
      const card = e.target.closest('[data-id]');
      if (!card) return;
      const id = card.dataset.id;
      if (selected.has(id)) selected.delete(id); else selected.add(id);
      sfx.click();
      paintGrid();
    });
    const doSell = async (payload, label) => {
      try {
        const r = await ctx.post('/api/cases/sell', payload);
        ctx.setBalance(r.balance);
        sfx.coin();
        toast(`${label}: ${r.sold} Skin${r.sold === 1 ? '' : 's'} für +${fmt(r.amount)} Chips`, 'ok');
        paintInventory();
      } catch (e) { toast(e.message, 'err'); }
    };
    sellSel.addEventListener('click', () => doSell({ ids: [...selected] }, 'Verkauft'));
    body.querySelector('.sell-all').addEventListener('click', async () => {
      if (!(await confirmDialog('Alles verkaufen?', `Alle ${inv.count} Skins für ${fmt(inv.total)} Chips verkaufen?`, 'Verkaufen', true))) return;
      doSell({ all: true }, 'Alles verkauft');
    });
  }

  function paintBody() {
    el.querySelectorAll('[data-t]').forEach((b) => b.classList.toggle('btn-gold', b.dataset.t === tab));
    paintPicker();
    if (tab === 'open') paintOpen(); else if (tab === 'inventory') paintInventory(); else paintBattles();
  }
  el.querySelectorAll('[data-t]').forEach((b) => b.addEventListener('click', () => {
    if (busy) return;
    tab = b.dataset.t;
    try { localStorage.setItem('casino.cases.tab', tab); } catch { /* egal */ }
    sfx.click();
    paintBody();
  }));
  paintBody();
  ctx.post('/api/cases/inventory').then((r) => setInvCount(r.count)).catch(() => {});
  return () => { alive = false; clearTimeout(timer); };
}

// ===================== Ein Battle =====================
export async function battle(root, ctx) {
  const info = await caseInfo(ctx);
  const id = new URLSearchParams(location.hash.split('?')[1] || '').get('id');
  let alive = true, timer = 0, offset = 0, shown = -1, data = null, finished = false;

  const el = h(`<div>
    <div class="page-head"><a class="back-link" href="#/cases">← Cases</a><h1 class="bt-title">📦 Case Battle</h1></div>
    <div class="panel bt-head"></div>
    <div class="bt-cols"></div>
  </div>`);
  root.appendChild(el);
  const head = el.querySelector('.bt-head');
  const cols = el.querySelector('.bt-cols');

  function build(b) {
    cols.style.setProperty('--n', b.slots);
    cols.innerHTML = Array.from({ length: b.slots }, (_, i) => `<div class="bt-col" data-i="${i}">
      <div class="bt-player"></div><div class="reel-box vertical"></div><div class="bt-items"></div><div class="bt-total">0</div></div>`).join('');
  }

  function paintPlayers(b) {
    [...cols.children].forEach((col, i) => {
      const p = b.players[i];
      col.querySelector('.bt-player').innerHTML = p ? `<span class="avatar">${p.bot ? '🤖' : esc(p.name.slice(0, 1).toUpperCase())}</span><b>${esc(p.name)}</b>${p.me ? ' <span class="muted">(du)</span>' : ''}` : '<span class="muted">wartet auf Spieler …</span>';
      col.classList.toggle('me', !!p?.me);
    });
  }

  function paintHead(b, now) {
    let status = '';
    if (b.status === 'waiting') status = `Wartet auf Spieler (${b.players.length}/${b.slots})`;
    if (b.status === 'running') {
      const t = now - b.startAt;
      status = t < 0 ? `Start in ${Math.ceil(-t / 1000)} …` : `Runde ${Math.min(b.rounds, Math.floor(t / b.roundMs) + 1)} von ${b.rounds}`;
    }
    if (b.status === 'done') status = `Topf: <b class="gold">${fmt(b.pot)}</b> – Sieger: <b>${b.players.filter((p) => p.winner).map((p) => esc(p.name)).join(' & ')}</b>`;
    if (b.status === 'cancelled') status = 'Abgebrochen – Einsätze zurückgebucht.';
    el.querySelector('.bt-title').textContent = `📦 ${b.caseName} × ${b.rounds}`;
    head.innerHTML = `<div>${status}</div><div class="dh-info"><span>Einsatz pro Spieler: <b class="gold">${fmt(b.cost)}</b></span>
      ${b.status === 'waiting' && b.mine ? `<button class="btn btn-sm btn-green" data-a="bots">Mit Bots auffüllen & starten</button>` : ''}
      ${b.status === 'waiting' && !b.joined ? `<button class="btn btn-sm btn-gold" data-a="join">Beitreten (${fmt(b.cost)})</button>` : ''}</div>`;
    head.querySelectorAll('[data-a]').forEach((btn) => btn.addEventListener('click', async () => {
      try { const r = await ctx.post(`/api/cases/${btn.dataset.a}`, { id }); ctx.setBalance(r.balance); poll(); } catch (e) { toast(e.message, 'err'); }
    }));
  }

  async function playRound(b, r) {
    const c = info.cases.find((x) => x.id === b.caseId);
    const tasks = [...cols.children].map(async (col, i) => {
      const it = b.players[i]?.items[r];
      if (!it) return;
      await spin(col.querySelector('.reel-box'), c, info.rarities, it, { duration: Math.max(1500, b.roundMs - 1200), axis: 'y' });
      col.querySelector('.bt-items').insertAdjacentHTML('beforeend', itemCard(it, info.rarities, 'small pop'));
      const total = b.players[i].items.slice(0, r + 1).reduce((a, x) => a + x.value, 0);
      col.querySelector('.bt-total').textContent = fmt(total);
    });
    await Promise.all(tasks);
  }

  function finish(b) {
    if (finished) return;
    finished = true;
    [...cols.children].forEach((col, i) => {
      const p = b.players[i];
      col.classList.toggle('winner', !!p?.winner);
      col.classList.toggle('loser', p && !p.winner);
      col.querySelector('.bt-total').textContent = fmt(p?.total ?? 0);
    });
    const me = b.players.find((p) => p.me);
    if (me?.winner) { sfx.bigWin(); confetti(); } else if (me) sfx.lose();
    ctx.refreshMe();
  }

  async function poll() {
    if (!alive) return;
    try {
      const b = await ctx.post('/api/cases/get', { id });
      offset = b.now - Date.now();
      if (!data) build(b);
      data = b;
      paintPlayers(b);
      paintHead(b, Date.now() + offset);
      if (b.status === 'running' || b.status === 'done') {
        const now = Date.now() + offset;
        const target = b.status === 'done' ? b.rounds - 1 : Math.min(b.rounds - 1, Math.floor((now - b.startAt) / b.roundMs));
        // Bei "Ansehen" eines fertigen Battles: alles sofort zeigen statt animieren
        if (b.status === 'done' && shown < 0) {
          [...cols.children].forEach((col, i) => {
            col.querySelector('.bt-items').innerHTML = (b.players[i]?.items || []).map((it) => itemCard(it, info.rarities, 'small')).join('');
          });
          shown = b.rounds - 1;
        }
        while (shown < target && alive) {
          shown++;
          await playRound(b, shown);
        }
        if (b.status === 'done') finish(b);
      }
    } catch (e) {
      cols.innerHTML = `<div class="panel"><p class="neg">${esc(e.message)}</p></div>`;
      return;
    }
    timer = setTimeout(poll, data?.status === 'done' ? 5000 : 700);
  }
  await poll();
  return () => { alive = false; clearTimeout(timer); };
}
