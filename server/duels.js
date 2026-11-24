// 1-gegen-1-Duelle: Reaktionstest, Kopfrechnen, Vier gewinnt, Schere-Stein-Papier (Best of 5).
// Beide Spieler setzen gleich viel; der Einsatz wird beim Herausfordern bzw. Annehmen reserviert.
// Gewinner bekommt den ganzen Topf, Unentschieden/Abbruch = jeder bekommt seinen Einsatz zurück. Kein Hausanteil.
// Zeitüberschreitungen werden bei jedem Abruf geprüft (wer nicht weiterspielt, verliert).
const crypto = require('crypto');
const db = require('./db');
const profiles = require('./profiles');
const { randInt, shuffle, GameError } = require('./util');

const GAMES = {
  reaction: 'Reaktionstest',
  math: 'Kopfrechnen',
  connect4: 'Vier gewinnt',
  rps: 'Schere-Stein-Papier (Best of 5)',
  coinflip: 'Münzwurf-Duell',
  dice: 'Würfelduell',
  clicker: 'Speed-Klicker (10 s)',
  quiz: 'Quiz (8 Fragen)',
};
const CLICK_MS = 10 * 1000;
const MAX_CPS = 25; // mehr Klicks pro Sekunde schafft kein Mensch → gedeckelt
const QUIZ_N = 8;
const QUIZ_Q_MS = 15 * 1000;
const QUESTIONS = require('./quiz-questions');

function quizSet() {
  const idx = shuffle([...QUESTIONS.keys()]).slice(0, QUIZ_N);
  return idx.map((i) => {
    const [q, right, ...wrong] = QUESTIONS[i];
    const options = shuffle([right, ...wrong]);
    return { q, options, answer: options.indexOf(right) };
  });
}
const PENDING_MS = 15 * 60 * 1000; // Herausforderung verfällt
const TURN_MS = 2 * 60 * 1000; // Zugzeit bei Vier gewinnt / Rundenzeit bei SSP
const SOLO_MS = 10 * 60 * 1000; // Reaktion/Kopfrechnen: so lange darf der zweite Spieler sich Zeit lassen
const MATH_MS = 30 * 1000;
const MATH_GRACE = 1500;
const REACT_ROUNDS = 3;
const EARLY_PENALTY = 1000;
const MAX_DONE = 60;

const store = () => (db.get().duels ||= {});
const prof = (id) => (id ? db.get().profiles[id] : null);
const nameOf = (id) => prof(id)?.name ?? '(gelöscht)';
const other = (d, pid) => (d.from === pid ? d.to : d.from);
const isIn = (d, pid) => d.from === pid || d.to === pid;

function credit(pid, amount) {
  const p = prof(pid);
  if (p) p.balance += amount;
}

// ---------- Spiel-Zustände ----------
function genProblems(n = 80) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = randInt(0, 4);
    let a, b, q, ans;
    if (t === 0) { a = randInt(2, 100); b = randInt(2, 100); q = `${a} + ${b}`; ans = a + b; }
    else if (t === 1) { a = randInt(10, 100); b = randInt(2, a); q = `${a} − ${b}`; ans = a - b; }
    else if (t === 2) { a = randInt(2, 13); b = randInt(2, 13); q = `${a} × ${b}`; ans = a * b; }
    else { b = randInt(2, 13); ans = randInt(2, 13); a = b * ans; q = `${a} ÷ ${b}`; }
    out.push({ q, a: ans });
  }
  return out;
}

