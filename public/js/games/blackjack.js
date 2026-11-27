// Blackjack – Frontend.
import { h, fmt, sleep, celebrate, cardEl } from '../ui.js';
import { sfx } from '../sound.js';

const RESULT = {
  win: ['Gewonnen', 'win'], blackjack: ['Blackjack!', 'win'], push: ['Unentschieden', 'push'],
  lose: ['Verloren', 'lose'], bust: ['Überkauft', 'lose'],
};

export default async function mount(root, ctx) {
  let alive = true;
  let busy = false;
  let shown = { dealer: 0, hands: [] }; // wie viele Karten schon gezeigt wurden (für Animation)

  const el = h(`<div class="game-layout">
    <div class="game-controls panel">
      <div class="bet-slot"></div>
      <button class="btn btn-gold btn-big deal-btn">KARTEN GEBEN</button>
      <div class="bj-actions">
        <button class="btn btn-green" data-a="hit">Karte <small>(H)</small></button>
        <button class="btn btn-red" data-a="stand">Halten <small>(S)</small></button>
        <button class="btn" data-a="double">Verdoppeln <small>(D)</small></button>
        <button class="btn" data-a="split">Teilen <small>(P)</small></button>
      </div>
      <div class="bj-insure hidden">
        <div class="bj-insure-q">🛡️ Dealer zeigt ein Ass – <b>Versicherung</b> für <b class="gold ins-cost"></b> Chips?<br><small class="muted">Zahlt 2:1, falls der Dealer Blackjack hat.</small></div>
        <div class="row"><button class="btn btn-gold" data-ins="1">Versichern <small>(Y)</small></button><button class="btn" data-ins="0">Nein danke <small>(N)</small></button></div>
      </div>
      <div class="muted" style="font-size:.8rem;line-height:1.5">
        Dealer zieht bis 17 · Blackjack zahlt 3:2<br>Verdoppeln auf 2 Karten · Teilen bis 4 Hände · Versicherung 2:1 · 6 Decks
      </div>
    </div>
    <div class="game-stage">
      <div class="felt bj-table">
        <div class="bj-zone">
          <div class="bj-label">Dealer <span class="bj-val dealer-val"></span></div>
          <div class="bj-cards dealer-cards"></div>
        </div>
        <div class="bj-center"><div class="result-msg"></div><div class="bj-rule">BLACKJACK ZAHLT 3 ZU 2 · DEALER STEHT AUF 17</div></div>
        <div class="bj-hands"></div>
      </div>
    </div></div>`);
  root.appendChild(el);

  const bet = ctx.bet({ game: 'blackjack', initial: 100 });
  el.querySelector('.bet-slot').appendChild(bet.el);
  const dealBtn = el.querySelector('.deal-btn');
  const actions = Object.fromEntries([...el.querySelectorAll('.bj-actions [data-a]')].map((b) => [b.dataset.a, b]));
  const dealerCardsEl = el.querySelector('.dealer-cards');
  const dealerVal = el.querySelector('.dealer-val');
  const handsEl = el.querySelector('.bj-hands');
  const msg = el.querySelector('.result-msg');

  const insureEl = el.querySelector('.bj-insure');
  function setControls(v) {
    const running = v && !v.finished && !v.none;
    const insuring = !!(running && v.canInsure);
    insureEl.classList.toggle('hidden', !insuring);
    el.querySelector('.bj-actions').classList.toggle('hidden', insuring);
    if (insuring) insureEl.querySelector('.ins-cost').textContent = fmt(v.insuranceCost);
    insureEl.querySelectorAll('button').forEach((b) => (b.disabled = busy || (b.dataset.ins === '1' && ctx.getBalance() < v?.insuranceCost)));
    dealBtn.classList.toggle('hidden', !!running);
    bet.setDisabled(!!running || busy);
    dealBtn.disabled = busy;
    actions.hit.disabled = !running || busy;
    actions.stand.disabled = !running || busy;
    actions.double.disabled = !running || busy || !v.canDouble || ctx.getBalance() < v.hands[v.activeHand].bet;
    actions.split.disabled = !running || busy || !v.canSplit || ctx.getBalance() < v.hands[v.activeHand].bet;
  }

  function renderDealer(cards, value, animateFrom, flip = false) {
    dealerCardsEl.replaceChildren(...cards.map((c, i) => cardEl(c, i >= animateFrom ? (flip && i === 1 ? 'flip' : 'deal') : '')));
    dealerVal.textContent = value ? value : '';
  }

  function renderHands(v) {
    handsEl.replaceChildren(...v.hands.map((hand, i) => {
      const prev = shown.hands[i] ?? 0;
      const res = hand.result ? RESULT[hand.result] : null;
      const box = h(`<div class="bj-hand ${i === v.activeHand && v.hands.length > 1 ? 'active' : ''} ${res ? 'res-' + res[1] : ''}">
        <div class="bj-cards"></div>
        <div class="bj-hand-info">
          <span class="bj-val">${hand.soft && hand.value < 21 && !hand.result ? `${hand.value - 10}/${hand.value}` : hand.value}</span>
          <span class="bj-bet"><span class="chip-icon"></span>${fmt(hand.bet)}${hand.doubled ? ' (×2)' : ''}</span>
          ${res ? `<span class="bj-res ${res[1]}">${res[0]}${hand.payout ? ' +' + fmt(hand.payout) : ''}</span>` : ''}
        </div></div>`);
      box.querySelector('.bj-cards').append(...hand.cards.map((c, k) => cardEl(c, k >= prev ? 'deal' : '')));
      return box;
    }));
    shown.hands = v.hands.map((x) => x.cards.length);
  }

  async function render(v, { fresh = false } = {}) {
    if (v.none) {
      setControls(null);
      return;
    }
    if (fresh) shown = { dealer: 0, hands: [] };
    const newCards = v.hands.reduce((a, x, i) => a + Math.max(0, x.cards.length - (shown.hands[i] ?? 0)), 0);
    renderHands(v);
    if (newCards) sfx.card();

    if (!v.finished) {
      renderDealer(v.dealer.cards, v.dealer.value, shown.dealer);
      shown.dealer = v.dealer.cards.length;
      msg.className = 'result-msg';
      msg.textContent = v.canInsure ? 'Versicherung?' : v.insuranceLost ? `Dealer hat keinen Blackjack – Versicherung (${fmt(v.insuranceLost)}) verloren` : v.hands.length > 1 ? `Hand ${v.activeHand + 1} von ${v.hands.length}` : '';
    } else {
      // Dealer-Karten nacheinander aufdecken
      const cards = v.dealer.cards;
      if (shown.dealer === 0) renderDealer(cards.slice(0, 2), '', 0);
      else { await sleep(250); renderDealer(cards.slice(0, 2), '', 1, true); }
      sfx.card();
      for (let n = 3; n <= cards.length; n++) {
        await sleep(550);
        if (!alive) return;
        renderDealer(cards.slice(0, n), '', n - 1);
        sfx.card();
      }
      dealerVal.textContent = v.dealerBlackjack ? 'Blackjack' : v.dealer.value;
      shown.dealer = cards.length;
      const net = v.payout - v.totalBet;
      msg.className = 'result-msg ' + (net > 0 ? 'win' : net < 0 ? 'lose' : '');
      msg.textContent = (net > 0 ? `Gewonnen: +${fmt(net)} Chips` : net < 0 ? `Verloren: −${fmt(-net)} Chips` : 'Unentschieden – Einsatz zurück')
        + (v.insurance ? (v.insurancePaid ? ' · Versicherung zahlt ' + fmt(v.insurancePaid) : ' · Versicherung verloren') : '');
      if (net > 0) celebrate(v.payout, v.totalBet);
      else if (net < 0) sfx.lose();
    }
  }

  async function act(action, body) {
    if (busy) return;
    busy = true;
    setControls(null);
    sfx.click();
    try {
      const isDeal = action === 'deal';
      const v = await ctx.post(`/api/games/blackjack/${action}`, isDeal ? { bet: bet.value } : body || {});
      if (!alive) return;
      if (v.finished) ctx.setBalance(v.balance - v.payout);
      else ctx.setBalance(v.balance);
      await render(v, { fresh: isDeal });
      if (v.finished) ctx.setBalance(v.balance);
      busy = false;
      setControls(v);
    } catch (e) {
      busy = false;
      ctx.toast(e.message, 'err');
      const v = await ctx.post('/api/games/blackjack/state').catch(() => ({ none: true }));
      setControls(v);
    }
  }

  dealBtn.addEventListener('click', () => act('deal'));
  for (const [a, b] of Object.entries(actions)) b.addEventListener('click', () => act(a));
  insureEl.querySelectorAll('[data-ins]').forEach((b) => b.addEventListener('click', () => act('insurance', { take: b.dataset.ins === '1' })));
  const keys = { h: 'hit', s: 'stand', d: 'double', p: 'split' };
  const onKey = (e) => {
    if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName)) return;
    const k = e.key.toLowerCase();
    if (!insureEl.classList.contains('hidden')) {
      if (k === 'y' || k === 'n') insureEl.querySelector(`[data-ins="${k === 'y' ? 1 : 0}"]`).click();
      return;
    }
    const a = keys[k];
    if (a && !actions[a].disabled) act(a);
    if ((e.code === 'Space' || e.key === 'Enter') && !dealBtn.classList.contains('hidden') && !dealBtn.disabled && document.activeElement?.tagName !== 'BUTTON') {
      e.preventDefault();
      act('deal');
    }
  };
  document.addEventListener('keydown', onKey);

  // Laufende Runde wieder aufnehmen (z. B. nach Neuladen)
  const v = await ctx.post('/api/games/blackjack/state');
  if (!v.none) await render(v, { fresh: true });
  setControls(v);

  return () => { alive = false; document.removeEventListener('keydown', onKey); };
}
