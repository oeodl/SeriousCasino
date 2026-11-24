// Fortschritt: XP & VIP-Stufen, tägliche Aufgaben, Erfolge, Wochen-Rangliste.
// Wird nach jeder abgeschlossenen Runde aufgerufen (aus profiles.record).
// Ereignisse (Aufstieg, Aufgabe geschafft, Erfolg) landen in p.notices und werden beim nächsten Ping angezeigt.
const db = require('./db');

// ---------- XP & Stufen ----------
const XP_PER_CHIPS = 10; // 1 XP pro 10 gesetzte Chips …
const XP_MAX_ROUND = 500; // … aber höchstens 500 XP pro Runde (sonst steigen Spieler mit riesigen Einsätzen endlos auf)
const MAX_LEVEL = 100;
const xpForLevel = (lvl) => Math.round(400 * (Math.pow(lvl, 1.6) - 1)); // XP, die man insgesamt für diese Stufe braucht (Stufe 1 = 0)
const TIERS = [
  { from: 1, name: 'Bronze', icon: '🥉', color: '#cd7f32' },
  { from: 10, name: 'Silber', icon: '🥈', color: '#c0c7d0' },
  { from: 20, name: 'Gold', icon: '🥇', color: '#e3b341' },
  { from: 30, name: 'Platin', icon: '💠', color: '#7fd6e3' },
  { from: 40, name: 'Diamant', icon: '💎', color: '#9ad7ff' },
  { from: 60, name: 'Legende', icon: '👑', color: '#ff6bd6' },
];
const tierOf = (lvl) => [...TIERS].reverse().find((t) => lvl >= t.from);
const levelUpReward = (lvl) => 250 * lvl;

function levelFromXp(xp) {
  let lvl = 1;
  while (lvl < MAX_LEVEL && xp >= xpForLevel(lvl + 1)) lvl++;
  return lvl;
}

function vip(p) {
  const v = (p.vip ||= { xp: 0, level: 1 });
  // Alte Spielstände aus der Zeit ohne Obergrenze auf die Höchststufe zurückholen
  if (!(v.level <= MAX_LEVEL) || !(v.xp <= xpForLevel(MAX_LEVEL))) {
    v.level = Math.min(MAX_LEVEL, Math.max(1, Math.floor(v.level) || 1));
    v.xp = Math.min(Number(v.xp) || 0, xpForLevel(MAX_LEVEL));
  }
  return v;
}

// ---------- Tägliche Aufgaben ----------
const today = () => new Date().toLocaleDateString('sv-SE');
const QUEST_GAMES = ['slots', 'blackjack', 'roulette', 'mines', 'plinko', 'crash', 'dice', 'keno', 'tower', 'hilo', 'baccarat', 'limbo', 'wheel', 'livecrash'];
const GAME_LABEL = () => require('./profiles').GAME_NAMES;

/** Einfacher Zufall aus einem Text (gleiche Aufgaben für denselben Tag/Spieler) */
function seeded(str) {
  let h = 2166136261;
  for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
}

function makeQuests(p) {
  const rnd = seeded(p.id + today());
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const g1 = pick(QUEST_GAMES);
  let g2 = pick(QUEST_GAMES);
  if (g2 === g1) g2 = QUEST_GAMES[(QUEST_GAMES.indexOf(g1) + 3) % QUEST_GAMES.length];
  const names = GAME_LABEL();
  const pool = [
    { type: 'play', game: g1, target: 10, reward: 600, text: `Spiele 10 Runden ${names[g1]}` },
    { type: 'win', game: g2, target: 3, reward: 800, text: `Gewinne 3 Runden ${names[g2]}` },
    { type: 'wager', target: 5000, reward: 700, text: 'Setze insgesamt 5.000 Chips' },
    { type: 'mult', target: 5, reward: 1000, text: 'Gewinne einmal mindestens 5× deinen Einsatz' },
    { type: 'variety', target: 5, reward: 900, text: 'Spiele 5 verschiedene Spiele' },
    { type: 'wins', target: 15, reward: 1200, text: 'Gewinne 15 Runden (beliebige Spiele)' },
  ];
  const chosen = [];
  while (chosen.length < 3) { const q = pick(pool); if (!chosen.includes(q)) chosen.push(q); }
  return { date: today(), list: chosen.map((q, i) => ({ ...q, id: i, progress: 0, done: false, seen: [] })) };
}

function quests(p) {
  if (!p.quests || p.quests.date !== today()) p.quests = makeQuests(p);
  return p.quests;
}

// Tagestruhe: Bonus, wenn alle Aufgaben des Tages geschafft sind
const CHEST_REWARD = 2500;