function initState(game, d) {
  const now = Date.now();
  if (game === 'reaction') return { delays: Array.from({ length: REACT_ROUNDS }, () => randInt(1500, 5000)), res: {} };
  if (game === 'math') return { problems: genProblems(), start: {}, score: {}, idx: {} };
  if (game === 'connect4') return { board: new Array(42).fill(0), turn: randInt(0, 2) ? d.from : d.to, lastMove: now, moves: 0, winLine: null };
  if (game === 'rps') return { picks: {}, score: { [d.from]: 0, [d.to]: 0 }, history: [], roundStart: now };
  if (game === 'coinflip') return { result: randInt(0, 2) ? 'heads' : 'tails' }; // Herausforderer hat immer Kopf
  if (game === 'dice') {
    const rolls = [];
    for (let i = 0; i < 20; i++) {
      const r = { [d.from]: [randInt(1, 7), randInt(1, 7)], [d.to]: [randInt(1, 7), randInt(1, 7)] };
      rolls.push(r);
      const sum = (a) => a[0] + a[1];
      if (sum(r[d.from]) !== sum(r[d.to])) break; // Gleichstand → nochmal würfeln
    }
    return { rolls };
  }
  if (game === 'clicker') return { start: {}, clicks: {} };
  if (game === 'quiz') return { qs: quizSet(), start: {}, qStart: {}, answers: {} };
  throw new GameError('Unbekanntes Duell.');
}

// ---------- Ende eines Duells ----------
function finish(d, winner, reason) {
  d.status = 'done';
  d.endedAt = Date.now();
  d.winner = winner || null;
  d.reason = reason;
  const pot = d.stake * 2;
  const label = GAMES[d.game];
  for (const pid of [d.from, d.to]) {
    const p = prof(pid);
    if (!p) continue;
    let payout;
    if (!winner) payout = d.stake;
    else payout = winner === pid ? pot : 0;
    p.balance += payout;
    const res = !winner ? 'Unentschieden' : winner === pid ? 'Sieg' : 'Niederlage';
    profiles.record(p, 'duel', d.stake, payout, `${label} gegen ${nameOf(other(d, pid))}: ${res}${reason ? ` (${reason})` : ''}`);
  }
  prune();
}

function prune() {
  const all = Object.values(store()).filter((d) => d.status !== 'pending' && d.status !== 'active').sort((a, b) => (b.endedAt || 0) - (a.endedAt || 0));
  for (const d of all.slice(MAX_DONE)) delete store()[d.id];
}

function closeWithRefund(d, status) {
  d.status = status;
  d.endedAt = Date.now();
  credit(d.from, d.stake);
  if (d.to && d.accepted) credit(d.to, d.stake);
  prune();
}

