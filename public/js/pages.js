// Seiten: Startseite, Statistik, Rangliste, Einstellungen, Admin.
import { h, esc, fmt, fmtSigned, toast, confirmDialog, modal } from './ui.js';
export { admin } from './adminpage.js';
export { duels, duel } from './duelpage.js';
export { live, cases, battle } from './livepage.js';
export { vip } from './vippage.js';
import { sfx } from './sound.js';
import { session } from './api.js';
import { pushStatus, enablePush, disablePush } from './push.js';

const signCls = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');

// ---------- Lobby ----------
/** Kompakte Spielkarte (für Reihen und Raster) */
function gameCard(g, ctx) {
  const fav = ctx.favorites.has(g.id);
  return `<a class="gcard" href="#/${g.id}" style="--tile-a:${g.a};--tile-b:${g.b}">
    <span class="gcard-icon">${g.icon}</span>
    ${g.cat === 'live' ? '<span class="gcard-badge live">● LIVE</span>' : g.hot ? '<span class="gcard-badge">🔥</span>' : ''}
    <button class="gcard-fav ${fav ? 'on' : ''}" data-fav="${g.id}" title="Favorit">${fav ? '★' : '☆'}</button>
    <span class="gcard-name">${esc(g.name)}</span>
  </a>`;
}

function wireFavs(root, ctx, onChange) {
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-fav]');
    if (!b) return;
    e.preventDefault();
    e.stopPropagation();
    const on = ctx.favorites.toggle(b.dataset.fav);
    sfx.click();
    b.classList.toggle('on', on);
    b.textContent = on ? '★' : '☆';
    onChange?.();
  });
}

function row(title, games, ctx, more = '') {
  if (!games.length) return '';
  return `<section class="lobby-row"><div class="lr-head"><h2>${title}</h2>${more}</div>
    <div class="lr-scroll">${games.map((g) => gameCard(g, ctx)).join('')}</div></section>`;
}

export async function home(root, ctx) {
  const name = ctx.state.me?.name ?? '';
  const byId = (id) => ctx.GAMES.find((g) => g.id === id);
  const recentGames = ctx.recent.list().map(byId).filter(Boolean);
  const favGames = ctx.favorites.list().map(byId).filter(Boolean);
  const el = h(`<div class="lobby">
    <section class="hero-banner">
      <div class="hb-text">
        <div class="hb-kicker">Willkommen zurück, ${esc(name)} 👋</div>
        <h1>Spiel mit Freunden.<br><span class="gold">Live.</span></h1>
        <p>Eine Rakete für alle, Case Battles und Duelle – nur mit Spaß-Chips.</p>
        <div class="row" style="flex-wrap:wrap"><a class="btn btn-gold" href="#/livecrash">🚀 Live-Crash spielen</a><a class="btn" href="#/cases">📦 Case Battles</a><a class="btn" href="#/duels">⚔️ Duelle</a></div>
      </div>
      <div class="hb-art">🎰</div>
    </section>
    <div class="lobby-rows">
      ${row('⭐ Deine Favoriten', favGames, ctx, '<a class="lr-more" href="#/favorites">Alle</a>')}
      ${row('🕘 Zuletzt gespielt', recentGames.slice(0, 10), ctx, '<a class="lr-more" href="#/recent">Alle</a>')}
      ${row('🔥 Beliebt', ctx.GAMES.filter((g) => g.hot), ctx)}
      ${ctx.CATS.map((c) => row(`${c.icon} ${esc(c.name)}`, ctx.GAMES.filter((g) => g.cat === c.id), ctx, `<a class="lr-more" href="#/cat?c=${c.id}">Alle ${ctx.GAMES.filter((g) => g.cat === c.id).length}</a>`)).join('')}
      <section class="lobby-row"><div class="lr-head"><h2>⚔️ Multiplayer</h2></div>
        <div class="lr-scroll">
          <a class="gcard" href="#/duels" style="--tile-a:#5c1a1a;--tile-b:#1f0808"><span class="gcard-icon">⚔️</span><span class="gcard-name">Duelle 1 gegen 1</span></a>
          <a class="gcard" href="#/cases" style="--tile-a:#3d1a5c;--tile-b:#12081f"><span class="gcard-icon">📦</span><span class="gcard-name">Case Battles</span></a>
        </div></section>
    </div>
    <div class="lobby-bets"></div>
  </div>`);
  root.appendChild(el);
  wireFavs(el, ctx);
  const { betsPanel } = await import('./bets.js');
  const bets = betsPanel(ctx, { GAMES: ctx.GAMES, title: '🎲 Live-Wetten' });
  el.querySelector('.lobby-bets').appendChild(bets.el);
  return () => bets.cleanup();
}

