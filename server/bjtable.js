// Multiplayer-Blackjack: ein Tisch, bis zu 5 Plätze, ein gemeinsamer Dealer.
// Ablauf: Einsätze (15 s ab dem ersten Einsatz) → Karten → jeder Spieler ist nacheinander dran (20 s, sonst "Halten")
// → Dealer zieht bis 17 → Auszahlung → neue Runde. Blackjack 3:2, Verdoppeln auf 2 Karten (kein Teilen am Tisch).
const crypto = require('crypto');
const db = require('./db');
const profiles = require('./profiles');
const { makeDeck, GameError, checkMaxBet } = require('./util');

const SEATS = 5, BET_MS = 15000, TURN_MS = 20000, DEALER_STEP_MS = 900, RESULT_MS = 6000;
const val = (c) => (c.r === 14 ? 11 : c.r >= 10 ? 10 : c.r);
function total(cards) {
  let t = 0, a = 0;
  for (const c of cards) { t += val(c); if (c.r === 14) a++; }
  while (t > 21 && a) { t -= 10; a--; }
  return { t, soft: a > 0 };
}
const isBJ = (cards) => cards.length === 2 && total(cards).t === 21;

let T = null;
const pending = () => (db.get().bjtablePending ||= {});

function refundAfterRestart() {
  for (const [pid, amount] of Object.entries(pending())) { const p = db.get().profiles[pid]; if (p) p.balance += amount; }
  db.get().bjtablePending = {};
  db.save();
}

function draw() {
  if (T.shoe.length < 60) T.shoe = makeDeck(6);
  return T.shoe.pop();
}

function reset() {
  T.phase = 'betting';
  T.until = null; // Timer startet mit dem ersten Einsatz
  T.dealer = [];
  T.turn = -1;
  T.round = crypto.randomUUID();
  T.seats.forEach((s) => { if (s) { s.bet = 0; s.cards = []; s.done = false; s.result = null; s.payout = null; s.doubled = false; } });
  // Wer zweimal nichts gesetzt hat, verlässt den Platz
  T.seats = T.seats.map((s) => (s && s.idle >= 2 ? null : s));
}

function start() {
  refundAfterRestart();
  T = { seats: new Array(SEATS).fill(null), shoe: makeDeck(6) };
  reset();
  require('./util').safeInterval('bjtable', tick, 200);
}

function deal(now) {
  T.phase = 'playing';
  const active = T.seats.filter((s) => s && s.bet > 0);
  T.seats.forEach((s) => { if (s && !s.bet) s.idle = (s.idle || 0) + 1; });
  for (let k = 0; k < 2; k++) { for (const s of active) s.cards.push(draw()); T.dealer.push(draw()); }
  for (const s of active) { s.idle = 0; if (isBJ(s.cards)) s.done = true; }
  if (isBJ(T.dealer)) { active.forEach((s) => (s.done = true)); return finishPlayers(now); }
  nextTurn(now);
}

function nextTurn(now) {
  for (let i = T.turn + 1; i < SEATS; i++) {
    const s = T.seats[i];
    if (s && s.bet > 0 && !s.done) { T.turn = i; T.until = now + TURN_MS; return; }
  }
  finishPlayers(now);
}

function finishPlayers(now) {
  T.turn = -1;
  T.phase = 'dealer';
  // Dealer zieht nur, wenn noch jemand nicht überkauft ist
  const alive = T.seats.some((s) => s && s.bet > 0 && total(s.cards).t <= 21 && !isBJ(s.cards));
  if (alive && !isBJ(T.dealer)) while (total(T.dealer).t < 17) T.dealer.push(draw());
  T.until = now + Math.max(1, T.dealer.length - 1) * DEALER_STEP_MS;
}

function settle(now) {
  const d = total(T.dealer).t, dBJ = isBJ(T.dealer);
  for (const s of T.seats) {
    if (!s || !s.bet) continue;
    const pt = total(s.cards).t, pBJ = isBJ(s.cards);
    let pay = 0, res;
    if (pBJ && dBJ) { pay = s.bet; res = 'push'; }
    else if (pBJ) { pay = Math.floor(s.bet * 2.5); res = 'blackjack'; }
    else if (dBJ) { res = 'lose'; }
    else if (pt > 21) { res = 'bust'; }
    else if (d > 21 || pt > d) { pay = s.bet * 2; res = 'win'; }
    else if (pt === d) { pay = s.bet; res = 'push'; }
    else res = 'lose';
    s.payout = pay;
    s.result = res;
    const p = db.get().profiles[s.pid];
    if (p) { p.balance += pay; profiles.record(p, 'bjtable', s.bet, pay, `Blackjack-Tisch: ${pt} vs ${dBJ ? 'BJ' : d}`); }
    delete pending()[s.pid];
  }
  T.phase = 'result';
  T.until = now + RESULT_MS;
  db.save();
}

