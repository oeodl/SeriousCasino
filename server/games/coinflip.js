// Münzwurf-Serie: Kopf oder Zahl. Jeder richtige Tipp multipliziert den Gewinn mit 1,98.
// Nach jedem Treffer: weiterspielen oder auscashen.
const { randInt, parseBet, payoutFor, GameError } = require('../util');
const profiles = require('../profiles');

const STEP = 1.98;
const MAX_STREAK = 20;
const multFor = (streak) => Math.round(Math.pow(STEP, streak) * 10000) / 10000;

function view(st) {
  return {
    running: true,
    bet: st.bet,
    streak: st.streak,
    flips: st.flips,
    multiplier: multFor(st.streak),
    next: multFor(st.streak + 1),
    payoutNow: st.streak ? payoutFor(st.bet, multFor(st.streak)) : 0,
  };
}

function state(p) {
  return p.active.coinflip ? view(p.active.coinflip) : { running: false };
}

function start(p, body) {
  if (p.active.coinflip) throw new GameError('Es läuft schon eine Serie.');
  const bet = parseBet(body.bet, p);
  p.balance -= bet;
  p.active.coinflip = { bet, streak: 0, flips: [] };
  return view(p.active.coinflip);
}

function end(p, st, won, extra = {}) {
  const mult = won ? multFor(st.streak) : 0;
  const payout = won ? payoutFor(st.bet, mult) : 0;
  p.balance += payout;
  profiles.record(p, 'coinflip', st.bet, payout, won ? `${st.streak}er-Serie, ${mult}×` : `verloren nach ${st.streak} Treffer(n)`);
  delete p.active.coinflip;
  return { running: false, won, payout, multiplier: mult, streak: st.streak, flips: st.flips, bet: st.bet, ...extra };
}

function flip(p, body) {
  const st = p.active.coinflip;
  if (!st) throw new GameError('Keine laufende Serie.');
  const side = body.side === 'heads' ? 'heads' : body.side === 'tails' ? 'tails' : null;
  if (!side) throw new GameError('Kopf oder Zahl?');
  let result = randInt(0, 2) === 0 ? 'heads' : 'tails';
  // Admin-Steuerung: fester nächster Wurf oder Glück/Pech
  const L = require('../luck');
  const forced = L.takeNext(p, 'coinflip');
  const other = side === 'heads' ? 'tails' : 'heads';
  const luck = L.luckRoll(p);
  if (forced === 'heads' || forced === 'tails') result = forced;
  else if (luck === 'win') result = side;
  else if (luck === 'lose') result = other;
  st.flips.push({ side, result });
  if (result !== side) return end(p, st, false, { result });
  st.streak++;
  if (st.streak >= MAX_STREAK) return end(p, st, true, { result, max: true });
  return { ...view(st), result };
}

function cashout(p) {
  const st = p.active.coinflip;
  if (!st) throw new GameError('Keine laufende Serie.');
  if (!st.streak) throw new GameError('Erst mindestens einmal richtig tippen.');
  return end(p, st, true);
}

module.exports = { state, start, flip, cashout };
module.exports._internal = { multFor };
