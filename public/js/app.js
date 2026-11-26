// Haupt-App: Profile, Guthaben-Anzeige, Navigation, Seitenwechsel.
import { get, post, session } from './api.js';
import { sfx } from './sound.js';
import { h, esc, fmt, toast, modal, betControl, confetti } from './ui.js';
import * as pages from './pages.js';
import { betsPanel } from './bets.js';
import { initChat } from './chatui.js';
import { resyncPush } from './push.js';
import { initUpdateCheck } from './update.js';

export const CATS = [
  { id: 'live', name: 'Live & Multiplayer', icon: '🟢' },
  { id: 'originals', name: 'Originals', icon: '⚡' },
  { id: 'table', name: 'Tisch & Karten', icon: '🃏' },
  { id: 'lotto', name: 'Slots & Lotto', icon: '🎰' },
];

export const GAMES = [
  { id: 'livecrash', cat: 'live', name: 'Live-Crash', icon: '🚀', desc: 'Eine Rakete für alle – wer steigt zuletzt aus?', tag: 'LIVE', a: '#7a1f3d', b: '#2a0614', hot: true },
  { id: 'liveroulette', cat: 'live', name: 'Live-Roulette', icon: '🎡', desc: 'Ein Rad, alle Spieler, eine Kugel', tag: 'LIVE', a: '#7a1f1f', b: '#2a0606', hot: true },
  { id: 'jackpot', cat: 'live', name: 'Jackpot', icon: '💰', desc: 'Alle zahlen ein – einer gewinnt alles', tag: 'LIVE', a: '#7a5c0f', b: '#2a1e04', hot: true },
  { id: 'bjtable', cat: 'live', name: 'Blackjack-Tisch', icon: '♠️', desc: 'Bis zu 5 Spieler gegen einen Dealer', tag: 'MULTI', a: '#0f5132', b: '#04200f', hot: true },
  { id: 'holdem', cat: 'live', name: "Texas Hold'em", icon: '♣️', desc: 'Poker gegen deine Freunde – bis zu 6 am Tisch', tag: 'MULTI', a: '#1a3d6b', b: '#07142a', hot: true },
  { id: 'crash', cat: 'originals', name: 'Crash', icon: '🚀', desc: 'Steig aus, bevor es kracht', tag: 'Nervenkitzel', a: '#3b1d5c', b: '#12081f', hot: true },
  { id: 'mines', cat: 'originals', name: 'Mines', icon: '💣', desc: 'Finde Diamanten, meide Minen', tag: 'Taktik', a: '#1d4a4f', b: '#071a1c', hot: true },
  { id: 'plinko', cat: 'originals', name: 'Plinko', icon: '🎯', desc: 'Kugeln fallen lassen, Multiplikator fangen', tag: 'Glück', a: '#5c3a1a', b: '#1f1208', hot: true },
  { id: 'dice', cat: 'originals', name: 'Würfel', icon: '🎲', desc: 'Über oder unter – du bestimmst die Chance', tag: 'Schnell', a: '#2f4f1d', b: '#0e1a08' },
  { id: 'limbo', cat: 'originals', name: 'Limbo', icon: '📈', desc: 'Wähle dein Ziel – liegt das Ergebnis drüber?', tag: 'Schnell', a: '#1d5c3a', b: '#081f12' },
  { id: 'tower', cat: 'originals', name: 'Turm', icon: '🗼', desc: 'Stockwerk für Stockwerk – meide die Fallen', tag: 'Taktik', a: '#3a3f5c', b: '#10121f' },
  { id: 'hilo', cat: 'originals', name: 'Hi-Lo', icon: '↕️', desc: 'Nächste Karte höher oder niedriger?', tag: 'Karten', a: '#1a4f4a', b: '#081f1c' },
  { id: 'coinflip', cat: 'originals', name: 'Münzwurf', icon: '🪙', desc: 'Kopf oder Zahl – baue eine Serie auf', tag: 'Serie', a: '#5c4a1a', b: '#1f1808' },
  { id: 'cups', cat: 'originals', name: 'Hütchenspiel', icon: '🥤', desc: 'Wo ist die Kugel?', tag: 'Glück', a: '#4a3a1d', b: '#1a1308' },
  { id: 'rps', cat: 'originals', name: 'Schere-Stein-Papier', icon: '✌️', desc: 'Gegen das Haus – Sieg zahlt 1,97×', tag: 'Schnell', a: '#1d4a5c', b: '#08191f' },
  { id: 'blackjack', cat: 'table', name: 'Blackjack', icon: '🃏', desc: 'Schlag den Dealer – Blackjack zahlt 3:2', tag: 'Karten', a: '#0f5132', b: '#06261a', hot: true },
  { id: 'roulette', cat: 'table', name: 'Roulette', icon: '🎡', desc: 'Europäisch mit einer Null', tag: 'Tisch', a: '#5c1a1d', b: '#1f0809', hot: true },
  { id: 'baccarat', cat: 'table', name: 'Baccarat', icon: '🎴', desc: 'Spieler oder Bank – wer kommt näher an 9?', tag: 'Karten', a: '#5c1a3f', b: '#1f0814' },
  { id: 'poker', cat: 'table', name: 'Video Poker', icon: '♠️', desc: 'Jacks or Better', tag: 'Karten', a: '#1b2f5c', b: '#08101f' },
  { id: 'threecard', cat: 'table', name: 'Drei-Karten-Poker', icon: '🂠', desc: 'Ante, Paar-Plus und Dealer-Duell', tag: 'Karten', a: '#2e1a5c', b: '#0e081f' },
  { id: 'craps', cat: 'table', name: 'Craps', icon: '🎲', desc: 'Pass Line, Field & Co. – der Würfeltisch', tag: 'Würfel', a: '#1f5c3a', b: '#08200f' },
  { id: 'sicbo', cat: 'table', name: 'Sic Bo', icon: '🀄', desc: 'Drei Würfel, viele Wetten', tag: 'Würfel', a: '#5c1a2e', b: '#1f0810' },
  { id: 'dragontiger', cat: 'table', name: 'Drache & Tiger', icon: '🐉', desc: 'Eine Karte, ein Duell, schnell entschieden', tag: 'Karten', a: '#5c3a0a', b: '#1f1303' },
  { id: 'war', cat: 'table', name: 'Kartenkrieg', icon: '⚔️', desc: 'Höhere Karte gewinnt – oder Krieg!', tag: 'Karten', a: '#5c2a1a', b: '#1f0d08' },
  { id: 'reddog', cat: 'table', name: 'Red Dog', icon: '🐕', desc: 'Fällt die dritte Karte dazwischen?', tag: 'Karten', a: '#5c1a1a', b: '#1f0808' },
  { id: 'slots', cat: 'lotto', name: 'Slots', icon: '🎰', desc: '5 Walzen, 10 Gewinnlinien', tag: 'Klassiker', a: '#5a3d06', b: '#1d1402', hot: true },
  { id: 'wheel', cat: 'lotto', name: 'Glücksrad', icon: '🍀', desc: 'Dreh das Rad – Risiko frei wählbar', tag: 'Glück', a: '#5c4a0a', b: '#1f1903' },
  { id: 'keno', cat: 'lotto', name: 'Keno', icon: '🔢', desc: 'Bis zu 10 Zahlen tippen, 10 werden gezogen', tag: 'Lotto', a: '#1d3f5c', b: '#08141f' },
  { id: 'bingo', cat: 'lotto', name: 'Schnell-Bingo', icon: '🔵', desc: '40 Kugeln – wie viele Linien schaffst du?', tag: 'Lotto', a: '#1b4f8a', b: '#081a30' },
  { id: 'scratch', cat: 'lotto', name: 'Rubbellos', icon: '🎟️', desc: 'Freirubbeln, 3 gleiche gewinnen', tag: 'Los', a: '#4a1d5c', b: '#16081f' },
  { id: 'horses', cat: 'lotto', name: 'Pferderennen', icon: '🏇', desc: 'Setz auf Favorit oder Außenseiter', tag: 'Rennen', a: '#2f5a2a', b: '#0e1f0b' },
];

