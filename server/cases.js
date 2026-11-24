// Cases & Case Battles (eigene, erfundene Skins im Stil von Counter-Strike-Cases).
// Solo: Case kaufen, Skin ziehen → landet im Inventar (mit Zustand und evtl. StatTrak™). Skins kann man jederzeit verkaufen.
// Auszahlungsquote ≈ 92 % (Durchschnittswert der Skins im Verhältnis zum Case-Preis).
// Battle: 2–4 Spieler öffnen dieselben Cases, wer den höchsten Gesamtwert zieht, bekommt ALLE gezogenen Skins (als Chips).
// Leere Plätze können mit Bots gefüllt werden – gewinnt ein Bot, geht der Topf an das Haus.
const crypto = require('crypto');
const db = require('./db');
const profiles = require('./profiles');
const { randInt, GameError } = require('./util');

const RTP = 0.92;
// Seltenheiten wie bei CS (Schlüssel bleiben gleich, damit alte Battles weiter funktionieren)
const RARITY = {
  common: { name: 'Militärstandard', color: '#4b69ff', weight: 79920 },
  rare: { name: 'Limitiert', color: '#8847ff', weight: 15980 },
  epic: { name: 'Geheim', color: '#d32ce6', weight: 3200 },
  legendary: { name: 'Verdeckt', color: '#eb4b4b', weight: 640 },
  mythic: { name: '★ Außergewöhnlich', color: '#e4ae39', weight: 260 },
};

// Zustand (wie der „Float“ bei CS): beeinflusst den Wert. Durchschnitt wird unten herausgerechnet, die Quote bleibt gleich.
const WEAR = [
  { id: 'FN', name: 'Fabrikneu', from: 0, to: 0.07, p: 0.08, mult: 1.6 },
  { id: 'MW', name: 'Minimale Gebrauchsspuren', from: 0.07, to: 0.15, p: 0.2, mult: 1.2 },
  { id: 'FT', name: 'Einsatzerprobt', from: 0.15, to: 0.38, p: 0.42, mult: 1 },
  { id: 'WW', name: 'Abgenutzt', from: 0.38, to: 0.45, p: 0.12, mult: 0.85 },
  { id: 'BS', name: 'Kampfspuren', from: 0.45, to: 1, p: 0.18, mult: 0.7 },
];
const ST_CHANCE = 0.1, ST_MULT = 1.6; // StatTrak™
const NORM = WEAR.reduce((a, w) => a + w.p * w.mult, 0) * (1 - ST_CHANCE + ST_CHANCE * ST_MULT);
const wearOf = (f) => WEAR.find((w) => f < w.to) || WEAR[WEAR.length - 1];

// Waffenarten: [Bild-Art, mögliche Waffen]. Messer & Handschuhe tragen wie bei CS einen ★.
const T = {
  P: ['pistol', ['Glock-18', 'USP-S', 'Desert Eagle', 'P250', 'Five-SeveN']],
  S: ['smg', ['MP9', 'P90', 'MAC-10', 'UMP-45']],
  R: ['rifle', ['AK-47', 'M4A4', 'M4A1-S', 'FAMAS', 'Galil AR']],
  A: ['sniper', ['AWP', 'SSG 08']],
  K: ['knife', ['★ Karambit', '★ Butterfly-Messer', '★ Bajonett', '★ Falchion-Messer']],
  G: ['gloves', ['★ Sporthandschuhe', '★ Fahrerhandschuhe', '★ Spezialistenhandschuhe']],
  H: ['shotgun', ['Nova', 'XM1014', 'MAG-7']],
};
// Aufbau eines Cases: Waffenart, Seltenheit, Basiswert (wird auf die Quote skaliert)
const SHAPE = [['P', 'common', 20], ['S', 'common', 25], ['R', 'common', 30], ['H', 'common', 15], ['P', 'common', 35],
  ['R', 'rare', 120], ['S', 'rare', 150], ['A', 'rare', 180], ['R', 'epic', 600], ['P', 'epic', 750],
  ['A', 'legendary', 2500], ['K', 'mythic', 6000], ['G', 'mythic', 9000]];
