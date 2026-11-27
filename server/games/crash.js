// Crash: Der Multiplikator steigt exponentiell, bis er an einem zufälligen Punkt "abstürzt".
// Absturzpunkt mit ≈1 % Hausvorteil: P(Absturz ≥ m) = 0,99 / m.
// Der Server rechnet den aktuellen Multiplikator aus der vergangenen Zeit – der Browser zeigt nur an.
const crypto = require('crypto');
const { randFloat, parseBet, payoutFor, GameError } = require('../util');
const profiles = require('../profiles');

const K = 0.00006; // Wachstum pro Millisekunde (2× nach ~11,5 s)
const MAX = 10000;

const multAt = (ms) => Math.floor(100 * Math.exp(K * Math.max(0, ms))) / 100;
const timeFor = (m) => Math.log(m) / K;

function crashPoint() {
  const c = Math.floor(99 / (1 - randFloat())) / 100;
  return Math.min(Math.max(1, c), MAX);
}

function pushRecent(p, crash) {
  const list = (p.active.crashRecent ||= []);
  list.unshift(crash);
  if (list.length > 15) list.length = 15;
}

function settle(p, st, status, at) {
  const payout = status === 'won' ? payoutFor(st.bet, at) : 0;
  p.balance += payout;
  profiles.record(p, 'crash', st.bet, payout, status === 'won' ? `ausgecasht bei ${at.toFixed(2)}× (Crash ${st.crash.toFixed(2)}×)` : `Crash bei ${st.crash.toFixed(2)}×`);
  pushRecent(p, st.crash);
  p.active.crashLast = { id: st.id, status, at, crash: st.crash, payout, bet: st.bet };
  delete p.active.crash;
}

/** Prüft, ob die laufende Runde inzwischen abgestürzt ist oder Auto-Cashout greift. */
function resolve(p, now = Date.now()) {
  const st = p.active.crash;
  if (!st) return;
  const elapsed = now - st.startedAt;
  if (st.auto && st.auto < st.crash && elapsed >= timeFor(st.auto)) return settle(p, st, 'won', st.auto);
  if (elapsed >= timeFor(st.crash)) return settle(p, st, 'lost', st.crash);
}

function view(p) {
  const st = p.active.crash;
  const base = { recent: p.active.crashRecent || [] };
  if (st) {
    const elapsed = Date.now() - st.startedAt;
    return { ...base, running: true, id: st.id, elapsed, multiplier: multAt(elapsed), bet: st.bet, auto: st.auto };
  }
  return { ...base, running: false, last: p.active.crashLast || null };
}

function info() {
  return { k: K, max: MAX };
}

function state(p) {
  resolve(p);
  return view(p);
}

function start(p, body) {
  resolve(p);
  if (p.active.crash) throw new GameError('Es läuft schon eine Runde.');
  const bet = parseBet(body.bet, p);
  let auto = null;
  if (body.auto !== undefined && body.auto !== null && body.auto !== '') {
    auto = Math.floor(Number(body.auto) * 100) / 100;
    if (!Number.isFinite(auto) || auto < 1.01 || auto > MAX) throw new GameError('Auto-Cashout muss zwischen 1,01 und 10.000 liegen.');
  }
  p.balance -= bet;
  let crash = crashPoint();
  // Admin-Steuerung: feste Vorgabe für diese Runde oder Glück/Pech
  const L = require('../luck');
  const forced = Number(L.takeNext(p, 'crash'));
  if (forced >= 1) crash = Math.floor(forced * 100) / 100;
  else {
    const luck = L.luckRoll(p);
    if (luck === 'lose') crash = 1 + require('../util').randInt(1, 15) / 100; // 1,01–1,14
    else if (luck === 'win') crash = Math.max(crash, auto ? auto + 0.5 : 25);
  }
  p.active.crash = { id: crypto.randomUUID(), bet, auto, crash, startedAt: Date.now() };
  resolve(p); // Absturz bei 1,00× sofort auswerten
  return view(p);
}

function cashout(p) {
  const now = Date.now();
  resolve(p, now);
  const st = p.active.crash;
  if (!st) {
    const last = p.active.crashLast;
    return { running: false, last, recent: p.active.crashRecent || [], late: true };
  }
  const m = multAt(now - st.startedAt);
  settle(p, st, 'won', m);
  return view(p);
}

module.exports = { info, state, start, cashout };
module.exports._internal = { crashPoint, multAt, timeFor, resolve };