// ---------- Favoriten & zuletzt gespielt (pro Gerät) ----------
const readList = (k) => { try { return JSON.parse(localStorage.getItem(k)) || []; } catch { return []; } };
const writeList = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* egal */ } };
export const favorites = {
  list: () => readList('casino.favs'),
  has: (id) => readList('casino.favs').includes(id),
  toggle(id) { const l = readList('casino.favs'); const i = l.indexOf(id); if (i >= 0) l.splice(i, 1); else l.unshift(id); writeList('casino.favs', l); return i < 0; },
};
export const recent = {
  list: () => readList('casino.recent'),
  add(id) { const l = readList('casino.recent').filter((x) => x !== id); l.unshift(id); writeList('casino.recent', l.slice(0, 12)); },
};
const state = { me: null, balance: 0, shownBalance: 0, cleanup: null, route: null };

// ---------- Guthaben-Anzeige ----------
const balEl = document.getElementById('balance');
const balBox = document.getElementById('balanceBox');
let balAnim = null;

export function getBalance() {
  return state.balance;
}

/** Setzt das angezeigte Guthaben (mit Zähl-Animation) */
export function setBalance(n) {
  const from = state.shownBalance;
  state.balance = n;
  if (state.me) state.me.balance = n;
  cancelAnimationFrame(balAnim);
  if (n !== from) {
    balBox.classList.remove('bump-up', 'bump-down');
    void balBox.offsetWidth;
    balBox.classList.add(n > from ? 'bump-up' : 'bump-down');
  }
  const t0 = performance.now();
  const dur = Math.min(900, 250 + Math.abs(n - from) / 20);
  const step = (t) => {
    const k = Math.min(1, (t - t0) / dur);
    const e = 1 - (1 - k) ** 3;
    state.shownBalance = Math.round(from + (n - from) * e);
    balEl.textContent = fmt(state.shownBalance);
    if (k < 1) balAnim = requestAnimationFrame(step);
  };
  balAnim = requestAnimationFrame(step);
  // Hintergrund-Tabs führen keine Animationen aus – dort den Wert sofort anzeigen
  if (document.hidden) {
    cancelAnimationFrame(balAnim);
    state.shownBalance = n;
    balEl.textContent = fmt(n);
  }
  updateBanner();
}