/** Zeitüberschreitungen prüfen */
function tick(d, now = Date.now()) {
  if (d.status === 'pending' && now - d.createdAt > PENDING_MS) return closeWithRefund(d, 'expired');
  if (d.status !== 'active') return;
  const s = d.state;
  const players = [d.from, d.to];
  if (d.game === 'reaction') {
    const done = players.filter((pid) => s.res[pid]);
    if (done.length === 1 && now - s.res[done[0]].at > SOLO_MS) finish(d, done[0], 'Gegner nicht angetreten');
    else if (!done.length && now - d.startedAt > 2 * SOLO_MS) finish(d, null, 'niemand hat gespielt');
  } else if (d.game === 'math') {
    const over = (pid) => s.start[pid] && now > s.start[pid] + MATH_MS + MATH_GRACE;
    const started = players.filter((pid) => s.start[pid]);
    if (players.every(over)) {
      const [a, b] = players.map((pid) => s.score[pid] || 0);
      finish(d, a === b ? null : a > b ? d.from : d.to, `${nameOf(d.from)} ${a} : ${b} ${nameOf(d.to)} Aufgaben`);
    } else if (started.length === 1 && over(started[0]) && now - (s.start[started[0]] + MATH_MS) > SOLO_MS) {
      finish(d, started[0], 'Gegner nicht angetreten');
    } else if (!started.length && now - d.startedAt > 2 * SOLO_MS) finish(d, null, 'niemand hat gespielt');
  } else if (d.game === 'connect4') {
    if (now - s.lastMove > TURN_MS) finish(d, other(d, s.turn), 'Zeit abgelaufen');
  } else if (d.game === 'rps') {
    if (now - s.roundStart > TURN_MS) {
      const picked = players.filter((pid) => s.picks[pid]);
      if (picked.length === 1) finish(d, picked[0], 'Zeit abgelaufen');
      else finish(d, null, 'Zeit abgelaufen');
    }
  } else if (d.game === 'clicker') {
    // Wer gestartet hat, aber nichts abgeschickt hat (Seite geschlossen), bekommt 0 Klicks
    for (const pid of players) if (s.start[pid] && s.clicks[pid] === undefined && now > s.start[pid] + CLICK_MS + 15000) s.clicks[pid] = 0;
    const done = players.filter((pid) => s.clicks[pid] !== undefined);
    if (done.length === 2) {
      const [a, b] = players.map((pid) => s.clicks[pid]);
      finish(d, a === b ? null : a > b ? d.from : d.to, `${nameOf(d.from)} ${a} : ${b} ${nameOf(d.to)} Klicks`);
    } else if (done.length === 1 && now - (s.start[done[0]] + CLICK_MS) > SOLO_MS) finish(d, done[0], 'Gegner nicht angetreten');
    else if (!done.length && !players.some((pid) => s.start[pid]) && now - d.startedAt > 2 * SOLO_MS) finish(d, null, 'niemand hat gespielt');
  } else if (d.game === 'quiz') {
    const fin = (pid) => s.start[pid] && ((s.answers[pid] || []).length >= QUIZ_N || now > s.start[pid] + QUIZ_N * (QUIZ_Q_MS + 1000) + 5000);
    const score = (pid) => (s.answers[pid] || []).filter((x) => x.correct).length;
    const time = (pid) => (s.answers[pid] || []).reduce((a, x) => a + x.ms, 0);
    if (players.every(fin)) {
      const [a, b] = players.map(score);
      let w = a === b ? null : a > b ? d.from : d.to;
      let why = `${nameOf(d.from)} ${a} : ${b} ${nameOf(d.to)} richtig`;
      if (!w && a > 0) { const [ta, tb] = players.map(time); if (ta !== tb) { w = ta < tb ? d.from : d.to; why += ' – schneller entschieden'; } }
      finish(d, w, why);
    } else {
      const started = players.filter((pid) => s.start[pid]);
      if (started.length === 1 && fin(started[0]) && now - s.start[started[0]] > SOLO_MS) finish(d, started[0], 'Gegner nicht angetreten');
      else if (!started.length && now - d.startedAt > 2 * SOLO_MS) finish(d, null, 'niemand hat gespielt');
    }
  }
}

/** Münzwurf- und Würfelduell werden sofort beim Annehmen entschieden */
function instantResolve(d) {
  const s = d.state;
  if (d.game === 'coinflip') {
    finish(d, s.result === 'heads' ? d.from : d.to, `Münze zeigt ${s.result === 'heads' ? 'Kopf' : 'Zahl'}`);
  } else if (d.game === 'dice') {
    const last = s.rolls[s.rolls.length - 1];
    const a = last[d.from][0] + last[d.from][1], b = last[d.to][0] + last[d.to][1];
    finish(d, a === b ? null : a > b ? d.from : d.to, `${nameOf(d.from)} ${a} : ${b} ${nameOf(d.to)}`);
  }
}

function tickAll() {
  for (const d of Object.values(store())) tick(d);
}

// ---------- Ansichten ----------
function summary(d, me) {
  const res = d.status === 'done' ? (!d.winner ? 'draw' : d.winner === me ? 'win' : 'lose') : null;
  return {
    id: d.id, game: d.game, gameName: GAMES[d.game], stake: d.stake, status: d.status,
    fromName: nameOf(d.from), toName: d.to ? nameOf(d.to) : null,
    mine: d.from === me, forMe: d.to === me,
    opponent: d.from === me ? (d.to ? nameOf(d.to) : null) : nameOf(d.from),
    createdAt: d.createdAt, endedAt: d.endedAt || null, result: res, reason: d.reason || null,
    expiresAt: d.status === 'pending' ? d.createdAt + PENDING_MS : null,
  };
}