// ---------- Erfolge ----------
const ACHIEVEMENTS = [
  { id: 'firstwin', icon: '🎉', name: 'Erster Gewinn', desc: 'Gewinne deine erste Runde', reward: 250, test: (c) => c.payout > c.bet },
  { id: 'x10', icon: '🔥', name: 'Zehnfach', desc: 'Gewinne 10× deinen Einsatz', reward: 1000, test: (c) => c.bet > 0 && c.payout >= c.bet * 10 },
  { id: 'x100', icon: '💥', name: 'Hundertfach', desc: 'Gewinne 100× deinen Einsatz', reward: 5000, test: (c) => c.bet > 0 && c.payout >= c.bet * 100 },
  { id: 'r100', icon: '🎲', name: 'Stammgast', desc: 'Spiele 100 Runden', reward: 1000, test: (c, p) => p.stats.rounds >= 100 },
  { id: 'r1000', icon: '🏛️', name: 'Inventar', desc: 'Spiele 1.000 Runden', reward: 10000, test: (c, p) => p.stats.rounds >= 1000 },
  { id: 'explorer', icon: '🧭', name: 'Entdecker', desc: 'Spiele 15 verschiedene Spiele', reward: 3000, test: (c, p) => Object.keys(p.stats.perGame).filter((g) => g !== 'admin').length >= 15 },
  { id: 'highroller', icon: '💰', name: 'High Roller', desc: 'Setze 10.000 Chips in einer Runde', reward: 2500, test: (c) => c.bet >= 10000 },
  { id: 'rich', icon: '🤑', name: 'Reich', desc: 'Erreiche 100.000 Chips Guthaben', reward: 5000, test: (c, p) => p.balance >= 100000 },
  { id: 'duelist', icon: '⚔️', name: 'Duellant', desc: 'Gewinne ein Duell', reward: 1000, test: (c) => c.game === 'duel' && c.payout > c.bet },
  { id: 'battler', icon: '📦', name: 'Battle-Sieger', desc: 'Gewinne ein Case Battle', reward: 1500, test: (c) => c.game === 'casebattle' && c.payout > 0 },
  { id: 'rocket', icon: '🚀', name: 'Raketenreiter', desc: 'Steig bei Live-Crash ab 10× aus', reward: 3000, test: (c) => c.game === 'livecrash' && c.payout >= c.bet * 10 },
  { id: 'blackjack', icon: '🃏', name: 'Natural', desc: 'Gewinne beim Blackjack mit einem Blackjack', reward: 500, test: (c) => c.game === 'blackjack' && c.payout === Math.floor(c.bet * 2.5) },
  { id: 'lvl10', icon: '🥈', name: 'Silber-Status', desc: 'Erreiche Stufe 10', reward: 3000, test: (c, p) => vip(p).level >= 10 },
  { id: 'lvl25', icon: '🥇', name: 'Gold-Status', desc: 'Erreiche Stufe 25', reward: 10000, test: (c, p) => vip(p).level >= 25 },
  { id: 'unlucky', icon: '🌧️', name: 'Pechvogel', desc: 'Verliere 10 Runden hintereinander', reward: 500, test: (c, p) => (p.loseStreak || 0) >= 10 },
];

