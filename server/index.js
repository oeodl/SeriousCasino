// Spaß-Casino – Server.
// Standard: lauscht ausschließlich auf 127.0.0.1:3000 (nur dieser PC).
// Mit --lan (start-heimnetz.bat): zusätzlich im Heimnetz erreichbar – aber nur für Geräte aus dem lokalen Netz.
// Mit --online (GitHub Codespaces): über den Codespaces-Link aus dem Internet erreichbar, Passwörter sind Pflicht.
// Mit --cloud (Render + github.io): wie --online, zusätzlich darf die github.io-Seite den Server ansprechen,
//   Daten liegen in der Datenbank (DATABASE_URL), Admin-Passwort aus CASINO_ADMIN_PASSWORD.
const path = require('path');
const fs = require('fs');
const os = require('os');
const express = require('express');
const db = require('./db');
const profiles = require('./profiles');
const admin = require('./admin');
const duels = require('./duels');
const live = require('./live');
const livecrash = require('./livecrash');
const cases = require('./cases');
const progress = require('./progress');
const chat = require('./chat');
const { GameError } = require('./util');

const CLOUD = process.argv.includes('--cloud');
const ONLINE = CLOUD || process.argv.includes('--online');
const LAN = process.argv.includes('--lan');
const HOST = process.env.CASINO_BIND || (LAN || ONLINE ? '0.0.0.0' : '127.0.0.1'); // CASINO_BIND nur für Tests
const REQUIRE_PASSWORD = ONLINE; // im Internet: Passwort Pflicht (lokal/Heimnetz optional)
// Render gibt den Port über PORT vor; sonst optional CASINO_PORT (z. B. zum Testen)
const PORT = Number((CLOUD && process.env.PORT) || process.env.CASINO_PORT) || 3000;
// Webseiten, die den Server von außen ansprechen dürfen (die github.io-Seite)
const ALLOWED_ORIGINS = new Set(
  (process.env.CASINO_ALLOWED_ORIGINS || (CLOUD ? 'https://oeodl.github.io' : '')).split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean),
);
const URL = `http://127.0.0.1:${PORT}`;

/** Private/lokale IPv4-Adresse? (Heimnetz-Bereiche + dieser PC) */
function isPrivateIPv4(ip) {
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(ip);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254);
}

/** Adressen dieses PCs im Heimnetz (für Freunde) – virtuelle Adapter (WSL, VirtualBox, VMware …) werden ausgeblendet */
const VIRTUAL = /vethernet|wsl|hyper-v|virtualbox|vmware|vmnet|docker|loopback|bluetooth|tailscale|zerotier/i;
function lanUrls() {
  const all = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const i of list || []) {
      if ((i.family === 'IPv4' || i.family === 4) && !i.internal && isPrivateIPv4(i.address) && !i.address.startsWith('169.254.')) {
        const virtual = VIRTUAL.test(name) || i.address.startsWith('192.168.56.'); // 192.168.56.x = VirtualBox-Standard
        const prio = /wlan|wi-?fi|wireless/i.test(name) ? 0 : /ethernet|^eth|^en/i.test(name) ? 1 : 2;
        all.push({ url: `http://${i.address}:${PORT}`, virtual, prio });
      }
    }
  }
  const real = all.filter((x) => !x.virtual);
  return (real.length ? real : all).sort((a, b) => a.prio - b.prio).map((x) => x.url);
}

const HOSTNAME = os.hostname().toLowerCase();
/**
 * Erlaubte Host-Namen in der Adresszeile. Schützt davor, dass fremde Webseiten per DNS-Trick
 * auf den Server zugreifen: erlaubt sind nur IP-Adressen und der Name dieses PCs, keine fremden Domains.
 */
function hostAllowed(hostHeader) {
  const host = String(hostHeader || '').toLowerCase();
  if (ONLINE) {
    // GitHub Codespaces-Links (https://<name>-3000.app.github.dev) oder ein selbst gesetzter Name
    const name = host.replace(/:\d+$/, '');
    if (/^[a-z0-9-]+\.app\.github\.dev$/.test(name) || /^[a-z0-9-]+\.preview\.app\.github\.dev$/.test(name)) return true;
    if (process.env.CASINO_PUBLIC_HOST && name === process.env.CASINO_PUBLIC_HOST.toLowerCase()) return true;
    if (process.env.RENDER_EXTERNAL_HOSTNAME && name === process.env.RENDER_EXTERNAL_HOSTNAME.toLowerCase()) return true;
    if (name === '127.0.0.1' || name === 'localhost') return true;
    return false;
  }
  const m = /^([^:]+):(\d+)$/.exec(host);
  if (!m || Number(m[2]) !== PORT) return false;
  const name = m[1];
  if (name === '127.0.0.1' || name === 'localhost') return true;
  if (!LAN) return false;
  if (isPrivateIPv4(name)) return true;
  return [HOSTNAME, `${HOSTNAME}.local`, `${HOSTNAME}.fritz.box`, `${HOSTNAME}.lan`, `${HOSTNAME}.home`].includes(name);
}

