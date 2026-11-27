// Multiplayer-Blackjack – bis zu 5 Spieler an einem Tisch gegen denselben Dealer.
// Mit Teilen (bis 4 Hände) und Versicherung, wenn der Dealer ein Ass zeigt.
// Man kann mehrere Plätze gleichzeitig belegen – jeder Platz hat eigenen Einsatz und eigene Hände.
import { h, esc, fmt, celebrate, cardEl } from '../ui.js';
import { sfx } from '../sound.js';

const RES = { win: ['Gewonnen', 'pos'], blackjack: ['Blackjack!', 'pos'], push: ['Unentschieden', 'muted'], lose: ['Verloren', 'neg'], bust: ['Überkauft', 'neg'] };

export default async function mount(root, ctx) {
  let alive = true, pollTimer = 0, st = null, busy = false, lastRound = null, lastPhase = null;
  let shownSeat = {}, shownDealer = 0, dealerReveal = null, seatKeys = [];

  const el = h(`<div class="game-layout">
    <div class="game-controls panel">
      <div class="bet-slot"></div>
      <button class="btn btn-gold btn-big bet-btn">EINSATZ SETZEN</button>
      <div class="bj-insure hidden">
        <div class="bj-insure-q">🛡️ Dealer zeigt ein Ass – <b>Versicherung</b> für <b class="gold ins-cost"></b> Chips?<br><small class="muted">Zahlt 2:1, falls der Dealer Blackjack hat.</small></div>
        <div class="row"><button class="btn btn-gold" data-ins="1">Versichern <small>(Y)</small></button><button class="btn" data-ins="0">Nein danke <small>(N)</small></button></div>
      </div>
      <div class="bj-actions">
        <button class="btn btn-green" data-a="hit">Karte <small>(H)</small></button>
        <button class="btn btn-red" data-a="stand">Halten <small>(S)</small></button>
        <button class="btn" data-a="double">Verdoppeln <small>(D)</small></button>
        <button class="btn" data-a="split">Teilen <small>(P)</small></button>
      </div>
      <button class="btn btn-sm leave-btn hidden">Tisch verlassen</button>
      <p class="muted" style="margin:0;font-size:.8rem;line-height:1.5">Bis zu 5 Plätze, ein Dealer – du kannst auch mehrere Plätze belegen. Wenn der erste setzt, läuft die Wettphase 15 s. Zeigt der Dealer ein Ass, kann sich jeder 10 s lang versichern. Danach ist jeder der Reihe nach dran (20 s pro Hand, sonst wird gehalten). Blackjack zahlt 3:2, Teilen bis 4 Hände, Dealer steht auf 17.</p>
    </div>
    <div class="game-stage">
      <div class="bjt-wrap"><div class="felt bj-table bjt-table">
        <div class="bj-zone">
          <div class="bj-label">Dealer <span class="bj-val dealer-val"></span></div>
          <div class="bj-cards dealer-cards"></div>
        </div>
        <div class="bj-center"><div class="bjt-phase"></div><div class="result-msg"></div></div>
        <div class="bjt-seats"></div></div>
      </div>
    </div></div>`);
  root.appendChild(el);

  const amount = ctx.bet({ game: 'bjtable', initial: 100, label: 'Einsatz' });
  el.querySelector('.bet-slot').appendChild(amount.el);
  const betBtn = el.querySelector('.bet-btn'), leaveBtn = el.querySelector('.leave-btn');
  const actBtns = [...el.querySelectorAll('.bj-actions [data-a]')];
  const actionsEl = el.querySelector('.bj-actions'), insureEl = el.querySelector('.bj-insure');
  const dealerEl = el.querySelector('.dealer-cards'), dealerVal = el.querySelector('.dealer-val');
  const seatsEl = el.querySelector('.bjt-seats'), phaseEl = el.querySelector('.bjt-phase'), msg = el.querySelector('.result-msg');

  async function post(path, body) {
    if (busy) return;
    busy = true;
    try { const s = await ctx.post(path, body); busy = false; onState(s); return s; } catch (e) { busy = false; ctx.toast(e.message, 'err'); }
  }

  betBtn.addEventListener('click', async () => {
    const mine = (st?.mySeats || []).map((i) => st.seats[i]).filter(Boolean);
    if (mine.length <= 1) { if (await post('/api/table/blackjack/bet', { amount: amount.value, seat: mine[0]?.seat })) sfx.chip(); return; }
    // Mehrere Plätze: auf alle ohne Einsatz setzen – haben alle schon, auf alle nachlegen
    const targets = mine.some((x) => !x.bet) ? mine.filter((x) => !x.bet) : mine;
    let ok = false;
    for (const x of targets) { if (await post('/api/table/blackjack/bet', { amount: amount.value, seat: x.seat })) ok = true; else break; }
    if (ok) sfx.chip();
  });
  leaveBtn.addEventListener('click', () => post('/api/table/blackjack/leave'));
  seatsEl.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.sit !== undefined) post('/api/table/blackjack/sit', { seat: Number(b.dataset.sit) });
    else if (b.dataset.betseat !== undefined) { if (await post('/api/table/blackjack/bet', { amount: amount.value, seat: Number(b.dataset.betseat) })) sfx.chip(); }
    else if (b.dataset.leaveseat !== undefined) post('/api/table/blackjack/leave', { seat: Number(b.dataset.leaveseat) });
  });
  actBtns.forEach((b) => b.addEventListener('click', () => { sfx.click(); post('/api/table/blackjack/act', { action: b.dataset.a }); }));
  insureEl.querySelectorAll('[data-ins]').forEach((b) => b.addEventListener('click', async () => {
    if (await post('/api/table/blackjack/insure', { take: b.dataset.ins === '1', seat: insureSeat() }) && b.dataset.ins === '1') sfx.chip();
  }));
  const onKey = (e) => {
    if (e.target.matches('input, textarea')) return;
    const k = e.key.toLowerCase();
    if (!insureEl.classList.contains('hidden') && (k === 'y' || k === 'n')) { insureEl.querySelector(`[data-ins="${k === 'y' ? 1 : 0}"]`).click(); return; }
    const a = { h: 'hit', s: 'stand', d: 'double', p: 'split' }[k];
    const b = a && actBtns.find((x) => x.dataset.a === a);
    if (b && !b.disabled) b.click();
  };
  document.addEventListener('keydown', onKey);

  function paintDealer(s) {
    let cards = s.dealer.cards;
    let value = s.dealer.blackjack ? 'Blackjack' : s.dealer.value;
    if (s.phase === 'dealer' && dealerReveal) {
      // Dealer-Karten nacheinander aufdecken
      const n = Math.min(cards.length, 2 + Math.floor((Date.now() - dealerReveal) / s.dealerStepMs));
      cards = cards.slice(0, n);
      value = null;
    }
    const hiddenNow = dealerEl.children[1]?.classList.contains('back');
    if (cards.length !== shownDealer || (cards[1] && hiddenNow)) {
      const from = cards.length < shownDealer ? 0 : shownDealer;
      dealerEl.replaceChildren(...cards.map((c, i) => cardEl(c, i === 1 && c && (hiddenNow || i >= from) ? 'flip' : i >= from ? 'deal' : '')));
      if (cards.length > shownDealer) sfx.card?.();
      shownDealer = cards.length;
    }
    dealerVal.textContent = value === null ? '' : cards.length ? value : '';
  }

  // Plätze nur neu zeichnen, wenn sich dort wirklich etwas geändert hat –
  // sonst würden Animationen (Karten, Ergebnis-Schild, Zeitbalken) bei jeder Abfrage neu starten.
  function seatKey(s, seat, i) {
    if (!seat) return `empty|${canSit(s)}|${(s.mySeats || []).length > 0}`;
    return JSON.stringify([seat, s.turn === i && s.phase === 'playing' ? `turn${seat.cur}` : '', s.phase === 'insurance' && !seat.insDecided, s.phase === 'betting' || s.phase === 'result', amount.value, (s.mySeats || []).length]);
  }

  function seatEl(s, seat, i) {
    if (!seat) {
      const more = (s.mySeats || []).length > 0;
      return h(`<div class="bjt-seat empty">${canSit(s) ? `<button class="btn btn-sm" data-sit="${i}" title="${more ? 'Zusätzlichen Platz belegen' : ''}">${more ? `+ Platz ${i + 1}` : `Platz ${i + 1} nehmen`}</button>` : `<span class="muted">Platz ${i + 1} frei</span>`}</div>`);
    }
    const turn = s.turn === i && s.phase === 'playing';
    const prev = shownSeat[i] || [];
    const net = seat.payout === null ? null : seat.payout - seat.bet - seat.insurance;
    const box = h(`<div class="bjt-seat ${turn ? 'active' : ''} ${seat.me ? 'me' : ''} ${net === null ? '' : net > 0 ? 'won' : net < 0 ? 'lost' : ''}">
      <div class="bjt-hands"></div>
      <div class="bj-hand-info">${seat.bet ? `<span class="lc-bet"><span class="chip-icon"></span>${fmt(seat.bet)}</span>` : '<span class="muted">kein Einsatz</span>'}${seat.insurance ? `<span class="bjt-ins" title="Versicherung">🛡️ ${fmt(seat.insurance)}</span>` : ''}</div>
      <div class="bjt-name">${seat.me && (s.mySeats || []).length > 1 ? `<span class="gold">Du · Platz ${i + 1}</span>` : `${esc(seat.name)}${seat.me ? ' <small class="gold">(du)</small>' : ''}`}</div>
      ${seat.me && s.phase === 'betting' ? `<div class="bjt-seat-tools"><button class="btn btn-sm btn-gold" data-betseat="${i}" title="Einsatz auf diesen Platz">+${fmt(amount.value)}</button>${!seat.bet ? `<button class="btn btn-sm btn-ghost" data-leaveseat="${i}" title="Platz freigeben">✕</button>` : ''}</div>` : ''}
      ${seat.me && s.phase === 'result' && (s.mySeats || []).length > 1 ? `<button class="btn btn-sm btn-ghost bjt-free" data-leaveseat="${i}">Platz freigeben</button>` : ''}
      ${s.phase === 'insurance' && seat.hands.length ? `<div class="bjt-wait">${seat.insDecided ? (seat.insurance ? 'versichert' : 'keine Versicherung') : 'überlegt …'}</div>` : ''}
      ${turn ? `<div class="bjt-timer"><i style="animation-duration:${s.timeLeft}ms"></i></div>` : ''}
      ${net !== null ? `<div class="bjt-res ${net > 0 ? 'pos' : net < 0 ? 'neg' : 'muted'}">${net > 0 ? '+' + fmt(net) : net < 0 ? '−' + fmt(-net) : '±0'}${seat.insPaid ? ' · 🛡️ zahlt' : ''}</div>` : ''}
    </div>`);
    const handsEl = box.querySelector('.bjt-hands');
    seat.hands.forEach((hd, k) => {
      const res = hd.result ? RES[hd.result] : null;
      const hb = h(`<div class="bjt-hand ${turn && seat.cur === k && seat.hands.length > 1 ? 'cur' : ''} ${res ? 'res-' + res[1] : ''}">
        <div class="bj-cards"></div>
        <div class="bjt-hand-val"><span class="bj-val">${hd.soft && hd.value < 21 && !hd.result ? `${hd.value - 10}/${hd.value}` : hd.value}</span>${seat.hands.length > 1 ? `<small>${fmt(hd.bet)}</small>` : ''}${hd.doubled ? '<small>×2</small>' : ''}</div>
        ${res ? `<div class="bjt-hand-res ${res[1]}">${res[0]}</div>` : ''}
      </div>`);
      hb.querySelector('.bj-cards').append(...hd.cards.map((c, j) => cardEl(c, j >= (prev[k] ?? 0) ? 'deal' : '')));
      handsEl.appendChild(hb);
    });
    const now = seat.hands.map((x) => x.cards.length);
    if (now.some((n, k) => n > (prev[k] ?? 0))) sfx.card?.();
    shownSeat[i] = now;
    return box;
  }

  const canSit = (s) => ['betting', 'result'].includes(s.phase);
  const insureSeat = () => (st?.mySeats || []).find((i) => st.seats[i]?.hands.length && !st.seats[i].insDecided);

  function paintSeats(s) {
    if (seatsEl.children.length !== s.seats.length) { seatsEl.replaceChildren(...s.seats.map(() => document.createElement('div'))); seatKeys = []; }
    s.seats.forEach((seat, i) => {
      const key = seatKey(s, seat, i);
      if (seatKeys[i] === key) return;
      seatKeys[i] = key;
      seatsEl.children[i].replaceWith(seatEl(s, seat, i));
    });
  }

  function onState(s) {
    const newRound = s.round !== lastRound;
    const changed = newRound || s.phase !== lastPhase;
    st = s;
    if (newRound) { shownSeat = {}; shownDealer = 0; dealerEl.replaceChildren(); }
    if (changed) {
      if (s.phase === 'betting') { msg.className = 'result-msg'; msg.textContent = ''; }
      dealerReveal = s.phase === 'dealer' ? Date.now() - (s.dealer.cards.length - 1) * s.dealerStepMs + s.timeLeft : null;
      if (s.phase === 'result') {
        const mine = (s.mySeats || []).map((i) => s.seats[i]).filter((x) => x && x.payout !== null && x.payout !== undefined);
        const me = mine.length ? { bet: mine.reduce((a, x) => a + x.bet, 0), insurance: mine.reduce((a, x) => a + x.insurance, 0), payout: mine.reduce((a, x) => a + x.payout, 0), insPaid: mine.reduce((a, x) => a + x.insPaid, 0) } : null;
        if (me) {
          const staked = me.bet + me.insurance;
          const net = me.payout - staked;
          msg.className = 'result-msg ' + (net > 0 ? 'win' : net < 0 ? 'lose' : 'push');
          msg.textContent = (net > 0 ? `Gewonnen: +${fmt(net)}` : net < 0 ? `Verloren: −${fmt(-net)}` : 'Unentschieden – Einsatz zurück')
            + (me.insurance ? (me.insPaid ? ' · Versicherung zahlt' : ' · Versicherung verloren') : '');
          if (net > 0) celebrate(me.payout, staked); else if (net < 0) sfx.lose();
        }
      }
      if (lastPhase === 'insurance' && s.phase === 'playing') {
        const me = { insurance: (s.mySeats || []).reduce((a, i) => a + (s.seats[i]?.insurance || 0), 0) };
        if (me.insurance) { msg.className = 'result-msg lose'; msg.textContent = 'Dealer hat keinen Blackjack – Versicherung verloren'; }
      }
    }
    lastRound = s.round;
    lastPhase = s.phase;
    if (s.balance !== null && s.balance !== undefined && !busy) ctx.setBalance(s.balance);

    const secs = s.timeLeft !== null ? Math.ceil(s.timeLeft / 1000) : null;
    const turnSeat = s.turn >= 0 ? s.seats[s.turn] : null;
    const mySeats = (s.mySeats || []).map((i) => s.seats[i]).filter(Boolean);
    const meSeat = turnSeat?.me ? turnSeat : mySeats[0];
    phaseEl.innerHTML = s.phase === 'betting'
      ? (secs !== null ? `<span class="pos">Einsätze</span> – noch <b>${secs} s</b>` : s.seats.some(Boolean) ? 'Warte auf den ersten Einsatz …' : 'Setz dich an den Tisch!')
      : s.phase === 'insurance' ? `🛡️ Versicherung? – noch <b>${secs} s</b>`
        : s.phase === 'playing' ? (turnSeat?.me ? `<span class="gold">Du bist dran${mySeats.length > 1 ? ` – Platz ${s.turn + 1}` : ''}${turnSeat.hands.length > 1 ? ` (Hand ${turnSeat.cur + 1}/${turnSeat.hands.length})` : ''}!</span> (${secs} s)` : `${esc(turnSeat?.name || '')} ist dran …`)
          : s.phase === 'dealer' ? 'Dealer zieht …' : `Nächste Runde in ${secs} s`;

    paintDealer(s);
    paintSeats(s);
    const myTurn = s.phase === 'playing' && !!turnSeat?.me;
    const insSeatIdx = s.phase === 'insurance' ? (s.mySeats || []).find((i) => s.seats[i]?.hands.length && !s.seats[i].insDecided) : undefined;
    const insuring = insSeatIdx !== undefined;
    insureEl.classList.toggle('hidden', !insuring);
    actionsEl.classList.toggle('hidden', insuring);
    if (insuring) insureEl.querySelector('.ins-cost').textContent = fmt(Math.floor(s.seats[insSeatIdx].hands[0].bet / 2)) + (mySeats.length > 1 ? ' (Platz ' + (insSeatIdx + 1) + ')' : '');
    insureEl.querySelectorAll('button').forEach((b) => (b.disabled = busy));
    actBtns.forEach((b) => {
      const a = b.dataset.a;
      b.disabled = busy || !myTurn || (a === 'double' && !meSeat?.canDouble) || (a === 'split' && !meSeat?.canSplit);
    });
    betBtn.disabled = busy || s.phase !== 'betting';
    betBtn.textContent = mySeats.length > 1 ? (s.phase === 'betting' && !mySeats.some((x) => !x.bet) ? 'ÜBERALL NACHLEGEN' : 'AUF ALLE PLÄTZE SETZEN') : mySeats[0]?.bet && s.phase === 'betting' ? 'NACHLEGEN' : 'EINSATZ SETZEN';
    leaveBtn.textContent = mySeats.length > 1 ? 'Alle Plätze verlassen' : 'Tisch verlassen';
    leaveBtn.classList.toggle('hidden', !mySeats.length || (mySeats.some((x) => x.hands.length > 0) && s.phase !== 'result'));
  }

  async function poll() {
    if (!alive) return;
    try { onState(await ctx.get('/api/table/blackjack')); } catch { /* nächster Versuch */ }
    pollTimer = setTimeout(poll, st?.phase === 'dealer' ? 250 : 500);
  }
  await poll();
  return () => { alive = false; clearTimeout(pollTimer); document.removeEventListener('keydown', onKey); };
}
