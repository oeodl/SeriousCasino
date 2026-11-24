// Hilfsfunktionen: Zufall (crypto.randomInt), Einsatzprüfung, Kartendecks.
const crypto = require('crypto');

class GameError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

/** Ganzzahl im Bereich [min, max) – kryptografisch sicher */
function randInt(min, max) {
  return crypto.randomInt(min, max);
}

/** Fisher-Yates-Mischen mit crypto.randomInt */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Gleichverteilte Zahl in [0, 1) mit 47 Bit Auflösung (randomInt erlaubt max. 2^48 - 1) */
function randFloat() {
  return crypto.randomInt(0, 2 ** 47) / 2 ** 47;
}

/** Prüft einen Einsatz (ganze Chips, >= min, <= Guthaben) */
// Höchsteinsatz pro Runde (Summe aller Einzelwetten) – hält Zahlen klein und genau
const MAX_BET = 1_000_000_000;
function checkMaxBet(total) {
  if (total > MAX_BET) throw new GameError(`Höchstens ${MAX_BET.toLocaleString('de-DE')} Chips Einsatz pro Runde.`);
}

function parseBet(value, profile, min = 1) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min) throw new GameError(`Einsatz muss eine ganze Zahl ab ${min} sein.`);
  checkMaxBet(n);
  if (n > profile.balance) throw new GameError('Nicht genug Chips für diesen Einsatz.');
  return n;
}

/** Auszahlung = Einsatz × Multiplikator, abgerundet – ohne Gleitkomma-Fehler (100 × 1,16 = 116, nicht 115) */
function payoutFor(bet, mult) {
  return Math.floor(Math.round(bet * mult * 1e6) / 1e6);
}

const SUITS =['♠', '♥', '♦', '♣'];
// Rang 2–14 (11=B, 12=D, 13=K, 14=A)
function makeDeck(decks = 1) {
  const cards = [];
  for (let d = 0; d < decks; d++) {
    for (const s of SUITS) for (let r = 2; r <= 14; r++) cards.push({ r, s });
  }
  return shuffle(cards);
}

/**
 * Mehrere Einsätze auf einmal prüfen (z. B. { pass: 100, field: 50 }).
 * Gibt { amounts, total } zurück; leere Felder zählen als 0.
 */
function parseAmounts(body, keys, profile, { allowZeroTotal = false } = {}) {
  const amounts = {};
  let total = 0;
  for (const k of keys) {
    const raw = body?.[k];
    const v = raw === undefined || raw === null || raw === '' ? 0 : Number(raw);
    if (!Number.isInteger(v) || v < 0) throw new GameError('Ungültiger Einsatz.');
    amounts[k] = v;
    total += v;
  }
  if (!allowZeroTotal && total < 1) throw new GameError('Bitte zuerst einen Einsatz setzen.');
  checkMaxBet(total);
  if (total > profile.balance) throw new GameError('Nicht genug Chips für diese Einsätze.');
  return { amounts, total };
}

/** setInterval, das bei einem Fehler nur protokolliert, statt den ganzen Server abstürzen zu lassen */
function safeInterval(name, fn, ms) {
  let last = 0;
  return setInterval(() => {
    try { fn(); } catch (e) {
      if (Date.now() - last > 10000) { last = Date.now(); console.error(`[${name}] Fehler im Ablauf:`, e && e.stack || e); }
    }
  }, ms);
}

module.exports = { MAX_BET, checkMaxBet, safeInterval, GameError, randInt, randFloat, shuffle, parseBet, makeDeck, payoutFor, parseAmounts };
