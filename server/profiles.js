// Profile, Guthaben, Bonus, Nachfüllen und Statistik.
const crypto = require('crypto');
const db = require('./db');
const { GameError } = require('./util');

const START_BALANCE = 10000;
const REFILL_THRESHOLD = 100;
const REFILL_AMOUNT = 5000;
const REFILL_COOLDOWN_MS = 60 * 60 * 1000; // 1 Stunde
const DAILY_BONUS = 1000;
const HISTORY_LIMIT = 50;
const MAX_PROFILES = 50;

const GAME_NAMES = {
  slots: 'Slots',
  blackjack: 'Blackjack',
  roulette: 'Roulette',
  poker: 'Video Poker',
  crash: 'Crash',
  mines: 'Mines',
  plinko: 'Plinko',
  dice: 'Würfel',
  keno: 'Keno',
  baccarat: 'Baccarat',
  hilo: 'Hi-Lo',
  wheel: 'Glücksrad',
  tower: 'Turm',
  scratch: 'Rubbellos',
  coinflip: 'Münzwurf',
  limbo: 'Limbo',
  craps: 'Craps',
  sicbo: 'Sic Bo',
  threecard: 'Drei-Karten-Poker',
  war: 'Kartenkrieg',
  reddog: 'Red Dog',
  dragontiger: 'Drache & Tiger',
  horses: 'Pferderennen',
  bingo: 'Schnell-Bingo',
  cups: 'Hütchenspiel',
  rps: 'Schere-Stein-Papier',
  duel: 'Duelle (1 gegen 1)',
  livecrash: 'Live-Crash',
  liveroulette: 'Live-Roulette',
  jackpot: 'Jackpot',
  bjtable: 'Blackjack-Tisch',
  holdem: "Texas Hold'em",
  caseopen: 'Case öffnen',
  casebattle: 'Case Battles',
  admin: 'Admin',
};

function emptyStats() {
  return { rounds: 0, wagered: 0, paid: 0, biggestWin: 0, biggestWinGame: null, perGame: {} };
}

function todayLocal() {
  return new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD in lokaler Zeit
}

function cleanName(name) {
  const n = String(name ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 20);
  if (!n) throw new GameError('Bitte einen Namen eingeben.');
  return n;
}

function all() {
  return Object.values(db.get().profiles);
}

// ---------- Passwörter & Anmeldung ----------
const MIN_PASSWORD = 4;
const MAX_SESSIONS = 10;

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pw), salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

function checkPassword(p, pw) {
  if (!p.passwordHash) return false;
  const [salt, hash] = p.passwordHash.split(':');
  const test = crypto.scryptSync(String(pw ?? ''), salt, 32);
  return crypto.timingSafeEqual(test, Buffer.from(hash, 'hex'));
}

function validPassword(pw) {
  const s = String(pw ?? '');
  if (s.length < MIN_PASSWORD) throw new GameError(`Das Passwort braucht mindestens ${MIN_PASSWORD} Zeichen.`);
  if (s.length > 100) throw new GameError('Das Passwort ist zu lang.');
  return s;
}

const tokenHash = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');

/** Neue Anmeldung: erzeugt ein zufälliges Token; gespeichert wird nur dessen Hash */
function newSession(p) {
  const token = crypto.randomBytes(32).toString('hex');
  p.sessions = [{ h: tokenHash(token), at: Date.now() }, ...(p.sessions || [])].slice(0, MAX_SESSIONS);
  return token;
}

function byName(name) {
  const n = String(name ?? '').trim().toLowerCase();
  return all().find((p) => p.name.toLowerCase() === n) || null;
}

/** Anmelden. requirePassword = true im Online-Modus (Passwort immer Pflicht). */
function login(name, password, requirePassword) {
  const p = byName(name);
  if (!p) throw new GameError('Name oder Passwort falsch.', 401);
  if (p.passwordHash) {
    if (!checkPassword(p, password)) throw new GameError('Name oder Passwort falsch.', 401);
  } else if (requirePassword) {
    throw new GameError('Dieses Profil hat noch kein Passwort. Bitte am PC ein Passwort festlegen.', 401);
  }
  return { p, token: newSession(p) };
}