function gameView(d, me) {
  const s = d.state;
  const opp = other(d, me);
  const done = d.status === 'done';
  const now = Date.now();
  if (d.game === 'reaction') {
    return {
      rounds: REACT_ROUNDS, delays: s.delays, penalty: EARLY_PENALTY,
      mine: s.res[me] || null, oppDone: !!s.res[opp], opp: done ? s.res[opp] || null : null,
    };
  }
  if (d.game === 'math') {
    const started = !!s.start[me];
    return {
      duration: MATH_MS, started,
      timeLeft: started ? Math.max(0, s.start[me] + MATH_MS - now) : MATH_MS,
      problem: started && now <= s.start[me] + MATH_MS ? s.problems[s.idx[me] || 0]?.q ?? null : null,
      index: s.idx[me] || 0, score: s.score[me] || 0,
      oppStarted: !!s.start[opp], oppScore: done ? s.score[opp] || 0 : null,
    };
  }
  if (d.game === 'connect4') {
    return {
      board: s.board, me: d.from === me ? 1 : 2, myTurn: !done && s.turn === me,
      timeLeft: done ? 0 : Math.max(0, s.lastMove + TURN_MS - now), winLine: s.winLine,
    };
  }
  if (d.game === 'rps') {
    return {
      myScore: s.score[me] || 0, oppScore: s.score[opp] || 0, myPick: s.picks[me] || null, oppPicked: !!s.picks[opp],
      history: s.history.map((h) => ({ mine: h[me], opp: h[opp], winner: h.winner === me ? 'me' : h.winner === opp ? 'opp' : 'draw' })),
      timeLeft: done ? 0 : Math.max(0, s.roundStart + TURN_MS - now),
    };
  }
  if (d.game === 'coinflip') return { result: s.result, mySide: d.from === me ? 'heads' : 'tails' };
  if (d.game === 'dice') return { rolls: s.rolls.map((r) => ({ mine: r[me], opp: r[opp] })) };
  if (d.game === 'clicker') {
    const started = !!s.start[me];
    return {
      duration: CLICK_MS, started, submitted: s.clicks[me] !== undefined, mine: s.clicks[me] ?? null,
      timeLeft: started ? Math.max(0, s.start[me] + CLICK_MS - now) : CLICK_MS,
      oppDone: s.clicks[opp] !== undefined, opp: done ? s.clicks[opp] ?? null : null,
    };
  }
  if (d.game === 'quiz') {
    const mine = s.answers[me] || [];
    const started = !!s.start[me];
    const finished = mine.length >= QUIZ_N || (started && now > s.start[me] + QUIZ_N * (QUIZ_Q_MS + 1000) + 5000);
    const cur = !finished && started ? s.qs[mine.length] : null;
    return {
      total: QUIZ_N, perQuestion: QUIZ_Q_MS, started, finished, index: mine.length,
      question: cur ? { q: cur.q, options: cur.options } : null,
      timeLeft: cur ? Math.max(0, s.qStart[me] + QUIZ_Q_MS - now) : 0,
      score: mine.filter((x) => x.correct).length,
      oppStarted: !!s.start[opp], oppFinished: (s.answers[opp] || []).length >= QUIZ_N,
      oppScore: done ? (s.answers[opp] || []).filter((x) => x.correct).length : null,
      // Auflösung erst nach Spielende (sonst könnte man dem Gegner die Antworten verraten)
      review: done ? s.qs.map((q, i) => ({ q: q.q, right: q.options[q.answer], mine: mine[i] ? q.options[mine[i].choice] ?? '–' : '–', ok: !!mine[i]?.correct })) : null,
    };
  }
  return {};
}

function find(id, me) {
  const d = typeof id === 'string' ? store()[id] : null;
  if (!d) throw new GameError('Duell nicht gefunden.', 404);
  tick(d);
  return d;
}