// ---------- Profil ----------
let pushSyncedFor = null;
async function loadMe() {
  if (!session.token) return null;
  try {
    state.me = await get('/api/me');
    document.getElementById('profileName').textContent = state.me.name;
    document.getElementById('profileAvatar').textContent = state.me.name.slice(0, 1).toUpperCase();
    setBalance(state.me.balance);
    if (pushSyncedFor !== state.me.name) { pushSyncedFor = state.me.name; resyncPush(); }
    return state.me;
  } catch (e) {
    if (e.status === 401) { session.set(''); state.me = null; return null; }
    throw e;
  }
}

export async function refreshMe() {
  await loadMe();
}

export const server = { online: false, lan: false, requirePassword: false };

/** Anmelden bzw. Profil wechseln */
export async function openProfilePicker(force = false) {
  const list = await get('/api/profiles').catch(() => []);
  const needPw = server.requirePassword;
  const el = h(`<div>
    <h2>${force ? 'Willkommen im Spaß-Casino! 🎰' : 'Profil wechseln'}</h2>
    <p class="muted" style="margin:0">${server.online
      ? 'Online-Casino mit Spielgeld. Melde dich mit Name und Passwort an oder leg ein neues Profil an.'
      : 'Nur Spielgeld. Jedes Profil startet mit 10.000 Chips.'}</p>
    <div class="profile-list">${list.length ? list.map((p) => `
      <button class="profile-item ${state.me && p.name === state.me.name ? 'current' : ''}" data-name="${esc(p.name)}" data-pw="${p.hasPassword ? 1 : 0}">
        <span class="avatar">${esc(p.name.slice(0, 1).toUpperCase())}</span>
        <span class="pname">${esc(p.name)}${p.hasPassword ? ' <span title="mit Passwort">🔒</span>' : ''}</span><span class="pbal">${fmt(p.balance)}</span>
      </button>`).join('') : '<p class="muted">Noch keine Profile – leg eins an:</p>'}</div>
    <form class="auth-form hidden" id="loginForm">
      <h3>Anmelden als <span class="gold login-name"></span></h3>
      <input type="hidden" name="name">
      <div class="row"><input class="input" name="password" type="password" placeholder="Passwort" autocomplete="current-password" required>
      <button class="btn btn-gold" type="submit">Anmelden</button></div>
    </form>
    <form class="auth-form" id="newProfile">
      <h3>Neues Profil</h3>
      <input class="input" name="name" maxlength="20" placeholder="Name" autocomplete="username" required>
      <input class="input" name="password" type="password" maxlength="100" autocomplete="new-password"
        placeholder="${needPw ? 'Passwort (mind. 4 Zeichen)' : 'Passwort (optional)'}" ${needPw ? 'required minlength="4"' : ''}>
      <button class="btn btn-gold" type="submit">Profil anlegen</button>
    </form></div>`);
  const close = modal(el, { closable: !force || !!state.me });
  const loginForm = el.querySelector('#loginForm');

  async function finishLogin(r, greeting) {
    if (state.me && session.token) post('/api/me/logout').catch(() => {});
    session.set(r.token);
    close();
    await loadMe();
    sfx.coin();
    if (greeting) toast(greeting, 'ok');
    rerender();
  }

  el.querySelectorAll('[data-name]').forEach((b) => b.addEventListener('click', async () => {
    sfx.click();
    const name = b.dataset.name;
    if (b.dataset.pw === '1' || needPw) {
      loginForm.classList.remove('hidden');
      loginForm.name.value = name;
      loginForm.querySelector('.login-name').textContent = name;
      loginForm.password.value = '';
      loginForm.password.focus();
      return;
    }
    try { await finishLogin(await post('/api/login', { name })); } catch (err) { toast(err.message, 'err'); }
  }));
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await finishLogin(await post('/api/login', { name: loginForm.name.value, password: loginForm.password.value }));
    } catch (err) { toast(err.message, 'err'); loginForm.password.select(); }
  });
  el.querySelector('#newProfile').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const r = await post('/api/profiles', { name: e.target.name.value, password: e.target.password.value });
      await finishLogin(r, `Hallo ${r.name}! Du startest mit ${fmt(r.balance)} Chips.`);
    } catch (err) { toast(err.message, 'err'); }
  });
  setTimeout(() => el.querySelector('#newProfile input')?.focus(), 50);
}