function gridPage(root, ctx, title, games, empty) {
  const el = h(`<div><div class="page-head"><a class="back-link" href="#/">← Lobby</a><h1>${title}</h1></div>
    ${games.length ? `<div class="game-grid">${games.map((g) => gameCard(g, ctx)).join('')}</div>` : `<div class="panel"><p class="muted" style="margin:0">${empty}</p></div>`}</div>`);
  root.appendChild(el);
  wireFavs(el, ctx);
}

export function cat(root, ctx) {
  const c = ctx.CATS.find((x) => x.id === ctx.cat) || ctx.CATS[0];
  gridPage(root, ctx, `${c.icon} ${esc(c.name)}`, ctx.GAMES.filter((g) => g.cat === c.id), '');
}

export function favorites(root, ctx) {
  gridPage(root, ctx, '⭐ Favoriten', ctx.favorites.list().map((id) => ctx.GAMES.find((g) => g.id === id)).filter(Boolean), 'Noch keine Favoriten – tippe bei einem Spiel auf den ☆-Stern.');
}

export function recent(root, ctx) {
  gridPage(root, ctx, '🕘 Zuletzt gespielt', ctx.recent.list().map((id) => ctx.GAMES.find((g) => g.id === id)).filter(Boolean), 'Du hast noch nichts gespielt.');
}

export function search(root, ctx) {
  const q = (new URLSearchParams(location.hash.split('?')[1] || '').get('q') || '').toLowerCase();
  const hits = ctx.GAMES.filter((g) => `${g.name} ${g.desc} ${g.tag}`.toLowerCase().includes(q));
  gridPage(root, ctx, `🔍 „${esc(q)}“`, hits, 'Kein Spiel gefunden.');
}