// ---------- Aktionen (alle mit angemeldetem Spieler p) ----------
function list(p) {
  tickAll();
  const all = Object.values(store());
  const mine = all.filter((d) => isIn(d, p.id));
  const byNew = (a, b) => b.createdAt - a.createdAt;
  return {
    games: GAMES,
    players: profiles.all().filter((x) => x.id !== p.id).map((x) => x.name).sort((a, b) => a.localeCompare(b, 'de')),
    incoming: mine.filter((d) => d.status === 'pending' && d.to === p.id).sort(byNew).map((d) => summary(d, p.id)),
    outgoing: mine.filter((d) => d.status === 'pending' && d.from === p.id).sort(byNew).map((d) => summary(d, p.id)),
    open: all.filter((d) => d.status === 'pending' && !d.to && d.from !== p.id).sort(byNew).map((d) => summary(d, p.id)),
    active: mine.filter((d) => d.status === 'active').sort(byNew).map((d) => summary(d, p.id)),
    recent: mine.filter((d) => d.status === 'done').sort((a, b) => b.endedAt - a.endedAt).slice(0, 15).map((d) => summary(d, p.id)),
  };
}

function count(p) {
  tickAll();
  const all = Object.values(store());
  const incoming = all.filter((d) => d.status === 'pending' && d.to === p.id);
  const myTurn = all.filter((d) => d.status === 'active' && isIn(d, p.id) && (
    (d.game === 'connect4' && d.state.turn === p.id) ||
    (d.game === 'rps' && !d.state.picks[p.id]) ||
    (d.game === 'reaction' && !d.state.res[p.id]) ||
    (d.game === 'math' && !d.state.start[p.id]) ||
    (d.game === 'clicker' && d.state.clicks[p.id] === undefined) ||
    (d.game === 'quiz' && (d.state.answers[p.id] || []).length < QUIZ_N)));
  return { incoming: incoming.map((d) => ({ id: d.id, from: nameOf(d.from), gameName: GAMES[d.game], stake: d.stake })), waiting: myTurn.length };
}

function create(p, body) {
  const game = String(body.game);
  if (!Object.hasOwn(GAMES, game)) throw new GameError('Bitte ein Duell-Spiel wählen.');
  const stake = Number(body.stake);
  if (!Number.isInteger(stake) || stake < 10) throw new GameError('Einsatz: mindestens 10 Chips.');
  if (stake > p.balance) throw new GameError('Nicht genug Chips für diesen Einsatz.');
  if (!profiles.isEstablished(p) && stake > profiles.FRESH_STAKE_MAX) {
    throw new GameError(`Neue Konten können höchstens ${profiles.FRESH_STAKE_MAX} Chips einsetzen. Spiele erst ein paar Runden.`);
  }
  let to = null;
  if (body.to) {
    const n = String(body.to).trim().toLowerCase();
    const target = profiles.all().find((x) => x.name.toLowerCase() === n);
    if (!target) throw new GameError('Spieler nicht gefunden.');
    if (target.id === p.id) throw new GameError('Du kannst dich nicht selbst herausfordern.');
    to = target.id;
  }
  tickAll();
  const pending = Object.values(store()).filter((d) => d.status === 'pending' && d.from === p.id).length;
  if (pending >= 5) throw new GameError('Du hast schon 5 offene Herausforderungen.');
  p.balance -= stake;
  const d = { id: crypto.randomUUID(), game, stake, from: p.id, to, accepted: false, status: 'pending', createdAt: Date.now() };
  store()[d.id] = d;
  if (to) require('./push').send(profiles.all().find((x) => x.id === to), '⚔️ Neue Herausforderung', `${p.name} fordert dich zu ${GAMES[game]} heraus – Einsatz ${stake.toLocaleString('de-DE')} Chips`, '#/duels');
  return summary(d, p.id);
}