const def = (id, name, price, color, tier, finishes) => ({ id, name, price, color, tier, items: SHAPE.map(([t, r, b], k) => [t, finishes[k], r, b]) });

const CASE_DEFS = [
  def('street', 'Straßen-Case', 100, '#4a6b8a', 'standard', ['Asphalt', 'Graffiti', 'Betongrau', 'Rostig', 'Ziegelrot', 'Nachtschicht', 'Hinterhof', 'Stadtnebel', 'Neonschild', 'Sprühnebel', 'Mitternacht', 'Straßenkatze', 'Kiezboxer']),
  def('neon', 'Neon-Case', 500, '#8a2be2', 'standard', ['Cyan-Puls', 'Laserlinie', 'Pixelnebel', 'Glimmer', 'Raster', 'Synthwave', 'Magenta', 'Arcade', 'Neon-Viper', 'Lichtspur', 'Hyperdrive', 'Neonklinge', 'Plasma']),
  def('gold', 'Gold-Case', 2500, '#b8860b', 'standard', ['Messing', 'Bronzeguss', 'Sandstein', 'Kupfer', 'Wüstensand', 'Goldader', 'Pharao', 'Sonnenkönig', 'Goldrausch', 'Schatzkammer', 'Midas', 'Goldene Klinge', 'Königshand']),
  def('diamond', 'Diamant-Case', 10000, '#2aa7c9', 'standard', ['Eisblau', 'Frost', 'Gletscher', 'Kristall', 'Polarlicht', 'Saphir', 'Aquamarin', 'Eisdrache', 'Diamantstaub', 'Brillant', 'Kronjuwel', 'Diamantklinge', 'Eiskönig']),
  // High Roller
  def('elite', 'Elite-Case', 50000, '#b03a2e', 'highroller', ['Karbon', 'Tarnnetz', 'Schiefer', 'Stahlgrau', 'Kommando', 'Nachtsicht', 'Spezialeinheit', 'Wüstensturm', 'Blutmond', 'Feuertaufe', 'Scharfrichter', 'Schattenklinge', 'Einsatzleiter']),
  def('royal', 'Königs-Case', 250000, '#7d3c98', 'highroller', ['Purpur', 'Samt', 'Hermelin', 'Zepter', 'Thronsaal', 'Krönung', 'Hofstaat', 'Dynastie', 'Kaiserkrone', 'Imperium', 'Königsmord', 'Kronjuwel', 'Monarch']),
  def('legend', 'Legenden-Case', 1000000, '#d35400', 'highroller', ['Glut', 'Asche', 'Lava', 'Drachenhaut', 'Vulkan', 'Inferno', 'Feuersturm', 'Höllenfeuer', 'Drachenkönig', 'Sonnenwind', 'Supernova', 'Phönix', 'Titan']),
  def('galaxy', 'Galaxie-Case', 10000000, '#16a085', 'highroller', ['Sternenstaub', 'Nebel', 'Komet', 'Meteor', 'Orbit', 'Nova', 'Quasar', 'Pulsar', 'Schwarzes Loch', 'Ereignishorizont', 'Andromeda', 'Urknall', 'Singularität']),
];

/** Kleiner Hash → Farbton für das Skin-Bild (gleicher Skin = gleiche Farbe) */
function hueOf(str) { let h = 0; for (const ch of str) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h % 360; }