/** Abmelden (dieses Gerät) */
export async function logout() {
  try { await post('/api/me/logout'); } catch { /* egal */ }
  session.set('');
  state.me = null;
  location.hash = '#/';
  openProfilePicker(true);
}

// ---------- Banner: Tagesbonus & Nachfüllen ----------
const banner = document.getElementById('banner');
let bannerTimer = null;
function updateBanner() {
  const me = state.me;
  clearTimeout(bannerTimer);
  if (!me) return banner.classList.add('hidden');
  const parts = [];
  if (me.daily?.available) {
    const d = me.daily;
    const serie = d.nextDay > 1 ? ` · 🔥 Tag ${d.nextDay} in Folge` : '';
    parts.push(`<span>🎁 Dein Tagesbonus wartet: <b class="gold">+${fmt(d.amount)} Chips</b>${serie}</span>
      <button class="btn btn-gold btn-sm" data-act="daily">Abholen</button>`);
  }
  if (state.balance < (me.refill?.threshold ?? 100)) {
    const wait = (me.refill?.nextAt ?? 0) - Date.now();
    if (wait <= 0) {
      parts.push(`<span>💸 Fast pleite? </span><button class="btn btn-green btn-sm" data-act="refill">Nachfüllen (+${fmt(me.refill?.amount ?? 5000)})</button>`);
    } else {
      const m = Math.floor(wait / 60000), s = Math.floor((wait % 60000) / 1000);
      parts.push(`<span>⏳ Nachfüllen wieder möglich in <b>${m}:${String(s).padStart(2, '0')}</b> Min.</span>`);
      bannerTimer = setTimeout(updateBanner, 1000);
    }
  }
  if (!parts.length) return banner.classList.add('hidden');
  banner.innerHTML = parts.join('<span class="muted">·</span>');
  banner.classList.remove('hidden');
  banner.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', async () => {
    try {
      const r = await post(`/api/me/${b.dataset.act}`);
      state.me = { ...state.me, ...r };
      setBalance(r.balance);
      sfx.bigWin();
      confetti(50);
      toast(`+${fmt(r.amount)} Chips gutgeschrieben!`, 'ok');
    } catch (e) { toast(e.message, 'err'); }
  }));
}

