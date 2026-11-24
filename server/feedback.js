// Feedback von Spielern (Ideen, Fehler, Sonstiges). Nur im Admin-Bereich sichtbar.
// Die letzten 200 Einträge werden im Spielstand gespeichert.
const crypto = require('crypto');
const db = require('./db');
const { GameError } = require('./util');

const MAX = 200;
const KINDS = ['idee', 'fehler', 'sonstiges'];
const lastSent = new Map(); // Spieler-ID → Zeitpunkt (Spam-Schutz)

const store = () => (db.get().feedback ||= []);

function send(p, body) {
  const text = String(body?.text ?? '').replace(/[\u0000-\u0009\u000b-\u001f]/g, ' ').trim().slice(0, 1000);
  if (text.length < 3) throw new GameError('Bitte schreib ein paar Worte.');
  const kind = KINDS.includes(body?.kind) ? body.kind : 'sonstiges';
  const now = Date.now();
  if (now - (lastSent.get(p.id) || 0) < 30000) throw new GameError('Danke! Bitte warte kurz, bevor du nochmal etwas schickst.', 429);
  lastSent.set(p.id, now);
  const list = store();
  list.push({ id: crypto.randomUUID().slice(0, 8), at: now, name: p.name, kind, text, read: false });
  if (list.length > MAX) list.splice(0, list.length - MAX);
  return { ok: true };
}

/** Für den Admin: neueste zuerst */
const adminList = () => store().slice().reverse();

function markRead(id) {
  const f = store().find((x) => x.id === id);
  if (!f) throw new GameError('Feedback nicht gefunden.', 404);
  f.read = !f.read;
  return adminList();
}

function remove(id) {
  const list = store();
  const i = list.findIndex((x) => x.id === id);
  if (i < 0) throw new GameError('Feedback nicht gefunden.', 404);
  list.splice(i, 1);
  return adminList();
}

module.exports = { send, adminList, markRead, remove };
