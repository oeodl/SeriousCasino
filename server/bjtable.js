// Multiplayer-Blackjack: ein Tisch, bis zu 5 Plätze, ein gemeinsamer Dealer.
// Ablauf: Einsätze (15 s ab dem ersten Einsatz) → Karten → (zeigt der Dealer ein Ass: 10 s Versicherung)
// → jeder Spieler ist nacheinander dran (20 s pro Hand, sonst "Halten") → Dealer zieht bis 17 → Auszahlung → neue Runde.
// Blackjack 3:2, Verdoppeln auf 2 Karten (auch nach Teilen), Teilen bis 4 Hände (geteilte Asse: je eine Karte),
// Versicherung kostet den halben Einsatz und zahlt 2:1, wenn der Dealer Blackjack hat.
const crypto = require('crypto');
const db = require('./db');
const profiles = require('./profiles');
const { makeDeck, GameError, checkMaxBet } = require('./util');

const SEATS = 5, BET_MS = 15000, TURN_MS = 20000, INS_MS = 10000, DEALER_STEP_MS = 900, RESULT_MS = 7000, MAX_HANDS = 4;
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
const staked = (s) => (s.hands.length ? s.hands.reduce((a, h) => a + h.bet, 0) : s.bet) + (s.insurance || 0);
const inRound = (s) => s && s.hands.length > 0;
function syncPending(s) { const v = staked(s); if (v > 0) pending()[s.pid] = v; else delete pending()[s.pid]; }
const prof = (pid) => db.get().profiles[pid];

function refundAfterRestart() {
  for (const [pid, amount] of Object.entries(pending())) { const p = prof(pid); if (p) p.balance += amount; }
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
  T.seats.forEach((s) => { if (s) Object.assign(s, { bet: 0, hands: [], cur: 0, insurance: 0, insDecided: false, payout: null }); });
  // Wer zweimal nichts gesetzt hat, verlässt den Platz
  T.seats = T.seats.map((s) => (s && s.idle >= 2 ? null : s));
}

function start() {
  refundAfterRestart();
  T = { seats: new Array(SEATS).fill(null), shoe: makeDeck(6) };
  reset();
  require('./util').safeInterval('bjtable', tick, 200);
}

const newHand = (cards, bet, splitAces = false) => ({ cards, bet, done: false, doubled: false, splitAces, result: null, payout: null });

function deal(now) {
  const active = T.seats.filter((s) => s && s.bet > 0);
  T.seats.forEach((s) => { if (s && !s.bet) s.idle = (s.idle || 0) + 1; });
  for (const s of active) { s.idle = 0; s.hands = [newHand([], s.bet)]; s.cur = 0; }
  for (let k = 0; k < 2; k++) { for (const s of active) s.hands[0].cards.push(draw()); T.dealer.push(draw()); }
  for (const s of active) if (isBJ(s.hands[0].cards)) s.hands[0].done = true;
  T.turn = -1;
  if (T.dealer[0].r === 14) {
    // Dealer zeigt ein Ass → Versicherung anbieten (wer selbst Blackjack hat, braucht keine)
    T.phase = 'insurance';
    T.until = now + INS_MS;
    for (const s of active) s.insDecided = s.hands[0].done;
    if (active.every((s) => s.insDecided)) resolveInsurance(now);
    return;
  }
  T.phase = 'playing';
  if (isBJ(T.dealer)) return finishPlayers(now); // Dealer schaut nach: Blackjack → Runde sofort vorbei
  nextTurn(now);
}

function resolveInsurance(now) {
  T.phase = 'playing';
  T.seats.forEach((s) => { if (s) s.insDecided = true; });
  if (isBJ(T.dealer)) return finishPlayers(now);
  nextTurn(now);
}

/** Nächste offene Hand: erst die weiteren Hände des aktuellen Platzes (nach Teilen), dann der nächste Platz */
function nextTurn(now) {
  const cur = T.seats[T.turn];
  if (cur) {
    const k = cur.hands.findIndex((h) => !h.done);
    if (k >= 0) { cur.cur = k; T.until = now + TURN_MS; return; }
  }
  for (let i = T.turn + 1; i < SEATS; i++) {
    const s = T.seats[i];
    if (!inRound(s)) continue;
    const k = s.hands.findIndex((h) => !h.done);
    if (k >= 0) { T.turn = i; s.cur = k; T.until = now + TURN_MS; return; }
  }
  finishPlayers(now);
}