// ---------- Wochen-Rangliste ----------
function weekKey(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear();
  const w = Math.ceil(((t - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7);
  return `${y}-W${String(w).padStart(2, '0')}`;
}
const WEEK_PRIZES = [25000, 10000, 5000];

function weekly(p) {
  const wk = weekKey();
  if (!p.weekly || p.weekly.week !== wk) p.weekly = { week: wk, net: 0, wagered: 0, rounds: 0, best: 0 };
  return p.weekly;
}

/** Preise der letzten Woche einmalig auszahlen (wird bei Bedarf aufgerufen) */
function payWeeklyPrizes() {
  const data = db.get();
  const current = weekKey();
  const last = weekKey(new Date(Date.now() - 7 * 86400000));
  data.weeklyState ||= { paid: last }; // beim ersten Start nichts rückwirkend auszahlen
  if (data.weeklyState.paid === last || data.weeklyState.paid === current) return;
  const ranking = Object.values(data.profiles)
    .filter((p) => p.weekly?.week === last && p.weekly.rounds > 0)
    .sort((a, b) => b.weekly.net - a.weekly.net);
  ranking.slice(0, WEEK_PRIZES.length).forEach((p, i) => {
    p.balance += WEEK_PRIZES[i];
    notice(p, { type: 'weekly', text: `🏆 Platz ${i + 1} in der Wochen-Rangliste! +${WEEK_PRIZES[i].toLocaleString('de-DE')} Chips` });
    require('./chat').system(`🏆 ${p.name} wird Platz ${i + 1} der Woche und bekommt ${WEEK_PRIZES[i].toLocaleString('de-DE')} Chips!`);
  });
  data.weeklyState.paid = last;
  data.weeklyState.lastWinners = ranking.slice(0, 3).map((p, i) => ({ name: p.name, net: p.weekly.net, prize: WEEK_PRIZES[i] }));
}

function weeklyBoard() {
  payWeeklyPrizes();
  const wk = weekKey();
  return {
    week: wk,
    prizes: WEEK_PRIZES,
    lastWinners: db.get().weeklyState?.lastWinners || [],
    list: Object.values(db.get().profiles)
      .map((p) => ({ name: p.name, ...(p.weekly?.week === wk ? p.weekly : { net: 0, wagered: 0, rounds: 0, best: 0 }), level: vip(p).level }))
      .filter((x) => x.rounds > 0)
      .sort((a, b) => b.net - a.net),
  };
}

// ---------- Hinweise an den Spieler ----------
function notice(p, n) {
  p.notices = [...(p.notices || []), { ...n, at: Date.now() }].slice(-20);
  // Wichtige Hinweise zusätzlich als Push aufs Handy/den PC
  if (n.type === 'tip' || n.type === 'weekly') require('./push').send(p, 'Spaß-Casino', n.text, n.type === 'weekly' ? '#/leaderboard' : '#/');
}
function takeNotices(p) {
  const n = p.notices || [];
  p.notices = [];
  return n;
}

// ---------- Nach jeder Runde ----------
function onRound(p, game, bet, payout) {
  if (game === 'admin') return;
  const v = vip(p);
  // XP & Stufe
  v.xp = Math.min(v.xp + Math.min(XP_MAX_ROUND, Math.max(1, Math.floor(bet / XP_PER_CHIPS))), xpForLevel(MAX_LEVEL));
  const newLevel = levelFromXp(v.xp);
  while (v.level < newLevel) {
    v.level++;
    const r = levelUpReward(v.level);
    p.balance += r;
    const t = tierOf(v.level);
    notice(p, { type: 'level', level: v.level, text: `⬆️ Stufe ${v.level} erreicht (${t.icon} ${t.name})! +${r.toLocaleString('de-DE')} Chips` });
    if (v.level % 5 === 0 || TIERS.some((x) => x.from === v.level)) require('./chat').system(`⬆️ ${p.name} erreicht Stufe ${v.level} (${t.icon} ${t.name})!`);
  }
  // Pechsträhne (für Erfolg)
  p.loseStreak = payout < bet ? (p.loseStreak || 0) + 1 : 0;
  // Woche
  const w = weekly(p);
  w.rounds++;
  w.wagered += bet;
  w.net += payout - bet;
  w.best = Math.max(w.best, payout - bet);
  // Aufgaben
  const q = quests(p);
  for (const t of q.list) {
    if (t.done) continue;
    if (t.type === 'play' && game === t.game) t.progress++;
    if (t.type === 'win' && game === t.game && payout > bet) t.progress++;
    if (t.type === 'wager') t.progress += bet;
    if (t.type === 'mult' && bet > 0 && payout >= bet * t.target) t.progress = t.target;
    if (t.type === 'variety' && !t.seen.includes(game)) { t.seen.push(game); t.progress = t.seen.length; }
    if (t.type === 'wins' && payout > bet) t.progress++;
    if (t.progress >= t.target) {
      t.progress = t.target;
      t.done = true;
      p.balance += t.reward;
      notice(p, { type: 'quest', text: `✅ Aufgabe geschafft: ${t.text} – +${t.reward.toLocaleString('de-DE')} Chips` });
    }
  }
  if (!q.chest && q.list.every((t) => t.done)) {
    q.chest = true;
    p.balance += CHEST_REWARD;
    notice(p, { type: 'chest', text: `🧰 Tagestruhe geöffnet: alle Aufgaben geschafft! +${CHEST_REWARD.toLocaleString('de-DE')} Chips` });
    require('./chat').system(`🧰 ${p.name} hat alle Tagesaufgaben geschafft!`);
  }
  // Erfolge
  p.achievements ||= {};
  const c = { game, bet, payout };
  for (const a of ACHIEVEMENTS) {
    if (p.achievements[a.id]) continue;
    let ok = false;
    try { ok = a.test(c, p); } catch { ok = false; }
    if (ok) {
      p.achievements[a.id] = Date.now();
      p.balance += a.reward;
      notice(p, { type: 'achievement', text: `${a.icon} Erfolg freigeschaltet: ${a.name} – +${a.reward.toLocaleString('de-DE')} Chips` });
    }
  }
}

/** Übersicht für die VIP-Seite */
function overview(p) {
  const v = vip(p);
  const cur = xpForLevel(v.level), next = xpForLevel(v.level + 1);
  const t = tierOf(v.level);
  const max = v.level >= MAX_LEVEL;
  return {
    level: v.level, xp: v.xp, levelXp: cur, nextXp: next, tier: t, tiers: TIERS, maxLevel: MAX_LEVEL, isMax: max,
    nextReward: max ? 0 : levelUpReward(v.level + 1), xpPerChips: XP_PER_CHIPS, xpMaxRound: XP_MAX_ROUND,
    quests: quests(p).list.map(({ seen, ...q }) => q), chest: { reward: CHEST_REWARD, open: !!quests(p).chest },
    streak: require('./profiles').dailyInfo(p),
    achievements: ACHIEVEMENTS.map(({ test, ...a }) => ({ ...a, unlocked: p.achievements?.[a.id] || null })),
    weekly: weekly(p),
  };
}

const badge = (p) => { const v = vip(p); const t = tierOf(v.level); return { level: v.level, icon: t.icon, tier: t.name, color: t.color }; };

module.exports = { onRound, overview, takeNotices, notice, weeklyBoard, payWeeklyPrizes, badge, weekKey };
