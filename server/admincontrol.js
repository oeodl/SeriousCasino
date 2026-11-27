// Admin-Live-Kontrolle: laufende Runden aller Spieler ansehen (inkl. verdeckter Infos) und eingreifen.
const db = require('./db');
const profiles = require('./profiles');
const live = require('./live');
const L = require('./luck');
const { GameError } = require('./util');
const crash = require('./games/crash');
const { multAt } = crash._internal;

const NAMES = profiles.GAME_NAMES;
const findP = (name) => {
  const n = String(name ?? '').trim().toLowerCase();
  const p = profiles.all().find((x) => x.name.toLowerCase() === n);
  if (!p) throw new GameError('Spieler nicht gefunden.', 404);
  if (!p.active) p.active = {};
  return p;
};

/** Laufende Runden eines Spielers – mit allem, was der Spieler NICHT sieht */
function rounds(p) {
  const a = p.active || {};
  const out = [];
  if (a.crash) {
    const el = Date.now() - a.crash.startedAt;
    out.push({ game: 'crash', bet: a.crash.bet, auto: a.crash.auto, crash: a.crash.crash, multiplier: Math.min(multAt(el), a.crash.crash) });
  }
  if (a.mines) out.push({ game: 'mines', bet: a.mines.bet, mines: a.mines.mines, positions: a.mines.positions, revealed: a.mines.revealed });
  if (a.tower) out.push({ game: 'tower', bet: a.tower.bet, mode: a.tower.mode, traps: a.tower.traps, picks: a.tower.picks });
  if (a.hilo) out.push({ game: 'hilo', bet: a.hilo.bet, cards: a.hilo.cards.slice(-6), mult: a.hilo.mult, steps: a.hilo.steps });
  if (a.coinflip) out.push({ game: 'coinflip', bet: a.coinflip.bet, streak: a.coinflip.streak });
  if (a.blackjack) out.push({ game: 'blackjack', bet: a.blackjack.hands.reduce((s, h) => s + h.bet, 0), hands: a.blackjack.hands.map((h) => h.cards), dealer: a.blackjack.dealer, forced: a.blackjack.forced || [] });
  if (a.poker) out.push({ game: 'poker', bet: a.poker.bet, hand: a.poker.hand });
  if (a.threecard) out.push({ game: 'threecard', bet: a.threecard.ante, player: a.threecard.player, dealer: a.threecard.dealer });
  if (a.reddog) out.push({ game: 'reddog', bet: a.reddog.bet, cards: a.reddog.cards });
  if (a.war) out.push({ game: 'war', bet: a.war.bet, player: a.war.player, dealer: a.war.dealer });
  if (a.craps) out.push({ game: 'craps', bet: a.craps.wagered, point: a.craps.point, rolls: a.craps.rolls });
  return out.map((r) => ({ ...r, gameName: NAMES[r.game] || r.game }));
}

function list() {
  const online = new Map(live.online().map((o) => [o.name, o.where]));
  return {
    players: profiles.all()
      .map((p) => ({
        name: p.name,
        online: online.has(p.name),
        where: online.get(p.name) || null,
        balance: p.balance,
        luck: L.luckOf(p),
        strength: L.strengthOf(p),
        next: L.peekNext(p),
        rounds: rounds(p),
        recent: p.history.slice(0, 6).map((h) => ({ game: NAMES[h.game] || h.game, bet: h.bet, payout: h.payout, detail: h.detail, time: h.time })),
      }))
      // Online-Spieler und Spieler mit laufender Runde zuerst
      .sort((a, b) => (b.online - a.online) || (b.rounds.length - a.rounds.length) || a.name.localeCompare(b.name, 'de')),
  };
}

function setLuck(body) {
  const p = findP(body.name);
  L.setLuck(p, String(body.mode), body.strength);
  db.save();
  return { name: p.name, luck: L.luckOf(p), strength: L.strengthOf(p) };
}