function accept(p, body) {
  const d = find(body.id);
  if (d.status !== 'pending') throw new GameError('Diese Herausforderung ist nicht mehr offen.');
  if (d.from === p.id) throw new GameError('Das ist deine eigene Herausforderung.');
  if (d.to && d.to !== p.id) throw new GameError('Diese Herausforderung gilt jemand anderem.');
  if (d.stake > p.balance) throw new GameError('Nicht genug Chips für diesen Einsatz.');
  if (!profiles.isEstablished(p) && d.stake > profiles.FRESH_STAKE_MAX) {
    throw new GameError(`Neue Konten können höchstens ${profiles.FRESH_STAKE_MAX} Chips einsetzen. Spiele erst ein paar Runden.`);
  }
  p.balance -= d.stake;
  d.to = p.id;
  d.accepted = true;
  d.status = 'active';
  d.startedAt = Date.now();
  d.state = initState(d.game, d);
  instantResolve(d);
  const from = profiles.all().find((x) => x.id === d.from);
  require('./push').send(from, '⚔️ Duell angenommen', `${p.name} hat deine Herausforderung (${GAMES[d.game]}) angenommen!`, '#/duels');
  return summary(d, p.id);
}

function decline(p, body) {
  const d = find(body.id);
  if (d.status !== 'pending' || d.to !== p.id) throw new GameError('Nicht möglich.');
  closeWithRefund(d, 'declined');
  return summary(d, p.id);
}

function cancel(p, body) {
  const d = find(body.id);
  if (d.status !== 'pending' || d.from !== p.id) throw new GameError('Nicht möglich.');
  closeWithRefund(d, 'cancelled');
  return summary(d, p.id);
}

function get(p, body) {
  const d = find(body.id);
  if (!isIn(d, p.id) && !(d.status === 'pending' && !d.to)) throw new GameError('Das ist nicht dein Duell.', 403);
  return { ...summary(d, p.id), view: d.state ? gameView(d, p.id) : null };
}

