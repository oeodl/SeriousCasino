// Europäisches Roulette (0–36, eine Null). Auszahlungen wie im Casino:
// Zahl 35:1, Dutzend/Kolonne 2:1, Farbe/Gerade/Ungerade/1–18/19–36 1:1.
const { randInt, GameError, checkMaxBet } = require('../util');
const profiles = require('../profiles');

const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const colorOf = (n) => (n === 0 ? 'green' : RED.has(n) ? 'red' : 'black');

// typ -> [Prüffunktion(zahl, wert), Gesamtrückzahlung als Vielfaches]
const TYPES = {
  straight: [(n, v) => n === v, 36],
  red: [(n) => colorOf(n) === 'red', 2],
  black: [(n) => colorOf(n) === 'black', 2],
  even: [(n) => n !== 0 && n % 2 === 0, 2],
  odd: [(n) => n % 2 === 1, 2],
  low: [(n) => n >= 1 && n <= 18, 2],
  high: [(n) => n >= 19, 2],
  dozen: [(n, v) => n !== 0 && Math.ceil(n / 12) === v, 3],
  column: [(n, v) => n !== 0 && ((n - 1) % 3) + 1 === v, 3],
};
const NAMES = { red: 'Rot', black: 'Schwarz', even: 'Gerade', odd: 'Ungerade', low: '1–18', high: '19–36' };

function validate(bets) {
  if (!Array.isArray(bets) || bets.length === 0) throw new GameError('Bitte zuerst Chips auf den Tisch legen.');
  if (bets.length > 200) throw new GameError('Zu viele Einzelwetten.');
  return bets.map((b) => {
    const t = TYPES[b?.type] && Object.hasOwn(TYPES, b.type) ? b.type : null;
    if (!t) throw new GameError('Unbekannte Wette.');
    const amount = Number(b.amount);
    if (!Number.isInteger(amount) || amount < 1) throw new GameError('Ungültiger Einsatz.');
    let value = null;
    if (t === 'straight') {
      value = Number(b.value);
      if (!Number.isInteger(value) || value < 0 || value > 36) throw new GameError('Ungültige Zahl.');
    } else if (t === 'dozen' || t === 'column') {
      value = Number(b.value);
      if (![1, 2, 3].includes(value)) throw new GameError('Ungültiges Feld.');
    }
    return { type: t, value, amount };
  });
}

function spin(p, body) {
  const bets = validate(body.bets);
  const total = bets.reduce((a, b) => a + b.amount, 0);
  checkMaxBet(total);
  if (total > p.balance) throw new GameError('Nicht genug Chips für diese Einsätze.');
  p.balance -= total;

  const number = randInt(0, 37);
  let payout = 0;
  const results = bets.map((b) => {
    const [check, mult] = TYPES[b.type];
    const won = check(number, b.value);
    const pay = won ? b.amount * mult : 0;
    payout += pay;
    return { ...b, won, payout: pay };
  });
  p.balance += payout;
  const colorName = { red: 'Rot', black: 'Schwarz', green: 'Grün' }[colorOf(number)];
  profiles.record(p, 'roulette', total, payout, `${number} ${colorName} · ${bets.length} Wette(n)`);
  return { number, color: colorOf(number), results, payout, totalBet: total };
}

module.exports = { spin };
module.exports._internal = { TYPES, NAMES, colorOf };
