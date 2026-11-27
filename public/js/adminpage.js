// Admin-Bereich: Chips geben/abziehen/setzen, Profile zurücksetzen, Passwörter neu vergeben, Spieler löschen.
import { h, esc, fmt, fmtSigned, toast, confirmDialog, modal } from './ui.js';
import { sfx } from './sound.js';
import { apiFetch } from './api.js';

const signCls = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');
const ADMIN_KEY = 'casino.admin';
const adminToken = {
  get() { try { return sessionStorage.getItem(ADMIN_KEY) || ''; } catch { return ''; } },
  set(t) { try { if (t) sessionStorage.setItem(ADMIN_KEY, t); else sessionStorage.removeItem(ADMIN_KEY); } catch { /* egal */ } },
};

async function adminApi(method, url, body) {
  const res = await apiFetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Admin': adminToken.get() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = {};
  try { data = await res.json(); } catch { /* leer */ }
  if (!res.ok) throw Object.assign(new Error(data.error || `Fehler ${res.status}`), { status: res.status });
  return data;
}

export async function admin(root, ctx) {
  const wrap = h('<div><div class="page-head"><a class="back-link" href="#/settings">← Einstellungen</a><h1>🛠️ Admin-Bereich</h1></div><div class="admin-body"></div></div>');
  root.appendChild(wrap);
  const body = wrap.querySelector('.admin-body');
  let alive = true;

  async function show() {
    if (!alive) return;
    const st = await adminApi('GET', '/api/admin/status');
    if (st.loggedIn) return showPanel();
    if (st.canSetupHere) {
      body.innerHTML = `<div class="panel admin-auth">
        <h2>Admin-Passwort festlegen</h2>
        <p class="muted">Das ist der erste Besuch im Admin-Bereich. Leg ein Admin-Passwort fest (mind. 6 Zeichen). Nur wer es kennt, kann Chips verteilen.</p>
        <form class="auth-form" id="setupForm">
          <input class="input" name="pw" type="password" placeholder="Admin-Passwort" autocomplete="new-password" minlength="6" required>
          <input class="input" name="pw2" type="password" placeholder="Nochmal zur Bestätigung" autocomplete="new-password" minlength="6" required>
          <button class="btn btn-gold" type="submit">Festlegen</button>
        </form></div>`;
      body.querySelector('#setupForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        if (e.target.pw.value !== e.target.pw2.value) return toast('Die Passwörter stimmen nicht überein.', 'err');
        try {
          const r = await adminApi('POST', '/api/admin/setup', { password: e.target.pw.value });
          adminToken.set(r.token);
          toast('Admin-Passwort gespeichert.', 'ok');
          show();
        } catch (err) { toast(err.message, 'err'); }
      });
      return;
    }
    if (!st.isSet) {
      body.innerHTML = `<div class="panel admin-auth">
        <h2>Noch kein Admin-Passwort</h2>
        <p class="muted">Aus Sicherheitsgründen kann das Admin-Passwort hier nicht über Internet oder Heimnetz festgelegt werden.</p>
        <p><b>Im Codespace:</b> unten im Terminal eingeben: <code>npm run admin</code><br>
        <b>Am PC:</b> den Admin-Bereich direkt am PC öffnen (<code>http://127.0.0.1:3000</code>) oder <b>admin-passwort.bat</b> starten.</p>
        <button class="btn" id="again">Neu laden</button></div>`;
      body.querySelector('#again').addEventListener('click', show);
      return;
    }
    body.innerHTML = `<div class="panel admin-auth">
      <h2>Als Admin anmelden</h2>
      <form class="auth-form" id="adminLoginForm">
        <input class="input" name="pw" type="password" placeholder="Admin-Passwort" autocomplete="current-password" required>
        <button class="btn btn-gold" type="submit">Anmelden</button>
      </form></div>`;
    body.querySelector('#adminLoginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const r = await adminApi('POST', '/api/admin/login', { password: e.target.pw.value });
        adminToken.set(r.token);
        show();
      } catch (err) { toast(err.message, 'err'); e.target.pw.select(); }
    });
    setTimeout(() => body.querySelector('input')?.focus(), 50);
  }

  async function showPanel() {
    let players;
    try { players = await adminApi('GET', '/api/admin/players'); } catch (e) {
      if (e.status === 401) { adminToken.set(''); return show(); }
      throw e;
    }
    if (!alive) return;
    const when = (t) => (t ? new Date(t).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '–');
    body.innerHTML = `<div class="panel">
      <div class="row" style="justify-content:space-between;flex-wrap:wrap;margin-bottom:10px">
        <h2 style="margin:0">Spieler (${players.length})</h2>
        <button class="btn btn-sm" id="adminLogout">Admin abmelden</button>
      </div>
      <p class="muted" style="margin-top:0">Betrag eingeben, dann <b>+</b> (geben), <b>−</b> (abziehen) oder <b>=</b> (Guthaben genau auf diesen Wert setzen).</p>
      ${players.length ? `<div class="tbl-wrap"><table class="tbl admin-tbl">
        <thead><tr><th>Spieler</th><th class="num">Chips</th><th class="num">Gewinn/Verlust</th><th class="num">Runden</th><th>Zuletzt</th><th>Chips ändern</th><th>Weiteres</th></tr></thead>
        <tbody>${players.map((p) => `<tr data-name="${esc(p.name)}">
          <td><b>${esc(p.name)}</b>${p.hasPassword ? ' 🔒' : ''}</td>
          <td class="num gold"><b>${fmt(p.balance)}</b></td>
          <td class="num ${signCls(p.net)}">${fmtSigned(p.net)}</td>
          <td class="num">${fmt(p.rounds)}</td>
          <td class="muted">${when(p.lastPlayed)}</td>
          <td><div class="admin-adjust">
            <input class="input" type="number" inputmode="numeric" min="0" step="1" placeholder="Betrag" value="1000">
            <button class="btn btn-sm btn-green" data-a="add" title="Chips geben">+</button>
            <button class="btn btn-sm btn-red" data-a="sub" title="Chips abziehen">−</button>
            <button class="btn btn-sm" data-a="set" title="Guthaben genau setzen">=</button>
          </div></td>
          <td><div class="admin-more">
            <button class="btn btn-sm" data-a="pw">Passwort</button>
            <button class="btn btn-sm" data-a="stats" title="Gewinn/Verlust, Runden und Verlauf auf 0 – Guthaben bleibt">Statistik</button>
            <button class="btn btn-sm" data-a="reset">Zurücksetzen</button>
            <button class="btn btn-sm btn-ghost" data-a="del">Löschen</button>
          </div></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Noch keine Spieler.</p>'}
    </div>`;

    // ---------- Live-Kontrolle: zuschauen & eingreifen ----------
    body.insertAdjacentHTML('afterbegin', `<div class="panel watch-panel" style="margin-bottom:18px">
      <h2>🎮 Live-Kontrolle <span class="muted" style="font-size:.8rem;font-weight:500">(aktualisiert jede Sekunde · für Spieler unsichtbar)</span></h2>
      <p class="muted" style="margin-top:0;font-size:.85rem"><b>Glück/Pech</b> wirkt auf alle Sofort-Spiele (Slots, Roulette, Würfel, Plinko …) und auf Mines, Turm, Hi-Lo, Münzwurf und Crash. In laufenden Runden kannst du zusätzlich direkt eingreifen.</p>
      <div class="watch-list"></div></div>`);
    const watchList = body.querySelector('.watch-list');
    const RANKS = { 1: 'A', 11: 'B', 12: 'D', 13: 'K', 14: 'A' };
    const rk = (r) => RANKS[r] || String(r);
    const cardTxt = (c) => (c ? `<span class="wcard ${['♥', '♦'].includes(c.s) ? 'red' : ''}">${rk(c.r)}${c.s}</span>` : '');
    const ago = (t) => { const s = Math.round((Date.now() - t) / 1000); return s < 60 ? `${s} s` : `${Math.round(s / 60)} min`; };

    function roundHtml(name, r) {
      const n = esc(name);
      let inner = '';
      if (r.game === 'mines') {
        inner = `<div class="w-mines">${Array.from({ length: 25 }, (_, i) => {
          const rev = r.revealed.includes(i), mine = r.positions.includes(i);
          return `<button class="w-tile ${rev ? 'rev' : mine ? 'mine' : ''}" data-ctl="mines" data-name="${n}" data-index="${i}" ${rev ? 'disabled' : ''}>${rev ? '💎' : mine ? '💣' : ''}</button>`;
        }).join('')}</div><small class="muted">Klick auf ein verdecktes Feld = Mine setzen/entfernen</small>`;
      } else if (r.game === 'tower') {
        const cols = { easy: 4, medium: 3, hard: 2, expert: 3 }[r.mode];
        inner = `<div class="w-tower">${r.traps.map((row, lvl) => ({ row, lvl })).reverse().map(({ row, lvl }) => `<div class="w-trow ${lvl === r.picks.length ? 'cur' : ''}">${Array.from({ length: cols }, (_, c) => {
          const done = lvl < r.picks.length, trap = row.includes(c), picked = r.picks[lvl] === c;
          return `<button class="w-tile ${picked ? 'rev' : trap ? 'mine' : ''}" data-ctl="tower" data-name="${n}" data-level="${lvl}" data-col="${c}" ${done ? 'disabled' : ''}>${picked ? '⭐' : trap ? '💀' : ''}</button>`;
        }).join('')}</div>`).join('')}</div><small class="muted">Klick = Falle setzen/entfernen (nur offene Stockwerke)</small>`;
      } else if (r.game === 'crash') {
        inner = `<div class="kv"><span>Rakete</span><span><b>${r.multiplier.toFixed(2)}×</b> · Absturz bei <b class="gold">${r.crash.toFixed(2)}×</b>${r.auto ? ` · Auto ${r.auto}×` : ''}</span></div>
          <div class="row" style="flex-wrap:wrap"><button class="btn btn-sm btn-red" data-ctl="crash" data-action="now" data-name="${n}">💥 Jetzt crashen</button>
          <input class="input w-val" type="number" step="0.01" placeholder="z. B. 1,5" style="max-width:100px"><button class="btn btn-sm" data-ctl="crash" data-action="at" data-name="${n}">Crasht bei …</button></div>`;
      } else if (r.game === 'blackjack') {
        inner = `<div class="kv"><span>Spieler</span><span>${r.hands.map((hd) => hd.map(cardTxt).join('')).join(' | ')}</span></div>
          <div class="kv"><span>Dealer (inkl. verdeckt)</span><span>${r.dealer.map(cardTxt).join('')}</span></div>
          <div class="kv"><span>Vorgegebene nächste Karten</span><span>${r.forced.map(rk).join(', ') || '–'}</span></div>
          <div class="row" style="flex-wrap:wrap">${[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map((v) => `<button class="btn btn-sm" data-ctl="blackjack" data-name="${n}" data-rank="${v}">${rk(v)}</button>`).join('')}
          <button class="btn btn-sm btn-ghost" data-ctl="blackjack" data-action="clear" data-name="${n}">leeren</button></div>`;
      } else if (r.game === 'hilo') {
        inner = `<div class="kv"><span>Karten</span><span>${r.cards.map(cardTxt).join('')} · ${r.mult.toFixed(2)}×</span></div>`;
      } else if (r.game === 'coinflip') {
        inner = `<div class="kv"><span>Serie</span><span>${r.streak}</span></div>`;
      } else {
        const cards = r.hand || r.player || r.cards;
        inner = `<div class="kv"><span>Stand</span><span>${Array.isArray(cards) ? cards.map(cardTxt).join('') : ''}${r.dealer ? ' vs ' + [].concat(r.dealer).map(cardTxt).join('') : ''}${r.point ? ` · Point ${r.point}` : ''}</span></div>`;
      }
      return `<div class="w-round"><div class="w-rhead"><b>${esc(r.gameName)}</b><span class="gold">Einsatz ${fmt(r.bet)}</span></div>${inner}</div>`;
    }

    function playerHtml(p) {
      const n = esc(p.name);
      const nexts = Object.entries(p.next || {}).map(([k, v]) => `${k}: ${k === 'hilo' ? rk(v) : k === 'coinflip' ? (v === 'heads' ? 'Kopf' : 'Zahl') : v}`).join(' · ');
      return `<div class="w-player ${p.online ? 'on' : ''}" data-player="${n}">
        <div class="w-head"><span class="avatar">${esc(p.name.slice(0, 1).toUpperCase())}</span>
          <b>${n}</b><span class="muted">${p.online ? `🟢 ${esc(p.where || '')}` : 'offline'}</span>
          <span class="gold" style="margin-left:auto">${fmt(p.balance)}</span></div>
        <div class="seg w-luck">${[['normal', 'Normal'], ['lose', '😈 Pech'], ['win', '🍀 Glück']].map(([v, l]) => `<button data-luck="${v}" data-name="${n}" class="${p.luck === v ? 'on' : ''}">${l}</button>`).join('')}</div>
        ${p.luck !== 'normal' ? `<div class="w-strength"><span class="muted">Stärke:</span><div class="seg">${[[25, 'leicht'], [50, 'mittel'], [75, 'stark'], [100, 'immer']].map(([v, l]) => `<button data-strength="${v}" data-mode="${p.luck}" data-name="${n}" class="${p.strength === v ? 'on' : ''}" title="greift in ca. ${v} % der Runden">${l}</button>`).join('')}</div>
          <small class="muted">${p.strength >= 100 ? (p.luck === 'win' ? 'Gewinnt praktisch jede Runde' : 'Verliert praktisch jede Runde') : `greift in ca. ${p.strength} % der Runden – sonst normaler Zufall`}</small></div>` : ''}
        ${p.rounds.map((r) => roundHtml(p.name, r)).join('')}
        <details class="w-next"><summary>Nächsten Zug vorgeben${nexts ? ` <span class="gold">(${esc(nexts)})</span>` : ''}</summary>
          <div class="row" style="flex-wrap:wrap;margin-top:6px"><span class="muted">Crash:</span><input class="input w-val" type="number" step="0.01" placeholder="1,00" style="max-width:90px"><button class="btn btn-sm" data-ctl="crash" data-action="next" data-name="${n}">nächste Runde</button></div>
          <div class="row" style="flex-wrap:wrap;margin-top:6px"><span class="muted">Hi-Lo:</span>${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((v) => `<button class="btn btn-sm" data-ctl="hilo" data-name="${n}" data-rank="${v}">${rk(v)}</button>`).join('')}</div>
          <div class="row" style="margin-top:6px"><span class="muted">Münzwurf:</span><button class="btn btn-sm" data-ctl="coinflip" data-name="${n}" data-result="heads">👑 Kopf</button><button class="btn btn-sm" data-ctl="coinflip" data-name="${n}" data-result="tails">⭐ Zahl</button>
          ${nexts ? `<button class="btn btn-sm btn-ghost" data-ctl="any" data-action="clearNext" data-name="${n}">Vorgaben löschen</button>` : ''}</div>
        </details>
        ${p.recent.length ? `<div class="w-recent">${p.recent.map((h) => `<span class="${h.payout > h.bet ? 'pos' : h.payout < h.bet ? 'neg' : ''}" title="${esc(h.detail)}">${esc(h.game)} ${h.payout - h.bet >= 0 ? '+' : '−'}${fmt(Math.abs(h.payout - h.bet))} <small class="muted">${ago(h.time)}</small></span>`).join('')}</div>` : ''}
      </div>`;
    }

    let openDetails = new Set();
    async function watchLoop() {
      if (!alive || !body.contains(watchList)) return;
      // Nicht neu zeichnen, während in ein Feld getippt wird
      const typing = watchList.contains(document.activeElement) && document.activeElement.tagName === 'INPUT';
      if (!typing) {
        try {
          const w = await adminApi('GET', '/api/admin/watch');
          openDetails = new Set([...watchList.querySelectorAll('details[open]')].map((d) => d.closest('[data-player]').dataset.player));
          watchList.innerHTML = w.players.map(playerHtml).join('') || '<p class="muted">Noch keine Spieler.</p>';
          openDetails.forEach((n) => watchList.querySelector(`[data-player="${CSS.escape(n)}"] details`)?.setAttribute('open', ''));
        } catch { /* nächster Versuch */ }
      }
      setTimeout(watchLoop, 1000);
    }
    watchList.addEventListener('click', async (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      try {
        if (b.dataset.luck) {
          await adminApi('POST', '/api/admin/luck', { name: b.dataset.name, mode: b.dataset.luck });
        } else if (b.dataset.strength) {
          await adminApi('POST', '/api/admin/luck', { name: b.dataset.name, mode: b.dataset.mode, strength: Number(b.dataset.strength) });
        } else if (b.dataset.ctl) {
          const val = b.parentElement.querySelector('.w-val');
          await adminApi('POST', '/api/admin/control', {
            name: b.dataset.name, game: b.dataset.ctl, action: b.dataset.action,
            index: b.dataset.index !== undefined ? Number(b.dataset.index) : undefined,
            level: b.dataset.level !== undefined ? Number(b.dataset.level) : undefined,
            col: b.dataset.col !== undefined ? Number(b.dataset.col) : undefined,
            rank: b.dataset.rank !== undefined ? Number(b.dataset.rank) : undefined,
            result: b.dataset.result,
            value: val ? Number(String(val.value).replace(',', '.')) : undefined,
          });
        } else return;
        sfx.click();
        if (document.activeElement) document.activeElement.blur();
      } catch (err) { toast(err.message, 'err'); }
    });
    watchLoop();

    // ---------- Live-Crash steuern + Online-Liste ----------
    body.insertAdjacentHTML('beforeend', `<div class="panel section lc-admin">
      <h2>🚀 Live-Crash steuern <span class="muted" style="font-size:.8rem;font-weight:500">(für Spieler unsichtbar)</span></h2>
      <div class="lca-state"></div>
      <div class="row" style="flex-wrap:wrap;margin-top:10px">
        <button class="btn btn-red" data-rig="now">💥 Jetzt crashen</button>
        <input class="input lca-val" type="number" step="0.01" min="1" placeholder="z. B. 1,50" style="max-width:130px">
        <button class="btn" data-rig="current">Diese Runde crasht bei …</button>
        <button class="btn" data-rig="next">Nächste Runde crasht bei …</button>
        <button class="btn btn-ghost" data-rig="clear">Vorgabe löschen</button>
      </div>
      <p class="muted" style="margin:8px 0 0;font-size:.8rem">„Diese Runde“ geht nur, solange die Rakete noch unter dem Wert ist. 1,00 = sofortiger Absturz beim Start.</p>
    </div>
    <div class="panel section lr-admin">
      <h2>🎡 Live-Roulette & 💰 Jackpot steuern</h2>
      <div class="lra-state muted"></div>
      <div class="row" style="flex-wrap:wrap;margin-top:8px">
        <span>Live-Roulette – nächste Zahl:</span><input class="input lra-num" type="number" min="0" max="36" style="max-width:90px">
        <button class="btn btn-sm" data-lr="set">Vorgeben</button><button class="btn btn-sm btn-ghost" data-lr="clear">löschen</button>
      </div>
      <div class="row" style="flex-wrap:wrap;margin-top:8px">
        <span>Jackpot – nächster Gewinner:</span><input class="input jpa-name" placeholder="Name" style="max-width:160px">
        <button class="btn btn-sm" data-jp="set">Vorgeben</button><button class="btn btn-sm btn-ghost" data-jp="clear">löschen</button>
      </div>
      <p class="muted" style="margin:8px 0 0;font-size:.8rem">Der Jackpot-Gewinner muss in der Runde eingezahlt haben, sonst wird normal gezogen.</p>
    </div>
    <div class="panel section"><h2>🟢 Gerade online</h2><div class="lca-online"></div></div>`);
    const lraState = body.querySelector('.lra-state');
    const lrLoop = async () => {
      if (!alive || !body.contains(lraState)) return;
      try {
        const r = await adminApi('GET', '/api/admin/liveroulette');
        const j = await adminApi('GET', '/api/admin/jackpot');
        lraState.innerHTML = `Roulette: ${r.phase === 'betting' ? 'Wettphase' : r.phase === 'spinning' ? 'dreht' : 'Ergebnis'} · echte Zahl: <b class="gold">${r.realNumber ?? '–'}</b>${r.rigged ? ' (manipuliert)' : ''} · Vorgabe: ${r.nextRig ?? 'keine'} · ${r.players.length} Spieler<br>
          Jackpot: Topf <b class="gold">${fmt(j.pot)}</b> · ${j.entries.map((e) => `${esc(e.name)} ${(e.chance * 100).toFixed(0)} %`).join(', ') || 'leer'} · Vorgabe: ${j.nextRig ? esc(j.nextRig) : 'keine'}`;
      } catch { /* egal */ }
      setTimeout(lrLoop, 1500);
    };
    lrLoop();
    body.querySelectorAll('[data-lr]').forEach((b) => b.addEventListener('click', async () => {
      try { await adminApi('POST', '/api/admin/liveroulette/rig', b.dataset.lr === 'clear' ? { clear: true } : { number: Number(body.querySelector('.lra-num').value) }); toast('Erledigt.', 'ok'); } catch (e) { toast(e.message, 'err'); }
    }));
    body.querySelectorAll('[data-jp]').forEach((b) => b.addEventListener('click', async () => {
      try { await adminApi('POST', '/api/admin/jackpot/rig', b.dataset.jp === 'clear' ? { clear: true } : { name: body.querySelector('.jpa-name').value }); toast('Erledigt.', 'ok'); } catch (e) { toast(e.message, 'err'); }
    }));
    const lcaState = body.querySelector('.lca-state');
    const lcaOnline = body.querySelector('.lca-online');
    const paintLc = (s) => {
      const phase = { betting: `Wettphase (${Math.ceil(s.timeLeft / 1000)} s)`, running: `fliegt – <b>${s.multiplier.toFixed(2)}×</b>`, crashed: `abgestürzt bei ${s.crashPoint?.toFixed(2)}×` }[s.phase];
      lcaState.innerHTML = `<div class="kv"><span>Runde</span><span>${phase}</span></div>
        <div class="kv"><span>Echter Absturzpunkt</span><span class="gold">${s.realCrashPoint ? s.realCrashPoint.toFixed(2) + '×' : '– (wird beim Start ausgelost)'}${s.rigged ? ' · <span class="neg">manipuliert</span>' : ''}</span></div>
        <div class="kv"><span>Vorgabe nächste Runde</span><span>${s.nextRig ? s.nextRig.toFixed(2) + '×' : 'keine (Zufall)'}</span></div>
        <div class="kv"><span>Einsätze</span><span>${s.bets.length ? s.bets.map((b) => `${esc(b.name)} ${fmt(b.bet)}${b.cashedAt ? ` ✓${b.cashedAt.toFixed(2)}×` : ''}`).join(' · ') : 'keine'}</span></div>`;
    };
    const lcLoop = async () => {
      if (!alive || !body.contains(lcaState)) return;
      try {
        paintLc(await adminApi('GET', '/api/admin/livecrash'));
        const o = await adminApi('GET', '/api/admin/online');
        lcaOnline.innerHTML = o.online.map((x) => `<div class="kv"><span>${esc(x.name)}</span><span>${esc(x.where)}</span></div>`).join('') || '<p class="muted" style="margin:0">Niemand.</p>';
      } catch { /* egal */ }
      setTimeout(lcLoop, 1000);
    };
    lcLoop();
    body.querySelectorAll('[data-rig]').forEach((b) => b.addEventListener('click', async () => {
      try {
        const value = Number(String(body.querySelector('.lca-val').value).replace(',', '.'));
        paintLc(await adminApi('POST', '/api/admin/livecrash/rig', { mode: b.dataset.rig, value }));
        toast('Erledigt.', 'ok');
      } catch (e) { toast(e.message, 'err'); }
    }));

    // ---------- Feedback der Spieler ----------
    body.insertAdjacentHTML('beforeend', `<div class="panel section fb-admin"><h2>💬 Feedback</h2><div class="fb-list"></div></div>`);
    const fbList = body.querySelector('.fb-list');
    const KIND = { idee: '💡 Idee', fehler: '🐞 Fehler', sonstiges: '💬 Sonstiges' };
    function paintFb(items) {
      const unread = items.filter((f) => !f.read).length;
      body.querySelector('.fb-admin h2').textContent = `💬 Feedback (${items.length}${unread ? `, ${unread} neu` : ''})`;
      fbList.innerHTML = items.map((f) => `<div class="fb-item" data-id="${esc(f.id)}" style="padding:10px 0;border-top:1px solid rgba(255,255,255,.08);${f.read ? 'opacity:.6' : ''}">
          <div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:6px">
            <span>${f.read ? '' : '🟡 '}<b>${esc(f.name)}</b> · ${KIND[f.kind] || esc(f.kind)} · <span class="muted">${when(f.at)}</span></span>
            <span class="row" style="gap:6px"><button class="btn btn-sm" data-fb="read">${f.read ? 'Als neu markieren' : 'Gelesen'}</button><button class="btn btn-sm btn-ghost" data-fb="delete">Löschen</button></span>
          </div>
          <div style="white-space:pre-wrap;margin-top:6px;overflow-wrap:anywhere">${esc(f.text)}</div>
        </div>`).join('') || '<p class="muted" style="margin:0">Noch kein Feedback.</p>';
    }
    adminApi('GET', '/api/admin/feedback').then(paintFb).catch((e) => { fbList.textContent = e.message; });
    fbList.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-fb]');
      if (!b) return;
      const id = b.closest('.fb-item').dataset.id;
      if (b.dataset.fb === 'delete' && !(await confirmDialog('Feedback löschen?', 'Der Eintrag wird endgültig gelöscht.', 'Löschen', true))) return;
      try { paintFb(await adminApi('POST', `/api/admin/feedback/${b.dataset.fb}`, { id })); } catch (err) { toast(err.message, 'err'); }
    });

    body.querySelector('#adminLogout').addEventListener('click', async () => {
      try { await adminApi('POST', '/api/admin/logout'); } catch { /* egal */ }
      adminToken.set('');
      show();
    });

    body.querySelectorAll('tr[data-name]').forEach((tr) => {
      const name = tr.dataset.name;
      const input = tr.querySelector('input');
      const done = async (msg) => {
        toast(msg, 'ok');
        sfx.coin();
        if (ctx.state.me && ctx.state.me.name === name) await ctx.refreshMe();
        showPanel();
      };
      const run = async (fn) => {
        try { await fn(); } catch (e) {
          if (e.status === 401) { adminToken.set(''); show(); }
          toast(e.message, 'err');
        }
      };

      tr.querySelectorAll('.admin-adjust button').forEach((b) => b.addEventListener('click', () => run(async () => {
        const raw = String(input.value).trim();
        const n = Math.floor(Number(raw));
        if (!raw || !Number.isFinite(n) || n < 0) throw new Error('Bitte einen Betrag eingeben.');
        const a = b.dataset.a;
        const r = await adminApi('POST', '/api/admin/adjust', { name, mode: a === 'set' ? 'set' : 'add', amount: a === 'sub' ? -n : n });
        await done(`${name}: ${fmt(r.before)} → ${fmt(r.balance)} Chips`);
      })));

      tr.querySelector('[data-a="stats"]').addEventListener('click', () => run(async () => {
        if (!(await confirmDialog('Statistik zurücksetzen?', `Gewinn/Verlust, Runden, größter Gewinn, Verlauf und Wochenwertung von ${name} werden auf 0 gesetzt. Guthaben, Stufe und Erfolge bleiben.`, 'Statistik zurücksetzen', true))) return;
        await adminApi('POST', '/api/admin/reset-stats', { name });
        await done(`Statistik von ${name} wurde zurückgesetzt.`);
      }));

      tr.querySelector('[data-a="reset"]').addEventListener('click', () => run(async () => {
        if (!(await confirmDialog('Profil zurücksetzen?', `${name} bekommt wieder 10.000 Chips, Statistik und Verlauf werden gelöscht.`, 'Zurücksetzen', true))) return;
        await adminApi('POST', '/api/admin/reset', { name });
        await done(`${name} wurde zurückgesetzt.`);
      }));

      tr.querySelector('[data-a="del"]').addEventListener('click', () => run(async () => {
        if (!(await confirmDialog('Spieler löschen?', `${name} wird endgültig gelöscht – samt Guthaben und Statistik.`, 'Löschen', true))) return;
        await adminApi('POST', '/api/admin/delete', { name });
        await done(`${name} wurde gelöscht.`);
      }));

      tr.querySelector('[data-a="pw"]').addEventListener('click', () => {
        const form = h(`<form class="auth-form" style="margin:0">
          <h2>Neues Passwort für ${esc(name)}</h2>
          <p class="muted" style="margin:0">Z. B. wenn das Passwort vergessen wurde. ${esc(name)} wird überall abgemeldet und meldet sich mit dem neuen Passwort an.</p>
          <input class="input" name="pw" type="text" placeholder="Neues Passwort (mind. 4 Zeichen)" minlength="4" required autocomplete="off">
          <div class="row" style="justify-content:flex-end"><button class="btn btn-ghost" type="button" data-x>Abbrechen</button><button class="btn btn-gold" type="submit">Speichern</button></div>
        </form>`);
        const close = modal(form);
        form.querySelector('[data-x]').addEventListener('click', close);
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          run(async () => {
            await adminApi('POST', '/api/admin/password', { name, password: form.pw.value });
            close();
            await done(`Neues Passwort für ${name} gespeichert.`);
          });
        });
        setTimeout(() => form.pw.focus(), 50);
      });
    });
  }

  await show();
  return () => { alive = false; };
}