/** Eingriff in eine laufende Runde oder Vorgabe für den nächsten Zug */
function control(body) {
  const p = findP(body.name);
  const a = p.active;
  const game = String(body.game);
  const action = String(body.action);

  if (game === 'mines') {
    const st = a.mines;
    if (!st) throw new GameError('Keine laufende Mines-Runde.');
    const i = Number(body.index);
    if (!Number.isInteger(i) || i < 0 || i > 24) throw new GameError('Ungültiges Feld.');
    if (st.revealed.includes(i)) throw new GameError('Das Feld ist schon aufgedeckt.');
    const k = st.positions.indexOf(i);
    if (k >= 0) {
      if (st.positions.length <= 1) throw new GameError('Mindestens eine Mine muss bleiben.');
      st.positions.splice(k, 1);
    } else {
      if (st.positions.length + st.revealed.length >= 25) throw new GameError('Kein Platz mehr.');
      st.positions.push(i);
    }
  } else if (game === 'tower') {
    const st = a.tower;
    if (!st) throw new GameError('Keine laufende Turm-Runde.');
    const lvl = Number(body.level), col = Number(body.col);
    if (!Number.isInteger(lvl) || lvl < st.picks.length || lvl >= st.traps.length) throw new GameError('Dieses Stockwerk ist schon geschafft.');
    const row = st.traps[lvl];
    const k = row.indexOf(col);
    const cols = { easy: 4, medium: 3, hard: 2, expert: 3 }[st.mode];
    if (!Number.isInteger(col) || col < 0 || col >= cols) throw new GameError('Ungültiges Feld.');
    if (k >= 0) { if (row.length <= 1) throw new GameError('Mindestens eine Falle pro Stockwerk.'); row.splice(k, 1); }
    else { if (row.length + 1 >= cols) throw new GameError('Mindestens ein Feld muss sicher bleiben.'); row.push(col); }
  } else if (game === 'crash') {
    if (action === 'next') {
      const v = Number(body.value);
      if (!(v >= 1 && v <= 10000)) throw new GameError('Wert zwischen 1,00 und 10.000.');
      L.setNext(p, 'crash', v);
    } else {
      const st = a.crash;
      if (!st) throw new GameError('Keine laufende Crash-Runde.');
      const now = multAt(Date.now() - st.startedAt);
      if (action === 'now') {
        st.crash = Math.max(1, now);
        crash.state(p); // sofort auswerten
      } else if (action === 'at') {
        const v = Math.floor(Number(body.value) * 100) / 100;
        if (!(v > now)) throw new GameError(`Die Rakete ist schon bei ${now.toFixed(2)}× – dann „Jetzt crashen“.`);
        st.crash = v;
      } else throw new GameError('Unbekannte Aktion.');
    }
  } else if (game === 'hilo') {
    const r = Number(body.rank);
    if (!Number.isInteger(r) || r < 1 || r > 13) throw new GameError('Rang 1 (Ass) bis 13 (König).');
    L.setNext(p, 'hilo', r);
  } else if (game === 'coinflip') {
    if (!['heads', 'tails'].includes(body.result)) throw new GameError('Kopf oder Zahl?');
    L.setNext(p, 'coinflip', body.result);
  } else if (game === 'blackjack') {
    const st = a.blackjack;
    if (!st) throw new GameError('Keine laufende Blackjack-Runde.');
    const r = Number(body.rank);
    if (action === 'clear') st.forced = [];
    else {
      if (!Number.isInteger(r) || r < 2 || r > 14) throw new GameError('Rang 2 bis 14 (Ass).');
      st.forced = [...(st.forced || []), r].slice(0, 6);
    }
  } else if (action === 'clearNext') {
    p.admin && (p.admin.next = {});
  } else {
    throw new GameError('Für dieses Spiel gibt es keine direkte Steuerung – nutze Glück/Pech.');
  }
  db.save();
  return { ok: true };
}

module.exports = { list, setLuck, control };
