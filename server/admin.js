// Admin-Bereich: eigenes Admin-Passwort (getrennt gespeichert in data/admin.json) und Verwaltungsfunktionen.
// admin.json wird bei jeder Admin-Anmeldung frisch gelesen – so kann das Passwort auch per Terminal
// (npm run admin) gesetzt werden, während der Server läuft.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');
const profiles = require('./profiles');
const { GameError } = require('./util');

const FILE = path.join(path.dirname(db.FILE), 'admin.json');
const SESSION_MS = 12 * 60 * 60 * 1000; // Admin bleibt 12 Stunden angemeldet
const MAX_CHIPS = 1e12;
const sessions = new Map(); // tokenHash -> Ablaufzeit

function readConfig() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return {}; }
}

// In der Cloud (Render) kommt das Admin-Passwort aus der Umgebungsvariable CASINO_ADMIN_PASSWORD
const ENV_PW = process.env.CASINO_ADMIN_PASSWORD || '';
const fromEnv = () => ENV_PW.length >= 6;

function isSet() {
  return fromEnv() || !!readConfig().passwordHash;
}

function setPassword(pw) {
  if (fromEnv()) throw new GameError('Das Admin-Passwort wird in den Server-Einstellungen (CASINO_ADMIN_PASSWORD) festgelegt.');
  const s = String(pw ?? '');
  if (s.length < 6) throw new GameError('Das Admin-Passwort braucht mindestens 6 Zeichen.');
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(s, salt, 32).toString('hex');
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify({ passwordHash: `${salt}:${hash}`, changedAt: Date.now() }, null, 1));
  sessions.clear(); // alte Admin-Anmeldungen ungültig machen
}

function check(pw) {
  if (fromEnv()) {
    // Vergleich über Hashes gleicher Länge (keine Rückschlüsse über die Antwortzeit)
    const a = crypto.createHash('sha256').update(String(pw ?? '')).digest();
    const b = crypto.createHash('sha256').update(ENV_PW).digest();
    return crypto.timingSafeEqual(a, b);
  }
  const cfg = readConfig();
  if (!cfg.passwordHash) return false;
  const [salt, hash] = cfg.passwordHash.split(':');
  const test = crypto.scryptSync(String(pw ?? ''), salt, 32);
  return crypto.timingSafeEqual(test, Buffer.from(hash, 'hex'));
}

const th = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');

function login(pw) {
  if (!isSet()) throw new GameError('Es ist noch kein Admin-Passwort festgelegt.', 401);
  if (!check(pw)) throw new GameError('Admin-Passwort falsch.', 401);
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(th(token), Date.now() + SESSION_MS);
  return token;
}

function requireAdmin(token) {
  const h = token ? th(token) : null;
  const until = h ? sessions.get(h) : 0;
  if (!until || until < Date.now()) {
    if (h) sessions.delete(h);
    throw new GameError('Bitte als Admin anmelden.', 401);
  }
}

function logout(token) {
  if (token) sessions.delete(th(token));
}

// ---------- Verwaltung ----------
function find(name) {
  const n = String(name ?? '').trim().toLowerCase();
  const p = profiles.all().find((x) => x.name.toLowerCase() === n);
  if (!p) throw new GameError('Spieler nicht gefunden.', 404);
  return p;
}

function list() {
  return profiles.all()
    .map((p) => ({
      name: p.name,
      balance: p.balance,
      rounds: p.stats.rounds,
      net: p.stats.paid - p.stats.wagered,
      hasPassword: !!p.passwordHash,
      createdAt: p.createdAt,
      lastPlayed: p.history[0]?.time ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

/** Notiz im Verlauf des Spielers (zählt nicht in die Spiel-Statistik) */
function note(p, delta, text) {
  p.history.unshift({ game: 'admin', bet: 0, payout: 0, net: delta, balance: p.balance, time: Date.now(), detail: text });
  if (p.history.length > 50) p.history.length = 50;
}

function adjust(name, mode, amount) {
  const p = find(name);
  const n = Number(amount);
  if (!Number.isInteger(n)) throw new GameError('Bitte eine ganze Zahl eingeben.');
  const before = p.balance;
  let after;
  if (mode === 'set') after = n;
  else if (mode === 'add') after = before + n;
  else throw new GameError('Unbekannte Aktion.');
  if (after < 0) throw new GameError(`So viel kann nicht abgezogen werden (Guthaben: ${before}).`);
  if (after > MAX_CHIPS) throw new GameError('Das sind zu viele Chips.');
  p.balance = after;
  const delta = after - before;
  note(p, delta, mode === 'set' ? `Admin: Guthaben auf ${after} gesetzt` : `Admin: ${delta >= 0 ? '+' : ''}${delta} Chips`);
  return { name: p.name, before, balance: after };
}

function resetProfile(name) {
  const p = find(name);
  profiles.reset(p);
  note(p, 0, 'Admin: Profil zurückgesetzt');
  return { name: p.name, balance: p.balance };
}

function resetStats(name) {
  const p = find(name);
  profiles.resetStats(p);
  return { name: p.name, balance: p.balance };
}

function resetPassword(name, newPassword) {
  const p = find(name);
  // Wie beim normalen Ändern, nur ohne altes Passwort; alle Anmeldungen des Spielers werden beendet
  p.passwordHash = null;
  profiles.setPassword(p, null, newPassword);
  p.sessions = [];
  return { name: p.name };
}

function remove(name) {
  const p = find(name);
  profiles.remove(p);
  return { name: p.name };
}

module.exports = { isSet, setPassword, login, logout, requireAdmin, list, adjust, resetProfile, resetStats, resetPassword, remove, FILE };