function tick() {
  if (!T) return;
  const now = Date.now();
  if (T.phase === 'betting' && T.until && now >= T.until) deal(now);
  else if (T.phase === 'playing' && T.turn >= 0 && now >= T.until) { T.seats[T.turn].done = true; nextTurn(now); } // Zeit um → Halten
  else if (T.phase === 'dealer' && now >= T.until) settle(now);
  else if (T.phase === 'result' && now >= T.until) reset();
}

function view(viewerId) {
  tick();
  const now = Date.now();
  const hide = T.phase === 'playing' || (T.phase === 'betting');
  return {
    round: T.round, phase: T.phase, now, timeLeft: T.until ? Math.max(0, T.until - now) : null, turn: T.turn, dealerStepMs: DEALER_STEP_MS,
    dealer: { cards: hide && T.dealer.length ? [T.dealer[0], null] : T.dealer, value: hide ? (T.dealer[0] ? total([T.dealer[0]]).t : 0) : total(T.dealer).t },
    seats: T.seats.map((s, i) => (s ? {
      seat: i, name: s.name, me: s.pid === viewerId, bet: s.bet, cards: s.cards, value: total(s.cards).t, soft: total(s.cards).soft,
      done: s.done, result: s.result, payout: s.payout, doubled: s.doubled,
    } : null)),
    mySeat: T.seats.findIndex((s) => s && s.pid === viewerId),
  };
}

function sit(p, body) {
  tick();
  if (T.seats.some((s) => s && s.pid === p.id)) throw new GameError('Du sitzt schon am Tisch.');
  const i = Number(body.seat);
  const idx = Number.isInteger(i) && i >= 0 && i < SEATS && !T.seats[i] ? i : T.seats.findIndex((s) => !s);
  if (idx < 0) throw new GameError('Der Tisch ist voll.');
  T.seats[idx] = { pid: p.id, name: p.name, bet: 0, cards: [], done: false, idle: 0 };
  return view(p.id);
}

function leave(p) {
  const i = T.seats.findIndex((s) => s && s.pid === p.id);
  if (i < 0) throw new GameError('Du sitzt nicht am Tisch.');
  if (T.seats[i].bet > 0 && T.phase !== 'betting' && T.phase !== 'result') throw new GameError('Erst die laufende Runde zu Ende spielen.');
  if (T.seats[i].bet > 0 && T.phase === 'betting') { p.balance += T.seats[i].bet; delete pending()[p.id]; }
  T.seats[i] = null;
  return view(p.id);
}

function bet(p, body) {
  tick();
  if (T.phase !== 'betting') throw new GameError('Gerade läuft eine Runde – gleich geht es weiter.');
  let s = T.seats.find((x) => x && x.pid === p.id);
  if (!s) { sit(p, {}); s = T.seats.find((x) => x && x.pid === p.id); }
  const amount = Number(body.amount);
  if (!Number.isInteger(amount) || amount < 1) throw new GameError('Ungültiger Einsatz.');
  checkMaxBet(s.bet + amount);
  if (amount > p.balance) throw new GameError('Nicht genug Chips.');
  p.balance -= amount;
  s.bet += amount;
  pending()[p.id] = s.bet;
  if (!T.until) T.until = Date.now() + BET_MS;
  // Haben alle am Tisch gesetzt? Dann früher los (allein 6 s, damit noch jemand dazukommen kann)
  const seated = T.seats.filter(Boolean).length;
  if (T.seats.every((x) => !x || x.bet > 0)) T.until = Math.min(T.until, Date.now() + (seated > 1 ? 3000 : 6000));
  return view(p.id);
}

function act(p, body) {
  tick();
  const s = T.seats[T.turn];
  if (T.phase !== 'playing' || !s || s.pid !== p.id) throw new GameError('Du bist nicht dran.');
  const now = Date.now();
  const a = String(body.action);
  if (a === 'hit') {
    s.cards.push(draw());
    if (total(s.cards).t >= 21) { s.done = true; nextTurn(now); }
  } else if (a === 'stand') {
    s.done = true; nextTurn(now);
  } else if (a === 'double') {
    if (s.cards.length !== 2) throw new GameError('Verdoppeln nur mit 2 Karten.');
    if (p.balance < s.bet) throw new GameError('Nicht genug Chips zum Verdoppeln.');
    p.balance -= s.bet; s.bet *= 2; s.doubled = true; pending()[p.id] = s.bet;
    s.cards.push(draw()); s.done = true; nextTurn(now);
  } else throw new GameError('Unbekannte Aktion.');
  return view(p.id);
}

module.exports = { start, view, sit, leave, bet, act };
module.exports._internal = { total, isBJ };
