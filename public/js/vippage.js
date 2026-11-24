// VIP-Stufe, tägliche Aufgaben und Erfolge.
import { h, esc, fmt } from './ui.js';

export async function vip(root, ctx) {
  const o = await ctx.get('/api/me/progress');
  const pct = o.isMax ? 100 : Math.min(100, Math.round(((o.xp - o.levelXp) / Math.max(1, o.nextXp - o.levelXp)) * 100));
  const unlocked = o.achievements.filter((a) => a.unlocked).length;
  const tomorrow = new Date(); tomorrow.setHours(24, 0, 0, 0);
  const hoursLeft = Math.ceil((tomorrow - Date.now()) / 3600000);

  root.appendChild(h(`<div>
    <div class="page-head"><h1>👑 VIP & Aufgaben</h1></div>
    <div class="vip-hero" style="--tc:${o.tier.color}">
      <div class="vip-badge"><span>${o.tier.icon}</span><b>${o.level}</b></div>
      <div class="vip-main">
        <div class="vip-tier">${esc(o.tier.name)} · Stufe ${o.level}</div>
        <div class="vip-bar"><div style="width:${pct}%"></div></div>
        <div class="vip-sub">${o.isMax ? `<span>👑 Höchststufe ${o.maxLevel} erreicht!</span>`
          : `<span>${fmt(o.xp - o.levelXp)} / ${fmt(o.nextXp - o.levelXp)} XP bis Stufe ${o.level + 1}</span><span class="gold">Belohnung: +${fmt(o.nextReward)} Chips</span>`}</div>
        <div class="muted" style="font-size:.8rem;margin-top:6px">Jede Runde bringt XP: 1 XP pro ${o.xpPerChips} gesetzte Chips, höchstens ${fmt(o.xpMaxRound)} XP pro Runde.</div>
      </div>
    </div>
    <div class="vip-tiers">${o.tiers.map((t) => `<div class="vt ${o.level >= t.from ? 'reached' : ''}" style="--tc:${t.color}"><span>${t.icon}</span><b>${esc(t.name)}</b><small>ab Stufe ${t.from}</small></div>`).join('')}</div>

    <div class="settings-grid" style="margin-top:18px">
      <div class="panel">
        <h2>📅 Tägliche Aufgaben <span class="muted" style="font-size:.8rem;font-weight:500">neue in ${hoursLeft} Std.</span></h2>
        ${o.quests.map((q) => `<div class="quest ${q.done ? 'done' : ''}">
          <div class="q-top"><span>${q.done ? '✅' : '🎯'} ${esc(q.text)}</span><b class="gold">+${fmt(q.reward)}</b></div>
          <div class="vip-bar small"><div style="width:${Math.round((q.progress / q.target) * 100)}%"></div></div>
          <small class="muted">${fmt(q.progress)} / ${fmt(q.target)}</small></div>`).join('')}
        <div class="quest ${o.chest.open ? 'done' : ''}" style="margin-top:10px">
          <div class="q-top"><span>${o.chest.open ? '🧰 Tagestruhe geöffnet!' : `🔒 Tagestruhe: schaffe alle Aufgaben (${o.quests.filter((q) => q.done).length}/${o.quests.length})`}</span><b class="gold">+${fmt(o.chest.reward)}</b></div>
        </div>
      </div>
      <div class="panel">
        <h2>🔥 Tagesserie</h2>
        <p class="muted" style="margin-top:0">Hol dir jeden Tag den Tagesbonus ab – mit jedem Tag in Folge wird er größer. Einen Tag verpasst? Dann geht es wieder bei Tag 1 los.</p>
        <div class="streak-row">${o.streak.days.map((amount, i) => {
          const day = i + 1, s = o.streak;
          const got = day <= Math.min(s.streak, s.maxDay);
          const next = s.available && day === Math.min(s.nextDay, s.maxDay);
          return `<div class="streak-day ${got ? 'got' : ''} ${next ? 'next' : ''}"><small>Tag ${day}${day === s.maxDay ? '+' : ''}</small><b>${fmt(amount)}</b></div>`;
        }).join('')}</div>
        <p style="margin-bottom:0">${o.streak.available
          ? `Heute abholen: <b class="gold">+${fmt(o.streak.amount)}</b> (Tag ${o.streak.nextDay})`
          : `✅ Heute abgeholt (Tag ${o.streak.streak}). Morgen: <b class="gold">+${fmt(o.streak.tomorrow)}</b> – nicht vergessen!`}</p>
      </div>
      <div class="panel">
        <h2>📈 Diese Woche</h2>
        <div class="kv"><span>Gewinn/Verlust</span><span class="${o.weekly.net >= 0 ? 'pos' : 'neg'}">${o.weekly.net >= 0 ? '+' : '−'}${fmt(Math.abs(o.weekly.net))}</span></div>
        <div class="kv"><span>Runden</span><span>${fmt(o.weekly.rounds)}</span></div>
        <div class="kv"><span>Eingesetzt</span><span>${fmt(o.weekly.wagered)}</span></div>
        <p class="muted" style="font-size:.85rem">Die Top 3 der Woche (nach Gewinn) bekommen am Montag <b class="gold">25.000 / 10.000 / 5.000</b> Chips.</p>
        <a class="btn btn-sm" href="#/leaderboard?tab=week">Zur Wochen-Rangliste</a>
      </div>
    </div>

    <div class="panel section">
      <h2>🏅 Erfolge <span class="muted" style="font-size:.85rem;font-weight:500">${unlocked} / ${o.achievements.length}</span></h2>
      <div class="ach-grid">${o.achievements.map((a) => `<div class="ach ${a.unlocked ? 'on' : ''}" title="${esc(a.desc)}">
        <span class="ach-icon">${a.icon}</span><b>${esc(a.name)}</b><small>${esc(a.desc)}</small><span class="gold">+${fmt(a.reward)}</span></div>`).join('')}</div>
    </div>
  </div>`));
}