/** Gewichte + auf Ziel-Quote skalierte Werte berechnen */
const CASES = CASE_DEFS.map((c, ci) => {
  const count = {};
  c.items.forEach(([, , r]) => (count[r] = (count[r] || 0) + 1));
  const items = c.items.map(([t, finish, rarity, base], i) => {
    const names = T[t][1];
    return { i, kind: T[t][0], weapon: names[(ci * 3 + i) % names.length], finish, rarity, base, hue: hueOf(c.id + finish), weight: Math.round(RARITY[rarity].weight / count[rarity]) };
  });
  const totalW = items.reduce((a, x) => a + x.weight, 0);
  const ev = items.reduce((a, x) => a + (x.weight / totalW) * x.base, 0);
  const s = (c.price * RTP) / ev;
  items.forEach((x) => { x.value = Math.max(1, Math.round(x.base * s)); x.chance = x.weight / totalW; });
  return { id: c.id, name: c.name, price: c.price, color: c.color, tier: c.tier, items, totalW, scale: s };
});
const byId = Object.fromEntries(CASES.map((c) => [c.id, c]));

function roll(c) {
  let r = randInt(0, c.totalW);
  for (const it of c.items) { r -= it.weight; if (r < 0) return it; }
  return c.items[0];
}
const itemView = (it) => ({ i: it.i, kind: it.kind, weapon: it.weapon, finish: it.finish, rarity: it.rarity, value: it.value, hue: it.hue });

function info() {
  return {
    rarities: Object.fromEntries(Object.entries(RARITY).map(([k, r]) => [k, { name: r.name, color: r.color }])),
    wear: WEAR.map(({ id, name, from, to }) => ({ id, name, from, to })),
    cases: CASES.map((c) => ({ id: c.id, name: c.name, price: c.price, color: c.color, tier: c.tier, items: c.items.map((it) => ({ ...itemView(it), chance: it.chance })) })),
  };
}

// ---------- Inventar ----------
const INV_MAX = 500;
const inv = (p) => (Array.isArray(p.inventory) ? p.inventory : (p.inventory = []));

/** Ein gezogener Skin mit Zustand und StatTrak (Wert ist ab jetzt fest) */
function drop(c, it) {
  let r = Math.random(), w = WEAR[WEAR.length - 1];
  for (const x of WEAR) { r -= x.p; if (r < 0) { w = x; break; } }
  const float = Math.round((w.from + Math.random() * (w.to - w.from)) * 10000) / 10000;
  const st = Math.random() < ST_CHANCE;
  const v = Math.max(1, Math.round((it.base * c.scale * w.mult * (st ? ST_MULT : 1)) / NORM));
  return { id: crypto.randomUUID().slice(0, 12), c: c.id, i: it.i, w: float, st, v, at: Date.now() };
}

function dropView(d) {
  const c = byId[d.c];
  const it = c?.items[d.i];
  if (!it) return null;
  const w = wearOf(d.w);
  return { ...itemView(it), id: d.id, value: d.v, float: d.w, wear: w.id, wearName: w.name, st: !!d.st, caseId: c.id, caseName: c.name, at: d.at };
}
const fullName = (v) => `${v.st ? 'StatTrak™ ' : ''}${v.weapon} | ${v.finish} (${v.wearName})`;

function inventory(p) {
  const items = inv(p).map(dropView).filter(Boolean).reverse();
  return { items, count: items.length, max: INV_MAX, total: items.reduce((a, x) => a + x.value, 0) };
}

function sell(p, body) {
  const list = inv(p);
  const ids = body.all ? null : new Set((Array.isArray(body.ids) ? body.ids : []).slice(0, INV_MAX).map(String));
  if (ids && !ids.size) throw new GameError('Bitte Skins zum Verkaufen auswählen.');
  let amount = 0, sold = 0;
  p.inventory = list.filter((d) => {
    if (ids && !ids.has(d.id)) return true;
    amount += Number(d.v) || 0;
    sold++;
    return false;
  });
  if (!sold) throw new GameError('Diese Skins sind nicht (mehr) in deinem Inventar.');
  p.balance += amount;
  return { sold, amount, ...inventory(p) };
}