function logout(p, token) {
  const h = tokenHash(token);
  p.sessions = (p.sessions || []).filter((s) => s.h !== h);
}

function setPassword(p, oldPw, newPw) {
  if (p.passwordHash && !checkPassword(p, oldPw)) throw new GameError('Das bisherige Passwort stimmt nicht.');
  p.passwordHash = hashPassword(validPassword(newPw));
}

function create(name, password, requirePassword) {
  const clean = cleanName(name);
  if (all().length >= MAX_PROFILES) throw new GameError(`Maximal ${MAX_PROFILES} Profile – bitte ein altes Profil löschen.`);
  if (byName(clean)) throw new GameError('Diesen Namen gibt es schon.');
  const hasPw = password !== undefined && password !== null && password !== '';
  if (requirePassword || hasPw) validPassword(password);
  const p = {
    id: crypto.randomUUID(),
    name: clean,
    balance: START_BALANCE,
    createdAt: Date.now(),
    lastRefill: 0,
    lastDaily: null,
    stats: emptyStats(),
    history: [],
    active: {}, // laufende Runden (Blackjack, Poker, Crash, Mines …)
    passwordHash: hasPw ? hashPassword(password) : null,
    sessions: [],
  };
  db.get().profiles[p.id] = p;
  const token = newSession(p);
  db.save();
  return { p, token };
}

/** Profil zum Anmelde-Token finden */
function get(token) {
  const h = typeof token === 'string' && token.length >= 32 ? tokenHash(token) : null;
  const p = h ? all().find((x) => (x.sessions || []).some((s) => s.h === h)) : null;
  if (!p) throw new GameError('Bitte anmelden.', 401);
  if (!p.active) p.active = {};
  return p;
}

function remove(p) {
  delete db.get().profiles[p.id];
  db.save();
}

function rename(p, name) {
  const clean = cleanName(name);
  if (all().some((o) => o.id !== p.id && o.name.toLowerCase() === clean.toLowerCase())) {
    throw new GameError('Diesen Namen gibt es schon.');
  }
  p.name = clean;
}

function reset(p) {
  p.balance = START_BALANCE;
  p.stats = emptyStats();
  p.history = [];
  p.active = {};
  p.lastRefill = 0;
  p.weekly = null; // Wochenwertung neu (Stufen und Erfolge bleiben erhalten)
  p.loseStreak = 0;
}

function refillInfo(p) {
  const nextAt = (p.lastRefill || 0) + REFILL_COOLDOWN_MS;
  return {
    needed: p.balance < REFILL_THRESHOLD,
    available: p.balance < REFILL_THRESHOLD && Date.now() >= nextAt,
    nextAt,
    amount: REFILL_AMOUNT,
    threshold: REFILL_THRESHOLD,
  };
}

function refill(p) {
  const info = refillInfo(p);
  if (!info.needed) throw new GameError(`Nachfüllen geht erst unter ${REFILL_THRESHOLD} Chips.`);
  if (!info.available) {
    const min = Math.ceil((info.nextAt - Date.now()) / 60000);
    throw new GameError(`Nachfüllen wieder in ${min} Min. möglich.`);
  }
  p.balance += REFILL_AMOUNT;
  p.lastRefill = Date.now();
  return REFILL_AMOUNT;
}

