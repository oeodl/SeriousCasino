// Jackpot: Alle zahlen in einen gemeinsamen Topf. Sobald mindestens 2 Spieler dabei sind, läuft ein 30-s-Countdown.
// Dann wird ein Gewinner gezogen – je mehr man eingezahlt hat, desto größer die Chance. Der ganze Topf geht an den Gewinner.
// Kein Hausanteil. Admin kann den nächsten Gewinner vorgeben.
const crypto = require('crypto');
const db = require('./db');
const profiles = require('./profiles');
const { randInt, GameError, checkMaxBet } = require('./util');

const COUNTDOWN_MS = 30000, DRAW_MS = 6000, RESULT_MS = 6000, MIN_DEPOSIT = 10;
let round = null;
const history = [];
const rig = { next: null };
const pending = () => (db.get().jackpotPending ||= {});
const COLORS = ['#22e584', '#e3b341', '#4dabf7', '#ff6b6b', '#c084fc', '#ffa94d', '#63e6be', '#f783ac', '#a9e34b', '#74c0fc'];

function refundAfterRestart() {
  for (const [pid, amount] of Object.entries(pending())) { const p = db.get().profiles[pid]; if (p) p.balance += amount; }
  db.get().jackpotPending = {};
  db.save();
}

function newRound() {
  round = { id: crypto.randomUUID(), phase: 'open', until: null, entries: [], winner: null };
}

const pot = () => round.entries.reduce((a, e) => a + e.amount, 0);

function draw(now) {
  round.phase = 'drawing';
  round.until = now + DRAW_MS;
  const total = pot();
  let winnerIdx;
  const forced = rig.next ? round.entries.findIndex((e) => e.name.toLowerCase() === rig.next.toLowerCase()) : -1;
  if (forced >= 0) { winnerIdx = forced; round.rigged = true; rig.next = null; }
  else {
    let r = randInt(0, total);
    winnerIdx = round.entries.findIndex((e) => (r -= e.amount) < 0);
  }
  // Position des Zeigers (0–1) innerhalb des Gewinner-Stücks – damit alle dieselbe Animation sehen
  const before = round.entries.slice(0, winnerIdx).reduce((a, e) => a + e.amount, 0);
  round.ticket = (before + round.entries[winnerIdx].amount * (0.15 + Math.random() * 0.7)) / total;
  round.winner = winnerIdx;
}

function settle() {
  const total = pot();
  const w = round.entries[round.winner];
  for (const e of round.entries) {
    const p = db.get().profiles[e.pid];
    if (!p) continue;
    const payout = e === w ? total : 0;
    p.balance += payout;
    profiles.record(p, 'jackpot', e.amount, payout, `Jackpot (${round.entries.length} Spieler, Topf ${total}): ${e === w ? 'gewonnen' : `Gewinner ${w.name}`}`);
    delete pending()[e.pid];
  }
  history.unshift({ name: w.name, pot: total, chance: Math.round((w.amount / total) * 1000) / 10 });
  if (history.length > 10) history.length = 10;
  db.save();
}

function tick() {
  const now = Date.now();
  if (!round) return newRound();
  if (round.phase === 'open' && round.entries.length >= 2 && !round.until) round.until = now + COUNTDOWN_MS;
  if (round.phase === 'open' && round.until && now >= round.until) draw(now);
  if (round.phase === 'drawing' && now >= round.until) { round.phase = 'result'; round.until = now + RESULT_MS; settle(); }
  if (round.phase === 'result' && now >= round.until) newRound();
}

function start() {
  refundAfterRestart();
  newRound();
  require('./util').safeInterval('jackpot', tick, 200);
}

function state(viewerId) {
  tick();
  const now = Date.now();
  const total = pot();
  return {
    id: round.id, phase: round.phase, now, pot: total,
    timeLeft: round.until ? Math.max(0, round.until - now) : null,
    entries: round.entries.map((e, i) => ({ name: e.name, amount: e.amount, chance: total ? e.amount / total : 0, color: COLORS[i % COLORS.length], me: e.pid === viewerId })),
    winner: round.phase === 'open' ? null : round.winner,
    ticket: round.phase === 'open' ? null : round.ticket,
    history,
  };
}

function deposit(p, body) {
  tick();
  if (round.phase !== 'open') throw new GameError('Die Ziehung läuft – gleich startet ein neuer Topf.');
  const amount = Number(body.amount);
  if (!Number.isInteger(amount) || amount < MIN_DEPOSIT) throw new GameError(`Mindestens ${MIN_DEPOSIT} Chips.`);
  checkMaxBet(amount + (round.entries.find((x) => x.pid === p.id)?.amount || 0));
  if (amount > p.balance) throw new GameError('Nicht genug Chips.');
  p.balance -= amount;
  let e = round.entries.find((x) => x.pid === p.id);
  if (!e) { e = { pid: p.id, name: p.name, amount: 0 }; round.entries.push(e); }
  e.amount += amount;
  pending()[p.id] = e.amount;
  return state(p.id);
}

/** Solange man allein im Topf ist, darf man seine Einzahlung zurücknehmen */
function withdraw(p) {
  tick();
  if (round.phase !== 'open' || round.entries.length !== 1 || round.entries[0].pid !== p.id) throw new GameError('Zurücknehmen geht nur, solange du allein im Topf bist.');
  p.balance += round.entries[0].amount;
  round.entries = [];
  delete pending()[p.id];
  return state(p.id);
}

function adminState() {
  return { ...state(null), nextRig: rig.next, rigged: !!round.rigged };
}

function adminRig(body) {
  rig.next = body.clear ? null : String(body.name || '').trim() || null;
  return adminState();
}

module.exports = { start, state, deposit, withdraw, adminState, adminRig };
