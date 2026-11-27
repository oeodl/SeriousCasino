// Admin-Steuerung pro Spieler (für Spieler unsichtbar):
// - luck: 'normal' | 'lose' (Pech) | 'win' (Glück)
// - strength: wie stark Glück/Pech wirkt, 10–100 % (= in wie vielen Runden/Zügen eingegriffen wird; sonst ganz normaler Zufall)
// - next: einmalige Vorgaben für den nächsten Zug (z. B. nächste Hi-Lo-Karte, nächster Münzwurf)
// Gespeichert im Profil unter p.admin (wird nie an Spieler geschickt).

function ctl(p) {
  return (p.admin ||= { luck: 'normal', next: {} });
}

function luckOf(p) {
  return p.admin?.luck || 'normal';
}

function strengthOf(p) {
  const s = Number(p.admin?.strength);
  return Number.isFinite(s) && s >= 1 && s <= 100 ? s : 100;
}

function setLuck(p, mode, strength) {
  ctl(p).luck = ['normal', 'lose', 'win'].includes(mode) ? mode : 'normal';
  if (strength !== undefined && strength !== null && strength !== '') {
    const s = Math.round(Number(strength));
    if (Number.isFinite(s)) ctl(p).strength = Math.min(100, Math.max(10, s));
  }
}

/** Für EINE Runde bzw. EINEN Zug auswürfeln, ob Glück/Pech diesmal greift (je nach Stärke) */
function luckRoll(p) {
  const mode = luckOf(p);
  if (mode === 'normal') return 'normal';
  return require('crypto').randomInt(0, 100) < strengthOf(p) ? mode : 'normal';
}

/** Einmalige Vorgabe holen und verbrauchen */
function takeNext(p, key) {
  const n = p.admin?.next;
  if (!n || n[key] === undefined || n[key] === null) return null;
  const v = n[key];
  delete n[key];
  return v;
}

function setNext(p, key, value) {
  ctl(p).next[key] = value;
}

function peekNext(p) {
  return { ...(p.admin?.next || {}) };
}

/** Für Spiele mit mehreren Zügen (Mines, Turm, Hi-Lo): einmal pro Runde würfeln, nicht bei jedem Klick –
 *  sonst würde sich das Pech Zug für Zug aufsummieren. Ändert der Admin die Einstellung, wird neu gewürfelt. */
function roundLuck(p, st) {
  const mode = luckOf(p), s = strengthOf(p);
  if (!st._luck || st._luck.mode !== mode || st._luck.s !== s) st._luck = { mode, s, v: luckRoll(p) };
  return st._luck.v;
}

module.exports = { roundLuck, luckOf, luckRoll, strengthOf, setLuck, takeNext, setNext, peekNext };