// Spielzüge
function act(p, body) {
  const d = find(body.id);
  if (!isIn(d, p.id)) throw new GameError('Das ist nicht dein Duell.', 403);
  if (d.status !== 'active') throw new GameError('Das Duell läuft nicht (mehr).');
  const s = d.state;
  const me = p.id;
  const opp = other(d, me);
  const now = Date.now();
  const type = String(body.type);

  if (d.game === 'reaction' && type === 'submit') {
    if (s.res[me]) throw new GameError('Du hast schon gespielt.');
    const raw = Array.isArray(body.times) ? body.times.slice(0, REACT_ROUNDS) : [];
    // Unter 100 ms ist menschlich nicht möglich → zählt wie "zu früh"
    const times = Array.from({ length: REACT_ROUNDS }, (_, i) => {
      const t = Number(raw[i]);
      return Number.isFinite(t) && t >= 100 ? Math.min(Math.round(t), 3000) : EARLY_PENALTY;
    });
    s.res[me] = { times, total: times.reduce((a, b) => a + b, 0), at: now };
    if (s.res[opp]) {
      const a = s.res[d.from].total, b = s.res[d.to].total;
      finish(d, a === b ? null : a < b ? d.from : d.to, `${nameOf(d.from)} ${a} ms · ${nameOf(d.to)} ${b} ms`);
    }
  } else if (d.game === 'math' && type === 'begin') {
    if (!s.start[me]) { s.start[me] = now; s.score[me] = 0; s.idx[me] = 0; }
  } else if (d.game === 'math' && type === 'answer') {
    if (!s.start[me]) throw new GameError('Erst starten.');
    if (now > s.start[me] + MATH_MS + MATH_GRACE) throw new GameError('Die Zeit ist um.');
    if (Number(body.index) !== s.idx[me]) throw new GameError('Falsche Aufgabe.');
    const correct = String(body.value ?? '').trim() !== '' && Number(body.value) === s.problems[s.idx[me]].a;
    if (correct) s.score[me]++;
    s.idx[me]++;
    if (s.idx[me] >= s.problems.length) s.problems.push(...genProblems(40));
    tick(d);
    return { ...get(p, { id: d.id }), correct };
  } else if (d.game === 'connect4' && type === 'move') {
    if (s.turn !== me) throw new GameError('Du bist nicht dran.');
    const col = Number(body.col);
    if (!Number.isInteger(col) || col < 0 || col > 6) throw new GameError('Ungültige Spalte.');
    let row = -1;
    for (let r = 5; r >= 0; r--) if (!s.board[r * 7 + col]) { row = r; break; }
    if (row < 0) throw new GameError('Diese Spalte ist voll.');
    const mark = d.from === me ? 1 : 2;
    s.board[row * 7 + col] = mark;
    s.moves++;
    s.lastMove = now;
    const line = winLine(s.board, row, col, mark);
    if (line) { s.winLine = line; finish(d, me, 'vier in einer Reihe'); }
    else if (s.moves >= 42) finish(d, null, 'Brett voll');
    else s.turn = opp;
  } else if (d.game === 'rps' && type === 'pick') {
    const c = String(body.choice);
    if (!['rock', 'paper', 'scissors'].includes(c)) throw new GameError('Schere, Stein oder Papier?');
    if (s.picks[me]) throw new GameError('Du hast diese Runde schon gewählt.');
    s.picks[me] = c;
    if (s.picks[opp]) {
      const a = s.picks[d.from], b = s.picks[d.to];
      const beats = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
      const w = a === b ? null : beats[a] === b ? d.from : d.to;
      if (w) s.score[w]++;
      s.history.push({ [d.from]: a, [d.to]: b, winner: w });
      s.picks = {};
      s.roundStart = now;
      if (s.score[d.from] >= 3 || s.score[d.to] >= 3) {
        finish(d, s.score[d.from] >= 3 ? d.from : d.to, `${nameOf(d.from)} ${s.score[d.from]} : ${s.score[d.to]} ${nameOf(d.to)}`);
      }
    }
  } else if (d.game === 'clicker' && type === 'begin') {
    if (!s.start[me]) s.start[me] = now;
  } else if (d.game === 'clicker' && type === 'submit') {
    if (!s.start[me]) throw new GameError('Erst starten.');
    if (s.clicks[me] !== undefined) throw new GameError('Schon abgeschickt.');
    if (now < s.start[me] + CLICK_MS - 1500) throw new GameError('Die 10 Sekunden sind noch nicht um.');
    const n = Math.max(0, Math.floor(Number(body.clicks) || 0));
    s.clicks[me] = Math.min(n, (MAX_CPS * CLICK_MS) / 1000);
    tick(d);
  } else if (d.game === 'quiz' && type === 'begin') {
    if (!s.start[me]) { s.start[me] = now; s.qStart[me] = now; s.answers[me] = []; }
  } else if (d.game === 'quiz' && type === 'answer') {
    if (!s.start[me]) throw new GameError('Erst starten.');
    const list = s.answers[me];
    if (list.length >= QUIZ_N) throw new GameError('Schon fertig.');
    if (Number(body.index) !== list.length) throw new GameError('Falsche Frage.');
    const q = s.qs[list.length];
    const ms = now - s.qStart[me];
    const choice = Number(body.choice);
    // Zu spät oder keine Antwort = falsch
    const correct = ms <= QUIZ_Q_MS + 1000 && choice === q.answer;
    list.push({ choice: Number.isInteger(choice) ? choice : -1, correct, ms: Math.min(ms, QUIZ_Q_MS + 1000) });
    s.qStart[me] = now;
    tick(d);
    return { ...get(p, { id: d.id }), lastCorrect: correct, rightAnswer: q.options[q.answer] };
  } else {
    throw new GameError('Unbekannter Zug.');
  }
  return get(p, { id: d.id });
}

function winLine(board, row, col, mark) {
  const at = (r, c) => (r >= 0 && r < 6 && c >= 0 && c < 7 ? board[r * 7 + c] : -1);
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    const cells = [[row, col]];
    for (const sgn of [1, -1]) {
      let r = row + dr * sgn, c = col + dc * sgn;
      while (at(r, c) === mark) { cells.push([r, c]); r += dr * sgn; c += dc * sgn; }
    }
    if (cells.length >= 4) return cells.map(([r, c]) => r * 7 + c);
  }
  return null;
}

module.exports = { actions: { list, count, create, accept, decline, cancel, get, act }, GAMES, _internal: { winLine, tick, TURN_MS, SOLO_MS } };
