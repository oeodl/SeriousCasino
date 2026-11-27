// Hi-Lo: Ist die nächste Karte höher oder niedriger? Jeder Treffer erhöht den Multiplikator.
// Unendlich viele Decks (jede Karte gleich wahrscheinlich). Ass = 1 (niedrigste), König = 13.
// Multiplikator pro Schritt = 0,99 / Trefferwahrscheinlichkeit. Gleicher Rang = verloren.
const { randInt, parseBet, payoutFor, GameError } = require('../util');
const profiles = require('../profiles');

const SUITS = ['♠', '♥', '♦', '♣'];
const rankOf = (c) => (c.r === 14 ? 1 : c.r); // Ass niedrig
function drawCard() {
  const r = randInt(1, 14); // 1..13
  return { r: r === 1 ? 14 : r, s: SUITS[randInt(0, 4)] };
}
const pHigher = (c) => (13 - rankOf(c)) / 13;
const pLower = (c) => (rankOf(c) - 1) / 13;
const stepMult = (pr) => (pr > 0 ? 0.99 / pr : 0);
const MAX_SKIPS = 30;

function view(st, extra = {}) {
  const c = st.cards[st.cards.length - 1];
  return {
    running: true,
    bet: st.bet,
    cards: st.cards,
    multiplier: st.mult,
    payoutNow: st.steps ? payoutFor(st.bet, st.mult) : 0,
    steps: st.steps,
    higher: { chance: pHigher(c), mult: stepMult(pHigher(c)) },
    lower: { chance: pLower(c), mult: stepMult(pLower(c)) },
    skipsLeft: MAX_SKIPS - st.skips,
    ...extra,
  };
}

function state(p) {
  return p.active.hilo ? view(p.active.hilo) : { running: false };
}

function start(p, body) {
  if (p.active.hilo) throw new GameError('Es läuft schon eine Runde.');
  const bet = parseBet(body.bet, p);
  p.balance -= bet;
  p.active.hilo = { bet, cards: [drawCard()], mult: 1, steps: 0, skips: 0 };
  return view(p.active.hilo);
}

function end(p, st, won) {
  const payout = won ? payoutFor(st.bet, st.mult) : 0;
  p.balance += payout;
  profiles.record(p, 'hilo', st.bet, payout, won ? `${st.steps} Treffer, ${st.mult.toFixed(2)}×` : `verloren nach ${st.steps} Treffer(n)`);
  delete p.active.hilo;
  return { running: false, won, payout, multiplier: won ? st.mult : 0, cards: st.cards, bet: st.bet };
}

function guess(p, body) {
  const st = p.active.hilo;
  if (!st) throw new GameError('Keine laufende Runde.');
  const dir = body.dir;
  const cur = st.cards[st.cards.length - 1];
  const pr = dir === 'higher' ? pHigher(cur) : dir === 'lower' ? pLower(cur) : -1;
  if (pr < 0) throw new GameError('Höher oder niedriger?');
  if (pr === 0) throw new GameError('Das geht bei dieser Karte nicht.');
  let next = drawCard();
  // Admin-Steuerung: feste nächste Karte (Rang 1–13) oder Glück/Pech
  const L = require('../luck');
  const forced = L.takeNext(p, 'hilo');
  let luck = 'normal';
  const r0 = rankOf(cur);
  const fits = (r) => (dir === 'higher' ? r > r0 : r < r0);
  const card = (r) => ({ r: r === 1 ? 14 : r, s: SUITS[randInt(0, 4)] });
  if (forced) next = card(Number(forced));
  else if ((luck = L.roundLuck(p, st)) !== 'normal') {
    const want = luck === 'win';
    const opts = [...Array(13).keys()].map((i) => i + 1).filter((r) => fits(r) === want);
    if (opts.length) next = card(opts[randInt(0, opts.length)]);
  }
  st.cards.push(next);
  if (st.cards.length > 60) st.cards.splice(0, st.cards.length - 60);
  const ok = dir === 'higher' ? rankOf(next) > rankOf(cur) : rankOf(next) < rankOf(cur);
  if (!ok) return end(p, st, false);
  st.mult = Math.min(st.mult * stepMult(pr), 1e6);
  st.steps++;
  return view(st);
}

function skip(p) {
  const st = p.active.hilo;
  if (!st) throw new GameError('Keine laufende Runde.');
  if (st.skips >= MAX_SKIPS) throw new GameError('Keine Überspringen mehr übrig.');
  st.skips++;
  st.cards.push(drawCard());
  return view(st);
}

function cashout(p) {
  const st = p.active.hilo;
  if (!st) throw new GameError('Keine laufende Runde.');
  if (!st.steps) throw new GameError('Erst mindestens einmal richtig tippen.');
  return end(p, st, true);
}

module.exports = { state, start, guess, skip, cashout };
module.exports._internal = { pHigher, pLower, stepMult };