// ---------- Solo öffnen ----------
function open(p, body) {
  const c = byId[body.caseId];
  if (!c) throw new GameError('Unbekanntes Case.');
  if (inv(p).length >= INV_MAX) throw new GameError(`Dein Inventar ist voll (${INV_MAX} Skins). Verkauf erst ein paar.`);
  if (p.balance < c.price) throw new GameError('Nicht genug Chips.');
  p.balance -= c.price;
  const d = drop(c, roll(c));
  inv(p).push(d);
  const v = dropView(d);
  profiles.record(p, 'caseopen', c.price, v.value, `${c.name}: ${fullName(v)} [${RARITY[v.rarity].name}]`);
  if (v.rarity === 'mythic' || v.value >= c.price * 10) require('./chat').system(`📦 ${p.name} zieht ${fullName(v)} aus dem ${c.name} (${v.value.toLocaleString('de-DE')} Chips)!`);
  return { item: v, caseId: c.id, price: c.price, invCount: inv(p).length };
}

// ---------- Battles ----------
const ROUND_MS = 4500;
const COUNTDOWN_MS = 3000;
const WAIT_MS = 15 * 60 * 1000;
const BOT_NAMES = ['Bot Kalle', 'Bot Ingrid', 'Bot Rudi', 'Bot Erna', 'Bot Horst', 'Bot Gisela'];

const battles = () => (db.get().battles ||= {});
const cost = (b) => byId[b.caseId].price * b.rounds;

function refund(b) {
  for (const pl of b.players) if (pl.pid) { const p = db.get().profiles[pl.pid]; if (p) p.balance += cost(b); }
}

function startBattle(b) {
  const c = byId[b.caseId];
  b.status = 'running';
  b.startAt = Date.now() + COUNTDOWN_MS;
  b.players.forEach((pl) => { pl.items = Array.from({ length: b.rounds }, () => roll(c).i); });
}

function settle(b) {
  const c = byId[b.caseId];
  const totals = b.players.map((pl) => pl.items.reduce((a, i) => a + c.items[i].value, 0));
  const pot = totals.reduce((a, x) => a + x, 0);
  const best = Math.max(...totals);
  const winners = b.players.map((pl, i) => (totals[i] === best ? i : -1)).filter((i) => i >= 0);
  const share = Math.floor(pot / winners.length);
  b.status = 'done';
  b.totals = totals;
  b.pot = pot;
  b.winners = winners;
  b.players.forEach((pl, i) => {
    if (!pl.pid) return;
    const p = db.get().profiles[pl.pid];
    if (!p) return;
    const payout = winners.includes(i) ? share : 0;
    p.balance += payout;
    profiles.record(p, 'casebattle', cost(b), payout, `Case Battle (${c.name} ×${b.rounds}, ${b.players.length} Spieler): ${payout ? 'gewonnen' : 'verloren'}`);
  });
  // alte Battles aufräumen
  const done = Object.values(battles()).filter((x) => x.status === 'done' || x.status === 'cancelled').sort((a, c2) => (c2.startAt || c2.createdAt) - (a.startAt || a.createdAt));
  for (const x of done.slice(40)) delete battles()[x.id];
}

function tickBattle(b, now = Date.now()) {
  if (b.status === 'waiting' && now - b.createdAt > WAIT_MS) { refund(b); b.status = 'cancelled'; }
  if (b.status === 'running' && now >= b.startAt + b.rounds * ROUND_MS + 800) settle(b);
}
function tickAll() { Object.values(battles()).forEach((b) => tickBattle(b)); }

function battleView(b, me) {
  const now = Date.now();
  const c = byId[b.caseId];
  const reveal = b.status === 'done' ? b.rounds : b.status === 'running' ? Math.max(0, Math.min(b.rounds, Math.floor((now - b.startAt) / ROUND_MS))) : 0;
  return {
    id: b.id, caseId: b.caseId, caseName: c.name, price: c.price, rounds: b.rounds, slots: b.slots, status: b.status,
    cost: cost(b), createdAt: b.createdAt, startAt: b.startAt || null, now, roundMs: ROUND_MS,
    mine: b.players[0]?.pid === me, joined: b.players.some((pl) => pl.pid === me),
    // Gezogene Skins werden erst geschickt, wenn die Runde begonnen hat (sonst könnte man spicken)
    players: b.players.map((pl, i) => ({
      name: pl.name, bot: !pl.pid, me: pl.pid === me,
      items: b.status === 'running' || b.status === 'done' ? pl.items.slice(0, Math.min(b.rounds, b.status === 'done' ? b.rounds : Math.max(0, Math.floor((now - b.startAt) / ROUND_MS) + 1))).map((x) => itemView(c.items[x])) : [],
      total: b.status === 'done' ? b.totals[i] : null,
      winner: b.status === 'done' ? b.winners.includes(i) : null,
    })),
    revealed: reveal,
    pot: b.status === 'done' ? b.pot : null,
  };
}