// ---------- Statistik ----------
export async function stats(root, ctx) {
  const data = await ctx.get('/api/me/stats');
  const s = data.stats;
  const names = data.gameNames;
  const net = s.paid - s.wagered;
  const games = Object.entries(s.perGame).map(([id, g]) => ({ id, ...g, net: g.paid - g.wagered })).sort((a, b) => b.rounds - a.rounds);
  const maxAbs = Math.max(1, ...games.map((g) => Math.abs(g.net)));
  const hist = data.history;

  root.appendChild(h(`<div>
    <div class="page-head"><h1>📊 Statistik</h1></div>
    <div class="stat-cards">
      <div class="stat-card"><div class="sc-label">Gewinn / Verlust gesamt</div><div class="sc-val ${signCls(net)}">${fmtSigned(net)}</div><div class="sc-sub">Chips</div></div>
      <div class="stat-card"><div class="sc-label">Gespielte Runden</div><div class="sc-val">${fmt(s.rounds)}</div><div class="sc-sub">${fmt(s.wagered)} Chips eingesetzt</div></div>
      <div class="stat-card"><div class="sc-label">Größter Gewinn</div><div class="sc-val gold">${fmtSigned(s.biggestWin)}</div><div class="sc-sub">${s.biggestWinGame ? esc(names[s.biggestWinGame]) : '–'}</div></div>
      <div class="stat-card"><div class="sc-label">Auszahlungsquote</div><div class="sc-val">${s.wagered ? ((s.paid / s.wagered) * 100).toFixed(1).replace('.', ',') + ' %' : '–'}</div><div class="sc-sub">ausgezahlt / eingesetzt</div></div>
    </div>

    <div class="panel section">
      <h2>Guthaben-Verlauf (letzte ${hist.length} Runden)</h2>
      ${hist.length > 1 ? sparkline(hist.slice().reverse().map((x) => x.balance)) : '<p class="muted">Spiel ein paar Runden, dann erscheint hier dein Verlauf.</p>'}
    </div>

    <div class="panel section">
      <h2>Pro Spiel</h2>
      ${games.length ? `<div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Spiel</th><th class="num">Runden</th><th class="num">Eingesetzt</th><th class="num">Ausgezahlt</th><th class="num">Netto</th><th></th><th class="num">Größter Gewinn</th></tr></thead>
        <tbody>${games.map((g) => `<tr>
          <td>${esc(names[g.id] || g.id)}</td><td class="num">${fmt(g.rounds)}</td><td class="num">${fmt(g.wagered)}</td><td class="num">${fmt(g.paid)}</td>
          <td class="num ${signCls(g.net)}">${fmtSigned(g.net)}</td>
          <td class="bar-cell"><div class="bar ${g.net < 0 ? 'neg' : ''}" style="width:${Math.max(2, (Math.abs(g.net) / maxAbs) * 100)}%"></div></td>
          <td class="num gold">${fmtSigned(g.biggestWin)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Noch keine Runden gespielt.</p>'}
    </div>

    <div class="panel section">
      <h2>Letzte Runden</h2>
      ${hist.length ? `<div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Zeit</th><th>Spiel</th><th class="num">Einsatz</th><th class="num">Auszahlung</th><th class="num">Netto</th><th>Details</th></tr></thead>
        <tbody>${hist.map((r) => `<tr>
          <td class="muted">${new Date(r.time).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
          <td>${esc(names[r.game] || r.game)}</td><td class="num">${fmt(r.bet)}</td><td class="num">${fmt(r.payout)}</td>
          <td class="num ${signCls(r.net)}">${fmtSigned(r.net)}</td><td class="muted">${esc(r.detail)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Noch nichts gespielt.</p>'}
    </div></div>`));
}

function sparkline(values) {
  const W = 800, H = 140, pad = 8;
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [pad + (i / (values.length - 1)) * (W - 2 * pad), H - pad - ((v - min) / span) * (H - 2 * pad)]);
  const line = pts.map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' ');
  const area = `${pad},${H - pad} ${line} ${W - pad},${H - pad}`;
  const up = values[values.length - 1] >= values[0];
  const col = up ? '#2ecc71' : '#e5484d';
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <defs><linearGradient id="sg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".35"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs>
    <polygon points="${area}" fill="url(#sg)"/><polyline points="${line}" fill="none" stroke="${col}" stroke-width="2.5" vector-effect="non-scaling-stroke"/></svg>
    <div class="kv"><span>Tiefststand ${fmt(min)}</span><span>Höchststand ${fmt(max)}</span></div>`;
}

// ---------- Rangliste ----------
export async function leaderboard(root, ctx) {
  let tab = new URLSearchParams(location.hash.split('?')[1] || '').get('tab') === 'week' ? 'week' : 'all';
  const medal = ['🥇', '🥈', '🥉'];
  const el = h(`<div>
    <div class="page-head"><h1>🏆 Rangliste</h1></div>
    <div class="bets-tabs"><button data-t="all">Gesamt (Guthaben)</button><button data-t="week">Diese Woche (Gewinn)</button></div>
    <div class="lb-body"></div>
    <div class="panel section invite-box"></div></div>`);
  root.appendChild(el);
  const body = el.querySelector('.lb-body');
  const vipCell = (v) => (v ? `<span class="lvl-chip" style="--tc:${v.color}" title="${esc(v.tier)}">${v.icon} ${v.level}</span>` : '');
  const tipBtn = (name) => (name !== ctx.state.me?.name ? `<button class="btn btn-sm btn-ghost" data-tip="${esc(name)}" title="Chips schenken">🎁</button>` : '');

  async function paint() {
    el.querySelectorAll('[data-t]').forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
    if (tab === 'all') {
      const list = await ctx.get('/api/profiles');
      body.innerHTML = `<div class="panel"><div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>#</th><th>Name</th><th>Stufe</th><th class="num">Chips</th><th class="num">Gewinn/Verlust</th><th class="num">Runden</th><th class="num">Größter Gewinn</th><th></th></tr></thead>
        <tbody>${list.map((p, i) => `<tr class="${p.name === ctx.state.me?.name ? 'hl' : ''}">
          <td>${i < 3 ? `<span class="medal">${medal[i]}</span>` : i + 1}</td><td><b>${esc(p.name)}</b></td><td>${vipCell(p.vip)}</td>
          <td class="num gold"><b>${fmt(p.balance)}</b></td><td class="num ${signCls(p.net)}">${fmtSigned(p.net)}</td>
          <td class="num">${fmt(p.rounds)}</td><td class="num">${fmtSigned(p.biggestWin)}</td><td>${tipBtn(p.name)}</td></tr>`).join('')}
        </tbody></table></div></div>`;
    } else {
      const w = await ctx.get('/api/weekly');
      body.innerHTML = `<div class="panel">
        <p class="muted" style="margin-top:0">Woche ${esc(w.week)} · Preise am Montag: 🥇 ${fmt(w.prizes[0])} · 🥈 ${fmt(w.prizes[1])} · 🥉 ${fmt(w.prizes[2])} Chips</p>
        ${w.lastWinners.length ? `<p style="margin-top:0">Letzte Woche: ${w.lastWinners.map((x, i) => `${medal[i]} <b>${esc(x.name)}</b> (${fmtSigned(x.net)})`).join(' · ')}</p>` : ''}
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>Name</th><th class="num">Gewinn/Verlust</th><th class="num">Runden</th><th class="num">Eingesetzt</th><th class="num">Bester Gewinn</th><th></th></tr></thead>
        <tbody>${w.list.map((p, i) => `<tr class="${p.name === ctx.state.me?.name ? 'hl' : ''}">
          <td>${i < 3 ? `<span class="medal">${medal[i]}</span>` : i + 1}</td><td><b>${esc(p.name)}</b></td>
          <td class="num ${signCls(p.net)}"><b>${fmtSigned(p.net)}</b></td><td class="num">${fmt(p.rounds)}</td><td class="num">${fmt(p.wagered)}</td><td class="num">${fmtSigned(p.best)}</td><td>${tipBtn(p.name)}</td></tr>`).join('')
          || '<tr><td colspan="7" class="muted">Diese Woche hat noch niemand gespielt.</td></tr>'}</tbody></table></div></div>`;
    }
  }
  el.querySelectorAll('[data-t]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.t; paint(); }));
  body.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tip]');
    if (!b) return;
    const to = b.dataset.tip;
    const form = h(`<form class="auth-form" style="margin:0"><h2>🎁 Chips an ${esc(to)} schenken</h2>
      <input class="input" name="amount" type="number" min="10" step="1" value="500" required>
      <div class="row" style="justify-content:flex-end"><button class="btn btn-ghost" type="button" data-x>Abbrechen</button><button class="btn btn-gold" type="submit">Schenken</button></div></form>`);
    const close = modal(form);
    form.querySelector('[data-x]').addEventListener('click', close);
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      try {
        const r = await ctx.post('/api/tip', { to, amount: Number(form.amount.value) });
        ctx.setBalance(r.balance);
        sfx.coin();
        toast(`🎁 ${fmt(r.amount)} Chips an ${r.to} geschenkt.`, 'ok');
        close();
        paint();
      } catch (err) { toast(err.message, 'err'); }
    });
  });
  await paint();
  fillInvite(el.querySelector('.invite-box'), ctx);
}

/** Zeigt, wie Freunde im Heimnetz mitspielen können */
async function fillInvite(box, ctx) {
  let info = { lan: false, urls: [] };
  try { info = await ctx.get('/api/server-info'); } catch { /* egal */ }
  // Online: genau die Adresse teilen, die gerade im Browser offen ist (z. B. der github.io-Link)
  if (info.online) info.urls = [location.origin + location.pathname];
  if ((info.lan || info.online) && info.urls.length) {
    box.innerHTML = `<h2>${info.online ? '🌍' : '📶'} Freunde einladen</h2>
      <p class="muted">${info.online
        ? 'Online-Modus ist an. Schick deinen Freunden diesen Link – sie können von überall mitspielen:'
        : 'Heimnetz-Modus ist an. Freunde im <b>selben WLAN</b> öffnen auf Handy oder Laptop diese Adresse:'}</p>
      ${info.urls.map((u) => `<div class="invite-url"><code>${esc(u)}</code><button class="btn btn-sm" data-copy="${esc(u)}">Kopieren</button></div>`).join('')}
      <p class="muted" style="margin-bottom:0">Dort legt jeder sein eigenes Profil an. Guthaben und Rangliste sind für alle gemeinsam.</p>`;
    box.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(b.dataset.copy); toast('Adresse kopiert.', 'ok'); }
      catch { toast('Kopieren nicht möglich – bitte abtippen.', 'err'); }
    }));
  } else if (info.lan) {
    box.innerHTML = `<h2>📶 Freunde einladen</h2><p class="muted" style="margin-bottom:0">Heimnetz-Modus ist an, aber es wurde keine Heimnetz-Adresse gefunden. Ist der PC mit dem WLAN/LAN verbunden?</p>`;
  } else {
    box.innerHTML = `<h2>📶 Mit Freunden spielen</h2>
      <p class="muted" style="margin-bottom:0">Gerade läuft das Casino nur auf diesem PC. Damit Freunde im selben WLAN mit ihrem Handy oder Laptop mitspielen können:
      Casino-Fenster schließen und stattdessen <b>start-heimnetz.bat</b> starten.</p>`;
  }
}

// ---------- Einstellungen ----------
export function settings(root, ctx) {
  const me = ctx.state.me;
  const el = h(`<div>
    <div class="page-head"><h1>⚙️ Einstellungen</h1></div>
    <div class="settings-grid">
      <div class="panel">
        <h2>Sound</h2>
        <p class="muted">Sound-Effekte bei Drehen, Karten, Gewinnen usw.</p>
        <button class="btn" id="sndBtn"></button>
      </div>
      <div class="panel push-box">
        <h2>🔔 Benachrichtigungen</h2>
        <p class="muted">Bekomme eine Meldung aufs Handy oder den PC, wenn dich jemand zum Duell herausfordert, deine Herausforderung angenommen wird oder dir jemand Chips schenkt – auch wenn das Casino gerade zu ist.</p>
        <p class="push-state"></p>
        <div class="row" style="flex-wrap:wrap"><button class="btn btn-gold push-on hidden">Aktivieren</button><button class="btn push-test hidden">Test senden</button><button class="btn btn-ghost push-off hidden">Ausschalten</button></div>
      </div>
      <div class="panel">
        <h2>Profil</h2>
        <form class="row" id="renameForm">
          <input class="input" name="name" maxlength="20" value="${esc(me.name)}" required>
          <button class="btn" type="submit">Umbenennen</button>
        </form>
        <div class="row" style="margin-top:12px;flex-wrap:wrap">
          <button class="btn btn-gold" id="switchBtn">Profil wechseln / neu anlegen</button>
          <button class="btn" id="logoutBtn">Abmelden</button>
        </div>
      </div>
      <div class="panel">
        <h2>🔒 Passwort</h2>
        <p class="muted">${me.hasPassword ? 'Dein Profil ist mit einem Passwort geschützt.' : ctx.server.online
          ? 'Lege ein Passwort fest.' : 'Optional: Schütze dein Profil mit einem Passwort (Pflicht, wenn ihr online spielt).'}</p>
        <form id="pwForm" class="auth-form">
          ${me.hasPassword ? '<input class="input" name="old" type="password" placeholder="Bisheriges Passwort" autocomplete="current-password" required>' : ''}
          <input class="input" name="password" type="password" placeholder="Neues Passwort (mind. 4 Zeichen)" autocomplete="new-password" minlength="4" required>
          <button class="btn" type="submit">${me.hasPassword ? 'Passwort ändern' : 'Passwort festlegen'}</button>
        </form>
      </div>
      <div class="panel invite-box"></div>
      <div class="panel">
        <h2>💬 Feedback</h2>
        <p class="muted">Idee für ein neues Spiel, einen Fehler gefunden oder sonst was auf dem Herzen? Schreib es hier – der Admin liest mit.</p>
        <form id="feedbackForm" class="auth-form">
          <select class="input" name="kind">
            <option value="idee">💡 Idee / Wunsch</option>
            <option value="fehler">🐞 Fehler</option>
            <option value="sonstiges">💬 Sonstiges</option>
          </select>
          <textarea class="input" name="text" rows="4" maxlength="1000" placeholder="Dein Feedback …" required style="resize:vertical"></textarea>
          <button class="btn btn-gold" type="submit">Absenden</button>
        </form>
      </div>
      <div class="panel">
        <h2>🛠️ Admin-Bereich</h2>
        <p class="muted">Spielern Chips geben oder abziehen, Profile zurücksetzen, vergessene Passwörter neu vergeben. Geschützt mit eigenem Admin-Passwort.</p>
        <a class="btn" href="#/admin">Admin-Bereich öffnen</a>
      </div>
      <div class="panel danger-zone">
        <h2>Zurücksetzen</h2>
        <p class="muted">Setzt <b>${esc(me.name)}</b> auf 10.000 Chips zurück und löscht Statistik und Verlauf dieses Profils.</p>
        <div class="row" style="flex-wrap:wrap">
          <button class="btn btn-red" id="resetBtn">Profil zurücksetzen</button>
          <button class="btn btn-ghost" id="deleteBtn">Profil löschen</button>
        </div>
      </div>
    </div></div>`);
  root.appendChild(el);
  fillInvite(el.querySelector('.invite-box'), ctx);

  // Push-Benachrichtigungen
  const pb = el.querySelector('.push-box');
  const pState = pb.querySelector('.push-state');
  async function paintPush() {
    const s = await pushStatus().catch(() => 'unsupported');
    pState.innerHTML = {
      on: '<span class="pos">✅ Auf diesem Gerät aktiv.</span>',
      off: 'Auf diesem Gerät ausgeschaltet.',
      denied: '<span class="neg">Im Browser blockiert.</span> Erlaube Benachrichtigungen in den Website-Einstellungen (Schloss-Symbol neben der Adresse) und lade die Seite neu.',
      'ios-install': '📱 Auf dem iPhone: Tippe unten auf <b>Teilen</b> → <b>Zum Home-Bildschirm</b>, öffne das Casino über das neue Symbol und aktiviere es dann hier.',
      unsupported: 'Dieser Browser bzw. diese Verbindung unterstützt keine Benachrichtigungen (im Heimnetz ohne https leider nicht möglich).',
    }[s];
    pb.querySelector('.push-on').classList.toggle('hidden', s !== 'off');
    pb.querySelector('.push-test').classList.toggle('hidden', s !== 'on');
    pb.querySelector('.push-off').classList.toggle('hidden', s !== 'on');
  }
  paintPush();
  pb.querySelector('.push-on').addEventListener('click', async () => {
    try { await enablePush(); toast('Benachrichtigungen aktiviert!', 'ok'); } catch (err) { toast(err.message, 'err'); }
    paintPush();
  });
  pb.querySelector('.push-test').addEventListener('click', async () => {
    try { await ctx.post('/api/push/test'); toast('Test gesendet – die Meldung sollte gleich erscheinen.', 'ok'); } catch (err) { toast(err.message, 'err'); }
  });
  pb.querySelector('.push-off').addEventListener('click', async () => {
    try { await disablePush(); toast('Benachrichtigungen ausgeschaltet.', 'ok'); } catch (err) { toast(err.message, 'err'); }
    paintPush();
  });

  const snd = el.querySelector('#sndBtn');
  const paint = () => (snd.textContent = sfx.enabled ? '🔊 Sound ist AN – ausschalten' : '🔇 Sound ist AUS – einschalten');
  paint();
  snd.addEventListener('click', () => {
    sfx.setEnabled(!sfx.enabled);
    paint();
    document.getElementById('soundToggle').textContent = sfx.enabled ? '🔊' : '🔇';
  });

  el.querySelector('#renameForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await ctx.post('/api/me/rename', { name: e.target.name.value });
      await ctx.loadMe();
      toast('Name geändert.', 'ok');
    } catch (err) { toast(err.message, 'err'); }
  });
  el.querySelector('#switchBtn').addEventListener('click', () => ctx.openProfilePicker());
  el.querySelector('#logoutBtn').addEventListener('click', () => ctx.logout());
  el.querySelector('#pwForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await ctx.post('/api/me/password', { old: e.target.old?.value, password: e.target.password.value });
      await ctx.loadMe();
      toast('Passwort gespeichert.', 'ok');
      location.hash = '#/settings?' + Date.now(); // Seite neu aufbauen
    } catch (err) { toast(err.message, 'err'); }
  });
  el.querySelector('#feedbackForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    btn.disabled = true;
    try {
      await ctx.post('/api/feedback', { kind: e.target.kind.value, text: e.target.text.value });
      e.target.text.value = '';
      toast('Danke für dein Feedback! 🙏', 'ok');
    } catch (err) { toast(err.message, 'err'); }
    btn.disabled = false;
  });
  el.querySelector('#resetBtn').addEventListener('click', async () => {
    if (!(await confirmDialog('Profil zurücksetzen?', `${me.name} bekommt wieder 10.000 Chips. Statistik und Verlauf werden gelöscht.`, 'Zurücksetzen', true))) return;
    try {
      const r = await ctx.post('/api/me/reset');
      await ctx.loadMe();
      ctx.setBalance(r.balance);
      toast('Profil zurückgesetzt – 10.000 Chips!', 'ok');
    } catch (err) { toast(err.message, 'err'); }
  });
  el.querySelector('#deleteBtn').addEventListener('click', async () => {
    if (!(await confirmDialog('Profil löschen?', `${me.name} wird endgültig gelöscht.`, 'Löschen', true))) return;
    try {
      await ctx.post('/api/me/delete');
      session.set('');
      ctx.state.me = null;
      location.hash = '#/';
      ctx.openProfilePicker(true);
    } catch (err) { toast(err.message, 'err'); }
  });
}