// ---------- Tagesbonus mit Serie: jeden Tag in Folge etwas mehr (ab Tag 7 bleibt es beim Höchstwert) ----------
const STREAK_STEP = 500;
const STREAK_MAX_DAY = 7;
const dailyAmount = (day) => DAILY_BONUS + STREAK_STEP * (Math.min(day, STREAK_MAX_DAY) - 1);
function yesterdayLocal() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toLocaleDateString('sv-SE');
}
/** Serie, wie sie mit dem nächsten Abholen weiterläuft (verpasster Tag → wieder Tag 1) */
function dailyInfo(p) {
  const claimedToday = p.lastDaily === todayLocal();
  const alive = claimedToday || p.lastDaily === yesterdayLocal();
  const streak = alive ? p.dailyStreak || 1 : 0; // bisher geschaffte Tage in Folge
  const nextDay = streak + 1; // Tag, der mit dem nächsten Abholen erreicht wird
  return {
    available: !claimedToday, streak, nextDay, maxDay: STREAK_MAX_DAY,
    days: Array.from({ length: STREAK_MAX_DAY }, (_, i) => dailyAmount(i + 1)),
    amount: dailyAmount(claimedToday ? streak : nextDay), // heute (noch) zu holen bzw. heute geholt
    tomorrow: dailyAmount(claimedToday ? nextDay : nextDay + 1), // morgen, wenn die Serie hält
  };
}
function claimDaily(p) {
  const info = dailyInfo(p);
  if (!info.available) throw new GameError('Den Tagesbonus hast du heute schon abgeholt.');
  p.lastDaily = todayLocal();
  p.dailyStreak = info.nextDay;
  p.balance += info.amount;
  if (info.nextDay % 7 === 0) require('./chat').system(`🔥 ${p.name} holt sich seit ${info.nextDay} Tagen jeden Tag den Bonus ab!`);
  return info.amount;
}

/** Bucht eine abgeschlossene Runde in Statistik und Verlauf. */
function record(p, game, bet, payout, detail = '') {
  const net = payout - bet;
  const s = p.stats;
  s.rounds++;
  s.wagered += bet;
  s.paid += payout;
  if (net > s.biggestWin) {
    s.biggestWin = net;
    s.biggestWinGame = game;
  }
  const g = (s.perGame[game] ||= { rounds: 0, wagered: 0, paid: 0, biggestWin: 0 });
  g.rounds++;
  g.wagered += bet;
  g.paid += payout;
  if (net > g.biggestWin) g.biggestWin = net;
  p.history.unshift({ game, bet, payout, net, balance: p.balance, time: Date.now(), detail });
  require('./live').noteRound(p, game, bet, payout);
  require('./progress').onRound(p, game, bet, payout);
  if (p.history.length > HISTORY_LIMIT) p.history.length = HISTORY_LIMIT;
}

function publicView(p) {
  return {
    name: p.name,
    balance: p.balance,
    createdAt: p.createdAt,
    hasPassword: !!p.passwordHash,
    refill: refillInfo(p),
    daily: dailyInfo(p),
  };
}

// Öffentliche Kurzinfo für Liste/Rangliste – bewusst OHNE interne ID
function summary(p) {
  return {
    name: p.name,
    hasPassword: !!p.passwordHash,
    balance: p.balance,
    rounds: p.stats.rounds,
    net: p.stats.paid - p.stats.wagered,
    biggestWin: p.stats.biggestWin,
    vip: require('./progress').badge(p),
  };
}

/** Chips an einen anderen Spieler verschenken */
function tip(p, toName, amount) {
  const to = byName(toName);
  if (!to) throw new GameError('Spieler nicht gefunden.');
  if (to.id === p.id) throw new GameError('Du kannst dir nicht selbst etwas schenken.');
  const n = Number(amount);
  if (!Number.isInteger(n) || n < 10) throw new GameError('Mindestens 10 Chips.');
  if (n > p.balance) throw new GameError('So viele Chips hast du nicht.');
  p.balance -= n;
  to.balance += n;
  const pr = require('./progress');
  pr.notice(to, { type: 'tip', text: `🎁 ${p.name} hat dir ${n.toLocaleString('de-DE')} Chips geschenkt!` });
  require('./chat').system(`🎁 ${p.name} schenkt ${to.name} ${n.toLocaleString('de-DE')} Chips.`);
  return { to: to.name, amount: n };
}

module.exports = {
  START_BALANCE, GAME_NAMES,
  all, create, get, remove, rename, reset, refill, claimDaily, dailyInfo, record, publicView, summary,
  login, logout, setPassword, tip,
};