// ---------- Router ----------
const appEl = document.getElementById('app');
const gameCtx = {
  get, post, getBalance, setBalance, refreshMe, toast,
  bet: (opts) => betControl({ ...opts, getBalance }),
};

async function render() {
  const route = (location.hash.replace(/^#\/?/, '') || 'home').split('?')[0];
  state.route = route;
  document.body.classList.remove('side-open');
  if (state.cleanup) { try { state.cleanup(); } catch { /* egal */ } state.cleanup = null; }
  const cat = route === 'cat' ? new URLSearchParams(location.hash.split('?')[1] || '').get('c') : null;
  const game = GAMES.find((g) => g.id === route);
  const navKey = cat ? `cat-${cat}` : game ? `cat-${game.cat}` : route;
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === navKey));
  appEl.replaceChildren();
  window.scrollTo(0, 0);
  if (!state.me) return;

  try {
    if (game) {
      recent.add(game.id);
      const fav = favorites.has(game.id);
      const root = h(`<div>
        <div class="page-head"><a class="back-link" href="#/">← Lobby</a><h1>${game.icon} ${esc(game.name)}</h1>
          <button class="fav-btn ${fav ? 'on' : ''}" title="Favorit">${fav ? '★' : '☆'}</button></div>
        <div class="game-root"></div><div class="game-bets"></div></div>`);
      appEl.appendChild(root);
      const favBtn = root.querySelector('.fav-btn');
      favBtn.addEventListener('click', () => {
        const on = favorites.toggle(game.id);
        favBtn.classList.toggle('on', on);
        favBtn.textContent = on ? '★' : '☆';
        sfx.click();
        toast(on ? `${game.name} ist jetzt ein Favorit.` : 'Aus den Favoriten entfernt.');
      });
      const mod = await import(`./games/${game.id}.js`);
      if (state.route !== route) return; // inzwischen weiternavigiert
      const stop = (await mod.default(root.querySelector('.game-root'), gameCtx)) || null;
      const bets = betsPanel(gameCtx, { game: game.id, GAMES });
      root.querySelector('.game-bets').appendChild(bets.el);
      state.cleanup = () => { stop?.(); bets.cleanup(); };
    } else if (pages[route]) {
      state.cleanup = (await pages[route](appEl, { ...gameCtx, GAMES, CATS, favorites, recent, state, server, live, openProfilePicker, loadMe, logout, cat })) || null;
    } else {
      location.hash = '#/';
    }
  } catch (e) {
    console.error(e);
    appEl.appendChild(h(`<div class="panel"><h2>Ups.</h2><p class="muted">${esc(e.message)}</p></div>`));
  }
}
function rerender() { render(); }