function finishPlayers(now) {
  T.turn = -1;
  T.phase = 'dealer';
  T.seats.forEach((s) => s?.hands.forEach((h) => (h.done = true)));
  // Dealer zieht nur, wenn noch eine Hand im Spiel ist (nicht überkauft, kein ungeteilter Blackjack)
  const alive = T.seats.some((s) => inRound(s) && s.hands.some((h) => total(h.cards).t <= 21 && !(s.hands.length === 1 && isBJ(h.cards))));
  if (alive && !isBJ(T.dealer)) while (total(T.dealer).t < 17) T.dealer.push(draw());
  T.until = now + Math.max(1, T.dealer.length - 1) * DEALER_STEP_MS;
}

function settle(now) {
  const d = total(T.dealer).t, dBJ = isBJ(T.dealer);
  for (const s of T.seats) {
    if (!inRound(s)) continue;
    let pay = 0;
    const parts = [];
    for (const h of s.hands) {
      const pt = total(h.cards).t, pBJ = s.hands.length === 1 && isBJ(h.cards);
      let hp = 0, res;
      if (pBJ && dBJ) { hp = h.bet; res = 'push'; }
      else if (pBJ) { hp = Math.floor(h.bet * 2.5); res = 'blackjack'; }
      else if (dBJ) { res = 'lose'; }
      else if (pt > 21) { res = 'bust'; }
      else if (d > 21 || pt > d) { hp = h.bet * 2; res = 'win'; }
      else if (pt === d) { hp = h.bet; res = 'push'; }
      else res = 'lose';
      h.result = res;
      h.payout = hp;
      pay += hp;
      parts.push(`${pt}`);
    }
    if (s.insurance && dBJ) s.insPaid = s.insurance * 3; else s.insPaid = 0;
    pay += s.insPaid;
    s.payout = pay;
    const p = prof(s.pid);
    if (p) {
      p.balance += pay;
      profiles.record(p, 'bjtable', staked(s), pay, `Blackjack-Tisch: ${parts.join(' / ')} vs ${dBJ ? 'BJ' : d}${s.insurance ? ` · Versicherung ${dBJ ? 'gewonnen' : 'verloren'}` : ''}`);
    }
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
  else if (T.phase === 'insurance' && now >= T.until) resolveInsurance(now); // keine Antwort = keine Versicherung
  else if (T.phase === 'playing' && T.turn >= 0 && now >= T.until) { // Zeit um → aktuelle Hand hält
    const s = T.seats[T.turn];
    if (s?.hands[s.cur]) s.hands[s.cur].done = true;
    nextTurn(now);
  } else if (T.phase === 'dealer' && now >= T.until) settle(now);
  else if (T.phase === 'result' && now >= T.until) reset();
}

function canSplit(s, p) {
  const h = s.hands[s.cur];
  return !!h && h.cards.length === 2 && val(h.cards[0]) === val(h.cards[1]) && s.hands.length < MAX_HANDS && !h.splitAces && (!p || p.balance >= h.bet);
}
function canDouble(s, p) {
  const h = s.hands[s.cur];
  return !!h && h.cards.length === 2 && !h.splitAces && total(h.cards).t < 21 && (!p || p.balance >= h.bet);
}

function view(viewerId) {
  tick();
  const now = Date.now();
  const hide = ['betting', 'insurance', 'playing'].includes(T.phase);
  const viewer = viewerId ? prof(viewerId) : null;
  return {
    round: T.round, phase: T.phase, now, timeLeft: T.until ? Math.max(0, T.until - now) : null, turn: T.turn, dealerStepMs: DEALER_STEP_MS,
    dealer: { cards: hide && T.dealer.length ? [T.dealer[0], null] : T.dealer, value: hide ? (T.dealer[0] ? total([T.dealer[0]]).t : 0) : total(T.dealer).t, blackjack: !hide && isBJ(T.dealer) },
    seats: T.seats.map((s, i) => {
      if (!s) return null;
      const me = s.pid === viewerId;
      const myTurn = me && T.phase === 'playing' && T.turn === i;
      return {
        seat: i, name: s.name, me, bet: s.hands.length ? staked(s) - (s.insurance || 0) : s.bet, cur: s.cur,
        hands: s.hands.map((h) => ({ cards: h.cards, bet: h.bet, value: total(h.cards).t, soft: total(h.cards).soft, doubled: h.doubled, done: h.done, result: h.result, payout: h.payout })),
        insurance: s.insurance || 0, insDecided: !!s.insDecided, insPaid: s.insPaid || 0, payout: s.payout,
        canSplit: myTurn && canSplit(s, viewer), canDouble: myTurn && canDouble(s, viewer),
      };
    }),
    mySeat: T.seats.findIndex((s) => s && s.pid === viewerId),
  };
}

function sit(p, body) {
  tick();
  if (T.seats.some((s) => s && s.pid === p.id)) throw new GameError('Du sitzt schon am Tisch.');
  const i = Number(body.seat);
  const idx = Number.isInteger(i) && i >= 0 && i < SEATS && !T.seats[i] ? i : T.seats.findIndex((s) => !s);
  if (idx < 0) throw new GameError('Der Tisch ist voll.');
  T.seats[idx] = { pid: p.id, name: p.name, bet: 0, hands: [], cur: 0, insurance: 0, insDecided: false, payout: null, idle: 0 };
  return view(p.id);
}

function leave(p) {
  const i = T.seats.findIndex((s) => s && s.pid === p.id);
  if (i < 0) throw new GameError('Du sitzt nicht am Tisch.');
  const s = T.seats[i];
  if (inRound(s) && T.phase !== 'result') throw new GameError('Erst die laufende Runde zu Ende spielen.');
  if (s.bet > 0 && T.phase === 'betting') { p.balance += s.bet; delete pending()[p.id]; }
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
  syncPending(s);
  if (!T.until) T.until = Date.now() + BET_MS;
  // Haben alle am Tisch gesetzt? Dann früher los (allein 6 s, damit noch jemand dazukommen kann)
  const seated = T.seats.filter(Boolean).length;
  if (T.seats.every((x) => !x || x.bet > 0)) T.until = Math.min(T.until, Date.now() + (seated > 1 ? 3000 : 6000));
  return view(p.id);
}

function insure(p, body) {
  tick();
  const s = T.seats.find((x) => x && x.pid === p.id);
  if (T.phase !== 'insurance' || !inRound(s)) throw new GameError('Versicherung ist gerade nicht möglich.');
  if (s.insDecided) throw new GameError('Du hast dich schon entschieden.');
  if (body.take) {
    const cost = Math.floor(s.hands[0].bet / 2);
    if (cost < 1) throw new GameError('Der Einsatz ist zu klein für eine Versicherung.');
    if (p.balance < cost) throw new GameError('Nicht genug Chips für die Versicherung.');
    p.balance -= cost;
    s.insurance = cost;
    syncPending(s);
  }
  s.insDecided = true;
  if (T.seats.every((x) => !inRound(x) || x.insDecided)) resolveInsurance(Date.now());
  return view(p.id);
}

function act(p, body) {
  tick();
  const s = T.seats[T.turn];
  if (T.phase !== 'playing' || !s || s.pid !== p.id) throw new GameError('Du bist nicht dran.');
  const now = Date.now();
  const h = s.hands[s.cur];
  const a = String(body.action);
  if (a === 'hit') {
    h.cards.push(draw());
    if (total(h.cards).t >= 21) { h.done = true; nextTurn(now); }
  } else if (a === 'stand') {
    h.done = true; nextTurn(now);
  } else if (a === 'double') {
    if (!canDouble(s)) throw new GameError('Verdoppeln geht nur mit den ersten 2 Karten.');
    if (p.balance < h.bet) throw new GameError('Nicht genug Chips zum Verdoppeln.');
    p.balance -= h.bet; h.bet *= 2; h.doubled = true;
    h.cards.push(draw()); h.done = true;
    syncPending(s);
    nextTurn(now);
  } else if (a === 'split') {
    if (!canSplit(s)) throw new GameError('Teilen geht nur mit zwei gleichwertigen Karten (max. 4 Hände).');
    if (p.balance < h.bet) throw new GameError('Nicht genug Chips zum Teilen.');
    p.balance -= h.bet;
    const aces = h.cards[0].r === 14;
    const second = newHand([h.cards.pop()], h.bet, aces);
    h.splitAces = aces;
    h.cards.push(draw());
    second.cards.push(draw());
    s.hands.splice(s.cur + 1, 0, second);
    for (const x of [h, second]) if (aces || total(x.cards).t === 21) x.done = true;
    syncPending(s);
    if (h.done) nextTurn(now); else T.until = now + TURN_MS;
  } else throw new GameError('Unbekannte Aktion.');
  return view(p.id);
}

module.exports = { start, view, sit, leave, bet, act, insure };
module.exports._internal = { total, isBJ };