function find(id) {
  const b = typeof id === 'string' ? battles()[id] : null;
  if (!b) throw new GameError('Battle nicht gefunden.', 404);
  tickBattle(b);
  return b;
}

function list(p) {
  tickAll();
  const all = Object.values(battles());
  const sort = (a, b) => (b.startAt || b.createdAt) - (a.startAt || a.createdAt);
  return {
    waiting: all.filter((b) => b.status === 'waiting').sort(sort).map((b) => battleView(b, p.id)),
    running: all.filter((b) => b.status === 'running').sort(sort).map((b) => battleView(b, p.id)),
    done: all.filter((b) => b.status === 'done').sort(sort).slice(0, 10).map((b) => battleView(b, p.id)),
  };
}

function create(p, body) {
  const c = byId[body.caseId];
  if (!c) throw new GameError('Bitte ein Case wählen.');
  const rounds = Number(body.rounds), slots = Number(body.slots);
  if (![1, 2, 3, 4, 5].includes(rounds)) throw new GameError('1 bis 5 Runden.');
  if (![2, 3, 4].includes(slots)) throw new GameError('2, 3 oder 4 Spieler.');
  const price = c.price * rounds;
  if (p.balance < price) throw new GameError('Nicht genug Chips.');
  tickAll();
  if (Object.values(battles()).filter((b) => b.status === 'waiting' && b.players[0].pid === p.id).length >= 3) throw new GameError('Du hast schon 3 offene Battles.');
  p.balance -= price;
  const b = { id: crypto.randomUUID(), caseId: c.id, rounds, slots, status: 'waiting', createdAt: Date.now(), players: [{ pid: p.id, name: p.name }] };
  battles()[b.id] = b;
  return battleView(b, p.id);
}

function join(p, body) {
  const b = find(body.id);
  if (b.status !== 'waiting') throw new GameError('Dieses Battle läuft schon oder ist vorbei.');
  if (b.players.some((pl) => pl.pid === p.id)) throw new GameError('Du bist schon dabei.');
  if (p.balance < cost(b)) throw new GameError('Nicht genug Chips.');
  p.balance -= cost(b);
  b.players.push({ pid: p.id, name: p.name });
  if (b.players.length >= b.slots) startBattle(b);
  return battleView(b, p.id);
}

function bots(p, body) {
  const b = find(body.id);
  if (b.status !== 'waiting' || b.players[0].pid !== p.id) throw new GameError('Nur der Ersteller kann Bots hinzufügen.');
  const names = BOT_NAMES.filter((n) => !b.players.some((pl) => pl.name === n));
  while (b.players.length < b.slots) b.players.push({ pid: null, name: names.splice(randInt(0, names.length), 1)[0] });
  startBattle(b);
  return battleView(b, p.id);
}

function cancel(p, body) {
  const b = find(body.id);
  if (b.status !== 'waiting' || b.players[0].pid !== p.id) throw new GameError('Nur der Ersteller kann ein wartendes Battle abbrechen.');
  refund(b);
  b.status = 'cancelled';
  return battleView(b, p.id);
}

function get(p, body) {
  return battleView(find(body.id), p.id);
}

module.exports = { actions: { info, open, inventory, sell, list, create, join, bots, cancel, get }, _internal: { CASES, roll } };