// ---------- Start ----------
document.getElementById('profileBtn').addEventListener('click', () => openProfilePicker());
const toggleSide = () => document.body.classList.toggle('side-open');
document.getElementById('menuBtn').addEventListener('click', toggleSide);
document.getElementById('bottomMenu').addEventListener('click', toggleSide);
document.getElementById('sideBackdrop').addEventListener('click', () => document.body.classList.remove('side-open'));
// Kategorien in der Seitenleiste
document.getElementById('sideCats').innerHTML = '<div class="side-title">Spiele</div>' + CATS.map((c) =>
  `<a href="#/cat?c=${c.id}" data-nav="cat-${c.id}"><span class="si">${c.icon}</span><span>${esc(c.name)}</span><span class="side-count">${GAMES.filter((g) => g.cat === c.id).length}</span></a>`).join('');
// Suche: tippen → Lobby zeigt Treffer
const searchInput = document.getElementById('searchInput');
searchInput.addEventListener('input', () => {
  const q = searchInput.value.trim();
  const target = q ? `#/search?q=${encodeURIComponent(q)}` : '#/';
  if (location.hash !== target) history.replaceState(null, '', target);
  render();
});
searchInput.addEventListener('keydown', (e) => { if (e.key === 'Escape') { searchInput.value = ''; searchInput.dispatchEvent(new Event('input')); } });
const soundBtn = document.getElementById('soundToggle');
const paintSound = () => (soundBtn.textContent = sfx.enabled ? '🔊' : '🔇');
soundBtn.addEventListener('click', () => { sfx.setEnabled(!sfx.enabled); paintSound(); });
paintSound();
window.addEventListener('hashchange', render);

(async () => {
  try {
    Object.assign(server, await get('/api/server-info'));
  } catch { /* Server evtl. noch nicht da */ }
  try {
    await loadMe();
  } catch (e) {
    toast(e.message, 'err');
  }
  if (!state.me) await openProfilePicker(true);
  render();
  pollDuels();
  initChat({ setBalance });
  initUpdateCheck();
})();

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && state.shownBalance !== state.balance) {
    state.shownBalance = state.balance;
    balEl.textContent = fmt(state.balance);
  }
});

export const live = { online: [], feed: [] };

// ---------- Duell-Benachrichtigungen ----------
const seenChallenges = new Set();
let firstDuelPoll = true;
async function pollDuels() {
  try {
    if (state.me && document.visibilityState === 'visible') {
      // Lebenszeichen: zeigt den anderen, dass (und wo) du gerade spielst
      post('/api/live/ping', { where: state.route, notices: true }).then((l) => {
        live.online = l.online;
        live.feed = l.feed;
        const oc = document.getElementById('onlineCount');
        oc.textContent = l.online.length;
        oc.classList.toggle('hidden', !l.online.length);
        // Stufe neben dem Profilbild
        const lv = document.getElementById('profileLevel');
        if (lv && l.vip) { lv.textContent = l.vip.level; lv.style.background = l.vip.color; lv.title = `${l.vip.icon} ${l.vip.tier} – Stufe ${l.vip.level}`; }
        // Hinweise: Aufstieg, Aufgaben, Erfolge, Geschenke
        if (l.notices?.length) {
          for (const n of l.notices) toast(n.text, 'ok');
          if (l.notices.some((n) => ['level', 'weekly', 'chest'].includes(n.type))) { sfx.bigWin(); confetti(); } else sfx.coin();
          setBalance(l.balance);
        }
      }).catch(() => {});
      const r = await post('/api/duels/count');
      const n = r.incoming.length + r.waiting;
      const badge = document.getElementById('duelBadge');
      badge.textContent = n;
      badge.classList.toggle('hidden', !n);
      for (const c of r.incoming) {
        if (seenChallenges.has(c.id)) continue;
        seenChallenges.add(c.id);
        if (!firstDuelPoll) {
          sfx.coin();
          toast(`⚔️ ${c.from} fordert dich heraus: ${c.gameName} um ${fmt(c.stake)} Chips!`, 'ok');
        }
      }
      firstDuelPoll = false;
    }
  } catch { /* nächster Versuch */ }
  setTimeout(pollDuels, 6000);
}
