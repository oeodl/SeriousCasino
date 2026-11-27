// Mines: 5×5-Feld, 1–24 Minen. Jedes sichere Feld erhöht den Multiplikator (faire Quote × 0,99).
const { shuffle, parseBet, payoutFor, GameError } = require('../util');
const profiles = require('../profiles');

const TILES = 25;

/** Multiplikator nach `safe` aufgedeckten Feldern bei `mines` Minen (auf 2 Nachkommastellen abgerundet) */
function multiplier(mines, safe) {
  let m = 0.99;
  for (let i = 0; i < safe; i++) m *= (TILES - i) / (TILES - mines - i);
  return safe === 0 ? 1 : Math.floor(m * 100 + 1e-9) / 100;
}

function view(st, extra = {}) {
  const safe = st.revealed.length;
  const maxSafe = TILES - st.mines;
  return {
    running: true,
    bet: st.bet,
    mines: st.mines,
    revealed: st.revealed,
    multiplier: multiplier(st.mines, safe),
    next: safe < maxSafe ? multiplier(st.mines, safe + 1) : null,
    payoutNow: safe ? payoutFor(st.bet, multiplier(st.mines, safe)) : 0,
    ...extra,
  };
}

function info() {
  const table = {};
  for (let m = 1; m <= 24; m++) table[m] = Array.from({ length: TILES - m + 1 }, (_, k) => multiplier(m, k));
  return { tiles: TILES, table };
}

function state(p) {
  const st = p.active.mines;
  return st ? view(st) : { running: false };
}

function start(p, body) {
  if (p.active.mines) throw new GameError('Es läuft schon eine Runde.');
  const mines = Number(body.mines);
  if (!Number.isInteger(mines) || mines < 1 || mines > 24) throw new GameError('Minen: 1 bis 24.');
  const bet = parseBet(body.bet, p);
  p.balance -= bet;
  const positions = shuffle([...Array(TILES).keys()]).slice(0, mines);
  p.active.mines = { bet, mines, positions, revealed: [] };
  return view(p.active.mines);
}

function end(p, st, won) {
  const mult = won ? multiplier(st.mines, st.revealed.length) : 0;
  const payout = won ? payoutFor(st.bet, mult) : 0;
  p.balance += payout;
  profiles.record(p, 'mines', st.bet, payout, `${st.mines} Minen, ${st.revealed.length} Diamant(en)${won ? `, ${mult.toFixed(2)}×` : ', Mine getroffen'}`);
  delete p.active.mines;
  return { running: false, won, payout, multiplier: mult, mines: st.mines, positions: st.positions, revealed: st.revealed, bet: st.bet };
}

function reveal(p, body) {
  const st = p.active.mines;
  if (!st) throw new GameError('Keine laufende Runde.');
  const idx = Number(body.index);
  if (!Number.isInteger(idx) || idx < 0 || idx >= TILES) throw new GameError('Ungültiges Feld.');
  if (st.revealed.includes(idx)) throw new GameError('Feld ist schon aufgedeckt.');
  // Admin-Steuerung: bei "Pech" liegt unter dem Feld eine Mine, bei "Glück" nie
  const luck = require('../luck').roundLuck(p, st);
  if (luck === 'lose' && !st.positions.includes(idx)) {
    st.positions[0] = idx;
  } else if (luck === 'win' && st.positions.includes(idx)) {
    const free = [...Array(TILES).keys()].filter((i) => i !== idx && !st.positions.includes(i) && !st.revealed.includes(i));
    if (free.length) st.positions[st.positions.indexOf(idx)] = free[require('../util').randInt(0, free.length)];
  }
  if (st.positions.includes(idx)) {
    return { ...end(p, st, false), hit: idx };
  }
  st.revealed.push(idx);
  if (st.revealed.length === TILES - st.mines) return { ...end(p, st, true), auto: true };
  return view(st);
}

function cashout(p) {
  const st = p.active.mines;
  if (!st) throw new GameError('Keine laufende Runde.');
  if (!st.revealed.length) throw new GameError('Deck erst mindestens ein Feld auf.');
  return end(p, st, true);
}

module.exports = { info, state, start, reveal, cashout };
module.exports._internal = { multiplier };
