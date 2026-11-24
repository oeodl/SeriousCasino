// Live-Roulette: EIN gemeinsames Rad für alle. Wettphase (15 s) → Drehung (6 s) → Ergebnis (5 s).
// Gleiche Wetten und Auszahlungen wie das normale Roulette. Admin kann die nächste Zahl vorgeben.
const crypto = require('crypto');
const db = require('./db');
const profiles = require('./profiles');
const { randInt, GameError, checkMaxBet } = require('./util');
const { TYPES, colorOf } = require('./games/roulette')._internal;

const BET_MS = 15000, SPIN_MS = 6000, RESULT_MS = 5000;
let round = null;
const history = [];
const rig = { next: null };
const pending = () => (db.get().liveroulettePending ||= {});

function refundAfterRestart() {
  for (const [pid, amount] of Object.entries(pending())) { const p = db.get().profiles[pid]; if (p) p.balance += amount; }
  db.get().liveroulettePending = {};
  db.save();
}

function newRound() {
  round = { id: crypto.randomUUID(), phase: 'betting', until: Date.now() + BET_MS, bets: new Map(), number: null };
}

function settle() {
  const n = round.number;
  for (const b of round.bets.values()) {
    let payout = 0;
    for (const x of b.list) { const [check, mult] = TYPES[x.type]; if (check(n, x.value)) payout += x.amount * mult; }
    b.payout = payout;
    const p = db.get().profiles[b.pid];
    if (p) {
      p.balance += payout;
      profiles.record(p, 'liveroulette', b.total, payout, `Live-Roulette: ${n} (${{ red: 'Rot', black: 'Schwarz', green: 'Grün' }[colorOf(n)]})`);
    }
    delete pending()[b.pid];
  }
  history.unshift(n);
  if (history.length > 16) history.length = 16;
  db.save();
}

function tick() {
  const now = Date.now();
  if (!round) return newRound();
  if (round.phase === 'betting' && now >= round.until) {
    round.phase = 'spinning';
    round.until = now + SPIN_MS;
    if (rig.next !== null) { round.number = rig.next; round.rigged = true; rig.next = null; } else round.number = randInt(0, 37);
  }
  if (round.phase === 'spinning' && now >= round.until) {
    round.phase = 'result';
    round.until = now + RESULT_MS;
    settle();
  }
  if (round.phase === 'result' && now >= round.until) newRound();
}

function start() {
  refundAfterRestart();
  newRound();
  require('./util').safeInterval('liveroulette', tick, 100);
}

function state(viewerId) {
  tick();
  const now = Date.now();
  const mine = viewerId ? round.bets.get(viewerId) : null;
  return {
    id: round.id, phase: round.phase, timeLeft: Math.max(0, round.until - now), now,
    // Die Zahl wird erst mit Beginn der Drehung verraten (dann kann niemand mehr setzen)
    number: round.phase === 'betting' ? null : round.number,
    color: round.phase === 'betting' ? null : colorOf(round.number),
    players: [...round.bets.values()].map((b) => ({ name: b.name, total: b.total, payout: round.phase === 'result' ? b.payout : null, me: b.pid === viewerId }))
      .sort((a, b) => b.total - a.total),
    mine: mine ? { list: mine.list, total: mine.total, payout: round.phase === 'result' ? mine.payout : null } : null,
    history,
  };
}

function bet(p, body) {
  tick();
  if (round.phase !== 'betting') throw new GameError('Nichts geht mehr – warte auf die nächste Runde.');
  const list = Array.isArray(body.bets) ? body.bets : [];
  if (!list.length || list.length > 100) throw new GameError('Bitte Chips auf den Tisch legen.');
  const clean = list.map((b) => {
    const type = String(b?.type);
    if (!Object.hasOwn(TYPES, type)) throw new GameError('Unbekannte Wette.');
    const amount = Number(b.amount);
    if (!Number.isInteger(amount) || amount < 1) throw new GameError('Ungültiger Einsatz.');
    let value = null;
    if (type === 'straight') { value = Number(b.value); if (!Number.isInteger(value) || value < 0 || value > 36) throw new GameError('Ungültige Zahl.'); }
    if (type === 'dozen' || type === 'column') { value = Number(b.value); if (![1, 2, 3].includes(value)) throw new GameError('Ungültiges Feld.'); }
    return { type, value, amount };
  });
  const total = clean.reduce((a, b) => a + b.amount, 0);
  checkMaxBet(total + (round.bets.get(p.id)?.total || 0));
  if (total > p.balance) throw new GameError('Nicht genug Chips.');
  p.balance -= total;
  const cur = round.bets.get(p.id) || { pid: p.id, name: p.name, list: [], total: 0, payout: null };
  cur.list.push(...clean);
  cur.total += total;
  round.bets.set(p.id, cur);
  pending()[p.id] = cur.total;
  return state(p.id);
}

function adminState() {
  return { ...state(null), realNumber: round.number, rigged: !!round.rigged, nextRig: rig.next };
}

function adminRig(body) {
  if (body.clear) { rig.next = null; return adminState(); }
  const n = Number(body.number);
  if (!Number.isInteger(n) || n < 0 || n > 36) throw new GameError('Zahl 0 bis 36.');
  rig.next = n;
  return adminState();
}

module.exports = { start, state, bet, adminState, adminRig };