/** Nur Geräte aus dem eigenen Netz dürfen zugreifen (falls der Router doch etwas weiterleitet) */
function clientAllowed(addr) {
  if (ONLINE) return true; // Zugriff läuft über GitHubs Weiterleitung; geschützt durch Passwörter
  const ip = String(addr || '').replace(/^::ffff:/, '');
  if (ip === '::1') return true;
  return LAN ? isPrivateIPv4(ip) : ip === '127.0.0.1';
}

const ready = db.load();

// Alle Spiele aus server/games laden (Dateiname = Spiel-ID)
const games = {};
for (const file of fs.readdirSync(path.join(__dirname, 'games'))) {
  if (file.endsWith('.js')) games[file.slice(0, -3)] = require(`./games/${file}`);
}

const app = express();
app.disable('x-powered-by');
if (ONLINE) app.set('trust proxy', true); // echte Besucher-IP hinter GitHubs Weiterleitung (für die Login-Sperre)

// Zugriffsschutz: nur dieser PC (bzw. im Heimnetz-Modus: nur Geräte aus dem lokalen Netz)
app.use((req, res, next) => {
  if (!clientAllowed(req.socket.remoteAddress) || !hostAllowed(req.headers.host)) {
    return res.status(403).send(ONLINE ? 'Unbekannte Adresse.' : LAN ? 'Nur im Heimnetz erreichbar.' : 'Nur lokal erreichbar.');
  }
  // Grundlegende Sicherheits-Header
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

// Die github.io-Seite darf den Server ansprechen (CORS) – nur die freigegebenen Adressen
app.use('/api', (req, res, next) => {
  const origin = String(req.headers.origin || '').replace(/\/$/, '');
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Session, X-Admin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Max-Age', '600');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(origin && ALLOWED_ORIGINS.has(origin) ? 204 : 403);
  next();
});
// Gesundheit + grobe Kennzahlen (keine persönlichen Daten) – hilft, Abstürze/Speicherprobleme zu erkennen
app.get('/api/health', (req, res) => res.json({ ok: true, upMin: Math.round(process.uptime() / 60), memMB: Math.round(process.memoryUsage().rss / 1048576), stateKB: Math.round(db.savedSize() / 1024) }));

// Sperre gegen Passwort-Raten: nach 8 Fehlversuchen 10 Minuten Pause (pro IP)
const failed = new Map();
function checkLoginLimit(ip) {
  const f = failed.get(ip);
  if (f && f.until > Date.now()) {
    const min = Math.ceil((f.until - Date.now()) / 60000);
    throw new GameError(`Zu viele Fehlversuche. Bitte in ${min} Min. nochmal versuchen.`, 429);
  }
}
function noteLoginFail(ip) {
  const f = failed.get(ip) || { count: 0, until: 0 };
  f.count++;
  if (f.count >= 8) { f.until = Date.now() + 10 * 60 * 1000; f.count = 0; }
  failed.set(ip, f);
}
app.use(express.json({ limit: '50kb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

function handle(fn) {
  return (req, res) => {
    try {
      const result = fn(req, res);
      db.save();
      res.json(result ?? { ok: true });
    } catch (e) {
      if (e instanceof GameError) return res.status(e.status).json({ error: e.message });
      console.error(e);
      res.status(500).json({ error: 'Interner Fehler – bitte nochmal versuchen.' });
    }
  };
}

const token = (req) => req.get('x-session');
const me = (req) => profiles.get(token(req));

// ---------- Server-Info (für "Freunde einladen") ----------
app.get('/api/server-info', handle((req) => ({
  lan: LAN,
  online: ONLINE,
  requirePassword: REQUIRE_PASSWORD,
  urls: LAN ? lanUrls() : ONLINE ? [`https://${String(req.headers.host).replace(/:\d+$/, '')}`] : [],
  port: PORT,
})));

// ---------- Profile & Anmeldung ----------
app.get('/api/profiles', handle(() => profiles.all().map(profiles.summary).sort((a, b) => b.balance - a.balance)));
app.post('/api/profiles', handle((req) => {
  const { p, token: t } = profiles.create(req.body?.name, req.body?.password, REQUIRE_PASSWORD);
  return { ...profiles.publicView(p), token: t };
}));
app.post('/api/login', handle((req) => {
  checkLoginLimit(req.ip);
  try {
    const { p, token: t } = profiles.login(req.body?.name, req.body?.password, REQUIRE_PASSWORD);
    failed.delete(req.ip);
    return { ...profiles.publicView(p), token: t };
  } catch (e) {
    if (e instanceof GameError && e.status === 401) noteLoginFail(req.ip);
    throw e;
  }
}));
app.post('/api/me/logout', handle((req) => {
  profiles.logout(me(req), token(req));
  return { ok: true };
}));
app.post('/api/me/password', handle((req) => {
  const p = me(req);
  checkLoginLimit(req.ip);
  try {
    profiles.setPassword(p, req.body?.old, req.body?.password);
  } catch (e) {
    if (/bisherige Passwort/.test(e.message)) noteLoginFail(req.ip);
    throw e;
  }
  return profiles.publicView(p);
}));
app.get('/api/me', handle((req) => profiles.publicView(me(req))));
app.post('/api/me/rename', handle((req) => {
  const p = me(req);
  profiles.rename(p, req.body?.name);
  return profiles.publicView(p);
}));
app.post('/api/me/reset', handle((req) => {
  const p = me(req);
  profiles.reset(p);
  return profiles.publicView(p);
}));
app.post('/api/me/delete', handle((req) => {
  profiles.remove(me(req));
  return { ok: true };
}));
app.post('/api/me/daily', handle((req) => {
  const p = me(req);
  const amount = profiles.claimDaily(p);
  return { ...profiles.publicView(p), amount };
}));
app.post('/api/me/refill', handle((req) => {
  const p = me(req);
  const amount = profiles.refill(p);
  return { ...profiles.publicView(p), amount };
}));
app.get('/api/me/stats', handle((req) => {
  const p = me(req);
  return { stats: p.stats, history: p.history, balance: p.balance, gameNames: profiles.GAME_NAMES };
}));

// ---------- Admin ----------
/** Anfrage kommt direkt von diesem PC (nicht über Heimnetz oder GitHub-Weiterleitung)? */
const isLocalRequest = (req) => {
  const ip = String(req.socket.remoteAddress || '').replace(/^::ffff:/, '');
  return (ip === '127.0.0.1' || ip === '::1') && !req.headers['x-forwarded-for'];
};
const adminToken = (req) => req.get('x-admin');

app.get('/api/admin/status', handle((req) => {
  let loggedIn = false;
  try { admin.requireAdmin(adminToken(req)); loggedIn = true; } catch { /* nicht angemeldet */ }
  return { isSet: admin.isSet(), loggedIn, canSetupHere: !ONLINE && !admin.isSet() && isLocalRequest(req) };
}));
app.post('/api/admin/setup', handle((req) => {
  if (admin.isSet()) throw new GameError('Das Admin-Passwort ist schon festgelegt.');
  if (ONLINE || !isLocalRequest(req)) {
    throw new GameError('Das Admin-Passwort kann nur direkt am PC bzw. im Codespace-Terminal festgelegt werden (npm run admin).', 403);
  }
  admin.setPassword(req.body?.password);
  return { token: admin.login(req.body?.password) };
}));
app.post('/api/admin/login', handle((req) => {
  checkLoginLimit(req.ip);
  try {
    const t = admin.login(req.body?.password);
    failed.delete(req.ip);
    return { token: t };
  } catch (e) {
    if (e instanceof GameError && e.status === 401) noteLoginFail(req.ip);
    throw e;
  }
}));
app.post('/api/admin/logout', handle((req) => { admin.logout(adminToken(req)); return { ok: true }; }));

const adminRoute = (fn) => handle((req) => { admin.requireAdmin(adminToken(req)); return fn(req.body || {}, req); });
app.get('/api/admin/players', adminRoute(() => admin.list()));
app.post('/api/admin/adjust', adminRoute((b) => admin.adjust(b.name, b.mode, b.amount)));
app.post('/api/admin/reset', adminRoute((b) => admin.resetProfile(b.name)));
app.post('/api/admin/password', adminRoute((b) => admin.resetPassword(b.name, b.password)));
app.post('/api/admin/delete', adminRoute((b) => admin.remove(b.name)));
app.get('/api/admin/livecrash', adminRoute(() => livecrash.adminState()));
app.get('/api/admin/liveroulette', adminRoute(() => require('./liveroulette').adminState()));
app.post('/api/admin/liveroulette/rig', adminRoute((b) => require('./liveroulette').adminRig(b)));
app.get('/api/admin/jackpot', adminRoute(() => require('./jackpot').adminState()));
app.post('/api/admin/jackpot/rig', adminRoute((b) => require('./jackpot').adminRig(b)));
app.post('/api/admin/livecrash/rig', adminRoute((b) => livecrash.adminRig(b)));
app.get('/api/admin/online', adminRoute(() => ({ online: live.online() })));
const adminControl = require('./admincontrol');
app.get('/api/admin/watch', adminRoute(() => adminControl.list()));
app.post('/api/admin/luck', adminRoute((b) => adminControl.setLuck(b)));
app.post('/api/admin/control', adminRoute((b) => adminControl.control(b)));
const feedback = require('./feedback');
app.get('/api/admin/feedback', adminRoute(() => feedback.adminList()));
app.post('/api/admin/feedback/read', adminRoute((b) => feedback.markRead(String(b.id || ''))));
app.post('/api/admin/feedback/delete', adminRoute((b) => feedback.remove(String(b.id || ''))));
app.post('/api/feedback', handle((req) => feedback.send(me(req), req.body)));

// ---------- Live: wer ist online, großer-Gewinn-Feed ----------
app.post('/api/live/ping', handle((req) => {
  const p = me(req);
  const where = String(req.body?.where || 'home').replace(/[^a-z0-9-]/gi, '').slice(0, 20) || 'home';
  live.touch(p, where);
  progress.payWeeklyPrizes();
  return {
    online: live.online(), feed: live.recent(), balance: p.balance,
    notices: req.body?.notices ? progress.takeNotices(p) : [], // nur der globale Ping holt Hinweise ab
    vip: progress.badge(p), chatLast: chat.list().slice(-1)[0]?.at || 0,
  };
}));

// ---------- VIP, Aufgaben, Erfolge, Woche ----------
app.get('/api/me/progress', handle((req) => progress.overview(me(req))));
app.get('/api/weekly', handle(() => progress.weeklyBoard()));

// ---------- Chat & Geschenke ----------
app.get('/api/chat', handle((req) => { me(req); return { messages: chat.list(Number(req.query.since) || 0) }; }));
app.post('/api/chat/send', handle((req) => {
  const p = me(req);
  chat.post(p, req.body?.text);
  return { messages: chat.list(Number(req.body?.since) || 0) };
}));
app.post('/api/tip', handle((req) => {
  const p = me(req);
  const r = profiles.tip(p, req.body?.to, req.body?.amount);
  return { ...r, balance: p.balance };
}));

app.get('/api/live/bets', handle((req) => live.betsView(String(req.query.game || '').replace(/[^a-z0-9]/gi, '') || null)));

// ---------- Live-Crash (gemeinsame Runde) ----------
app.get('/api/live/crash/state', handle((req) => {
  let viewer = null;
  try { viewer = me(req); live.touch(viewer, 'livecrash'); } catch { /* Zuschauen ohne Anmeldung ist ok */ }
  return { ...livecrash.publicState(viewer?.id), balance: viewer?.balance ?? null };
}));
app.post('/api/live/crash/:action', handle((req) => {
  const action = req.params.action;
  if (!['bet', 'cashout'].includes(action)) throw new GameError('Unbekannte Aktion.', 404);
  const p = me(req);
  live.touch(p, 'livecrash');
  return { ...livecrash[action](p, req.body || {}), balance: p.balance };
}));

// ---------- Live-Roulette & Jackpot (gemeinsame Runden) ----------
const liveroulette = require('./liveroulette');
const jackpot = require('./jackpot');
const viewer = (req, where) => { try { const p = me(req); live.touch(p, where); return p; } catch { return null; } };
app.get('/api/live/roulette/state', handle((req) => { const v = viewer(req, 'liveroulette'); return { ...liveroulette.state(v?.id), balance: v?.balance ?? null }; }));
app.post('/api/live/roulette/bet', handle((req) => { const p = me(req); return { ...liveroulette.bet(p, req.body || {}), balance: p.balance }; }));
app.get('/api/live/jackpot/state', handle((req) => { const v = viewer(req, 'jackpot'); return { ...jackpot.state(v?.id), balance: v?.balance ?? null }; }));
app.post('/api/live/jackpot/:action', handle((req) => {
  const p = me(req);
  const a = req.params.action;
  if (!['deposit', 'withdraw'].includes(a)) throw new GameError('Unbekannte Aktion.', 404);
  return { ...jackpot[a](p, req.body || {}), balance: p.balance };
}));

// ---------- Push-Benachrichtigungen ----------
const push = require('./push');
app.get('/api/push/key', handle(() => push.publicKey()));
app.post('/api/push/subscribe', handle((req) => push.subscribe(me(req), req.body?.subscription)));
app.post('/api/push/unsubscribe', handle((req) => push.unsubscribe(me(req), req.body?.endpoint)));
app.post('/api/push/test', handle((req) => { const p = me(req); push.send(p, 'Spaß-Casino', '🔔 Benachrichtigungen funktionieren!', '#/settings', true); return { ok: true, devices: (p.push || []).length }; }));

// ---------- Multiplayer-Tische: Blackjack & Texas Hold'em ----------
const bjtable = require('./bjtable');
app.get('/api/table/blackjack', handle((req) => { const v = viewer(req, 'bjtable'); return { ...bjtable.view(v?.id), balance: v?.balance ?? null }; }));
app.post('/api/table/blackjack/:action', handle((req) => {
  const a = req.params.action;
  if (!['sit', 'leave', 'bet', 'act'].includes(a)) throw new GameError('Unbekannte Aktion.', 404);
  const p = me(req);
  live.touch(p, 'bjtable');
  return { ...bjtable[a](p, req.body || {}), balance: p.balance };
}));

const holdem = require('./holdem');
app.get('/api/table/holdem', handle((req) => { const v = viewer(req, 'holdem'); return { ...holdem.view(v?.id), balance: v?.balance ?? null }; }));
app.post('/api/table/holdem/:action', handle((req) => {
  const a = req.params.action;
  if (!['sit', 'rebuy', 'leave', 'act'].includes(a)) throw new GameError('Unbekannte Aktion.', 404);
  const p = me(req);
  live.touch(p, 'holdem');
  return { ...holdem[a](p, req.body || {}), balance: p.balance };
}));

// ---------- Cases & Case Battles ----------
app.post('/api/cases/:action', handle((req) => {
  const action = req.params.action;
  if (!Object.hasOwn(cases.actions, action)) throw new GameError('Unbekannte Aktion.', 404);
  const p = me(req);
  live.touch(p, 'cases');
  const run = () => cases.actions[action](p, req.body || {});
  return { ...(action === 'open' ? withLuck(p, 'caseopen', run) : run()), balance: p.balance };
}));

// ---------- Duelle (1 gegen 1) ----------
app.post('/api/duels/:action', handle((req) => {
  const action = req.params.action;
  if (!Object.hasOwn(duels.actions, action)) throw new GameError('Unbekannte Aktion.', 404);
  const p = me(req);
  if (action !== 'count') live.touch(p, 'duels');
  const result = duels.actions[action](p, req.body || {});
  return { ...result, balance: p.balance };
}));

// ---------- Spiele ----------
app.get('/api/games/:game/info', handle((req) => {
  const g = games[req.params.game];
  if (!g || typeof g.info !== 'function') throw new GameError('Unbekanntes Spiel.', 404);
  return g.info();
}));
app.post('/api/games/:game/:action', handle((req) => {
  const g = Object.hasOwn(games, req.params.game) ? games[req.params.game] : null;
  const action = req.params.action;
  if (!g || action === 'info' || action.startsWith('_') || !Object.hasOwn(g, action) || typeof g[action] !== 'function') {
    throw new GameError('Unbekannte Aktion.', 404);
  }
  const p = me(req);
  live.touch(p, req.params.game);
  const result = withLuck(p, req.params.game, () => g[action](p, req.body || {}));
  return { ...result, balance: p.balance };
}));

// Admin-Glückssteuerung für Sofort-Spiele: Runde so oft neu auslosen, bis sie zur Vorgabe passt
// (Pech = Spieler verliert Geld, Glück = Spieler gewinnt). Zustand wird zwischen den Versuchen zurückgesetzt.
const INSTANT = new Set(['slots', 'roulette', 'dice', 'plinko', 'keno', 'limbo', 'wheel', 'scratch', 'cups', 'rps', 'sicbo', 'dragontiger', 'baccarat', 'bingo', 'horses', 'war', 'caseopen']);
function withLuck(p, game, run) {
  const mode = require('./luck').luckOf(p);
  if (mode === 'normal' || !INSTANT.has(game)) return run();
  const snap = structuredClone({
    balance: p.balance, stats: p.stats, history: p.history, active: p.active,
    vip: p.vip ?? null, quests: p.quests ?? null, achievements: p.achievements ?? null, weekly: p.weekly ?? null, notices: p.notices ?? [], loseStreak: p.loseStreak ?? 0,
  });
  live.hold();
  try {
    for (let attempt = 1; ; attempt++) {
      const r = run();
      const bet = r.bet ?? r.totalBet ?? r.price ?? 0;
      const payout = r.payout ?? r.item?.value ?? 0;
      const finished = !r.running;
      const ok = !finished || (mode === 'lose' ? payout < bet : payout > bet);
      if (ok || attempt >= 80) { live.release(); return r; }
      Object.assign(p, structuredClone(snap));
      live.discard();
    }
  } catch (e) {
    live.release();
    throw e;
  }
}

app.use('/api', (req, res) => res.status(404).json({ error: 'Nicht gefunden.' }));

// Erst die gespeicherten Daten laden (Datei oder Datenbank), dann den Server starten
ready.then(start, (e) => {
  console.error('Daten konnten nicht geladen werden:', e.message);
  process.exit(1);
});

function start() {
livecrash.start();
liveroulette.start();
jackpot.start();
bjtable.start();
holdem.start();
const server = app.listen(PORT, HOST, () => {
  console.log('');
  console.log('  ==========================================');
  console.log('   Spass-Casino laeuft!');
  console.log(`   Im Browser oeffnen: ${URL}`);
  console.log(`   Speicherort: ${db.storeName()}`);
  if (CLOUD) {
    console.log('');
    console.log('   CLOUD-MODUS: Passwoerter sind Pflicht.');
    console.log(`   Erlaubte Webseiten: ${[...ALLOWED_ORIGINS].join(', ') || '(keine)'}`);
  } else if (ONLINE) {
    console.log('');
    console.log('   ONLINE-MODUS (GitHub Codespaces): Passwoerter sind Pflicht.');
    if (process.env.CODESPACE_NAME && process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN) {
      console.log(`   Link fuer Freunde: https://${process.env.CODESPACE_NAME}-${PORT}.${process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}`);
    }
  }
  if (LAN) {
    const urls = lanUrls();
    console.log('');
    console.log('   HEIMNETZ-MODUS: Freunde im selben WLAN oeffnen:');
    if (urls.length) urls.forEach((u) => console.log(`      ${u}`));
    else console.log('      (keine Heimnetz-Adresse gefunden - ist der PC im WLAN/LAN?)');
  }
  console.log('');
  console.log('   Zum Beenden dieses Fenster schliessen.');
  console.log('  ==========================================');
  console.log('');
  if (process.argv.includes('--open')) openBrowser();
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.log(`Port ${PORT} ist schon belegt – laeuft das Casino vielleicht schon?`);
    if (process.argv.includes('--open')) openBrowser();
    setTimeout(() => process.exit(1), 1500);
  } else {
    throw e;
  }
});

// Beim Herunterfahren (z. B. Render legt den Server schlafen) erst fertig speichern
const shutdown = async () => {
  server.close();
  try { await db.flush(); } catch { /* egal */ }
  process.exit(0);
};
// Ein unerwarteter Fehler soll nie den ganzen Server (und alle laufenden Runden) beenden
process.on('uncaughtException', (e) => console.error('Unerwarteter Fehler:', e && e.stack || e));
process.on('unhandledRejection', (e) => console.error('Unbehandelter Fehler:', e && e.stack || e));
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
process.on('SIGHUP', shutdown); // Windows: Konsolenfenster wird geschlossen
}

function openBrowser() {
  const { exec } = require('child_process');
  if (process.platform === 'win32') exec(`start "" "${URL}"`);
  else if (process.platform === 'darwin') exec(`open "${URL}"`);
  else exec(`xdg-open "${URL}"`);
}
