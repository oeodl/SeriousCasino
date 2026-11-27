// Turm: 8 Stockwerke. Pro Stockwerk ein sicheres Feld wählen – Fallen beenden die Runde.
// Multiplikator nach k Stockwerken = 0,99 / P(sicher)^k. Jederzeit auscashen.
const { shuffle, parseBet, payoutFor, GameError } = require('../util');
const profiles = require('../profiles');

const LEVELS = 8;
// Schwierigkeit: Felder pro Reihe, davon Fallen
const MODES = {
  easy: { cols: 4, traps: 1, name: 'leicht' },
  medium: { cols: 3, traps: 1, name: 'mittel' },
  hard: { cols: 2, traps: 1, name: 'schwer' },
  expert: { cols: 3, traps: 2, name: 'Experte' },
};

function multiplier(mode, level) {
  if (level === 0) return 1;
  const { cols, traps } = MODES[mode];
  const pSafe = (cols - traps) / cols;
  return Math.floor((0.99 / Math.pow(pSafe, level)) * 100 + 1e-9) / 100;
}

function info() {
  const out = {};
  for (const [k, m] of Object.entries(MODES)) {
    out[k] = { ...m, mults: Array.from({ length: LEVELS + 1 }, (_, i) => multiplier(k, i)) };
  }
  return { levels: LEVELS, modes: out };
}

function view(st) {
  return {
    running: true,
    bet: st.bet,
    mode: st.mode,
    level: st.picks.length,
    picks: st.picks,
    multiplier: multiplier(st.mode, st.picks.length),
    payoutNow: st.picks.length ? payoutFor(st.bet, multiplier(st.mode, st.picks.length)) : 0,
  };
}

function state(p) {
  return p.active.tower ? view(p.active.tower) : { running: false };
}

function start(p, body) {
  if (p.active.tower) throw new GameError('Es läuft schon eine Runde.');
  const mode = String(body.mode);
  if (!Object.hasOwn(MODES, mode)) throw new GameError('Ungültige Schwierigkeit.');
  const bet = parseBet(body.bet, p);
  p.balance -= bet;
  const { cols, traps } = MODES[mode];
  const trapRows = Array.from({ length: LEVELS }, () => shuffle([...Array(cols).keys()]).slice(0, traps));
  p.active.tower = { bet, mode, traps: trapRows, picks: [] };
  return view(p.active.tower);
}

function end(p, st, won, extra = {}) {
  const lvl = st.picks.length;
  const mult = won ? multiplier(st.mode, lvl) : 0;
  const payout = won ? payoutFor(st.bet, mult) : 0;
  p.balance += payout;
  profiles.record(p, 'tower', st.bet, payout, `${MODES[st.mode].name}, Stockwerk ${lvl}${won ? `, ${mult.toFixed(2)}×` : ', Falle'}`);
  delete p.active.tower;
  return { running: false, won, payout, multiplier: mult, mode: st.mode, picks: st.picks, traps: st.traps, bet: st.bet, ...extra };
}

function pick(p, body) {
  const st = p.active.tower;
  if (!st) throw new GameError('Keine laufende Runde.');
  const col = Number(body.col);
  if (!Number.isInteger(col) || col < 0 || col >= MODES[st.mode].cols) throw new GameError('Ungültiges Feld.');
  const lvl = st.picks.length;
  // Admin-Steuerung: "Pech" → Falle genau hier, "Glück" → Falle woanders hin
  const luck = require('../luck').roundLuck(p, st);
  const { cols } = MODES[st.mode];
  if (luck === 'lose' && !st.traps[lvl].includes(col)) st.traps[lvl][0] = col;
  else if (luck === 'win' && st.traps[lvl].includes(col)) {
    const free = [...Array(cols).keys()].filter((c) => c !== col && !st.traps[lvl].includes(c));
    if (free.length) st.traps[lvl][st.traps[lvl].indexOf(col)] = free[0];
  }
  if (st.traps[lvl].includes(col)) return end(p, st, false, { trapAt: { level: lvl, col } });
  st.picks.push(col);
  if (st.picks.length === LEVELS) return end(p, st, true, { top: true });
  return view(st);
}

function cashout(p) {
  const st = p.active.tower;
  if (!st) throw new GameError('Keine laufende Runde.');
  if (!st.picks.length) throw new GameError('Erst mindestens ein Stockwerk schaffen.');
  return end(p, st, true);
}

module.exports = { info, state, start, pick, cashout };
module.exports._internal = { multiplier, MODES };
