// Blackjack: 6 Decks, Dealer steht auf allen 17, Blackjack zahlt 3:2.
// Double auf die ersten zwei Karten (auch nach Split), Split bis zu 4 Hände,
// geteilte Asse bekommen nur je eine Karte. Dealer prüft sofort auf Blackjack.
// Versicherung: Zeigt der Dealer ein Ass, kann man sich für den halben Einsatz versichern (zahlt 2:1, wenn der Dealer Blackjack hat).
const { makeDeck, parseBet, GameError } = require('../util');
const profiles = require('../profiles');

const DECKS = 6;
const MAX_HANDS = 4;

const cardValue = (c) => (c.r === 14 ? 11 : c.r >= 10 ? 10 : c.r);

function handValue(cards) {
  let total = 0, aces = 0;
  for (const c of cards) {
    total += cardValue(c);
    if (c.r === 14) aces++;
  }
  while (total > 21 && aces) { total -= 10; aces--; }
  return { total, soft: aces > 0 };
}

const isBlackjack = (cards) => cards.length === 2 && handValue(cards).total === 21;

function draw(st) {
  // Admin-Steuerung: vorgegebene nächste Karten (Rang 2–14) zuerst ausgeben
  if (st.forced?.length) return { r: st.forced.shift(), s: ['♠', '♥', '♦', '♣'][Math.floor(Math.random() * 4)] };
  if (!st.shoe.length) st.shoe = makeDeck(DECKS);
  return st.shoe.pop();
}

function current(p) {
  const st = p.active.blackjack;
  if (!st) throw new GameError('Keine laufende Runde.');
  return st;
}

function view(st, finished = false, extra = {}) {
  const dealerCards = finished ? st.dealer : [st.dealer[0], null];
  const hand = st.hands[st.activeHand];
  const v = hand ? handValue(hand.cards).total : 0;
  const insuring = st.insurance === 'offered';
  return {
    finished,
    dealer: { cards: dealerCards, value: finished ? handValue(st.dealer).total : handValue([st.dealer[0]]).total },
    hands: st.hands.map((h) => ({ cards: h.cards, bet: h.bet, value: handValue(h.cards).total, soft: handValue(h.cards).soft, done: h.done, doubled: h.doubled, result: h.result ?? null, payout: h.payout ?? null })),
    activeHand: finished ? -1 : st.activeHand,
    canDouble: !finished && !insuring && !!hand && hand.cards.length === 2 && !hand.splitAces && v < 21,
    canSplit: !finished && !insuring && !!hand && hand.cards.length === 2 && cardValue(hand.cards[0]) === cardValue(hand.cards[1]) && st.hands.length < MAX_HANDS && !hand.splitAces,
    canInsure: !finished && insuring,
    insuranceCost: insuring ? Math.floor(st.hands[0].bet / 2) : 0,
    insurance: st.insuranceBet || 0,
    insurancePaid: finished ? st.insurancePaid || 0 : 0,
    ...extra,
  };
}

function advance(p, st) {
  while (st.activeHand < st.hands.length && st.hands[st.activeHand].done) st.activeHand++;
  if (st.activeHand >= st.hands.length) return finish(p, st);
  return view(st);
}

function finish(p, st) {
  const playerBJ = st.hands.length === 1 && !st.split && isBlackjack(st.hands[0].cards);
  const dealerBJ = isBlackjack(st.dealer);
  const anyAlive = st.hands.some((h) => handValue(h.cards).total <= 21);

  // Dealer zieht bis 17 (steht auch auf Soft 17) – nur nötig, wenn noch eine Hand im Spiel ist
  if (anyAlive && !playerBJ && !dealerBJ) {
    while (handValue(st.dealer).total < 17) st.dealer.push(draw(st));
  }
  const d = handValue(st.dealer).total;

  let totalBet = 0, totalPayout = 0;
  for (const h of st.hands) {
    const v = handValue(h.cards).total;
    let pay = 0, result;
    if (playerBJ && dealerBJ) { pay = h.bet; result = 'push'; }
    else if (playerBJ) { pay = Math.floor(h.bet * 2.5); result = 'blackjack'; }
    else if (dealerBJ) { pay = 0; result = 'lose'; }
    else if (v > 21) { pay = 0; result = 'bust'; }
    else if (d > 21 || v > d) { pay = h.bet * 2; result = 'win'; }
    else if (v === d) { pay = h.bet; result = 'push'; }
    else { pay = 0; result = 'lose'; }
    h.result = result;
    h.payout = pay;
    totalBet += h.bet;
    totalPayout += pay;
  }
  // Versicherung abrechnen (zählt als eigener Einsatz)
  st.insurancePaid = 0;
  if (st.insuranceBet) {
    totalBet += st.insuranceBet;
    if (dealerBJ) { st.insurancePaid = st.insuranceBet * 3; totalPayout += st.insurancePaid; }
  }
  p.balance += totalPayout;
  const names = { win: 'Gewonnen', blackjack: 'Blackjack!', push: 'Unentschieden', lose: 'Verloren', bust: 'Überkauft' };
  const detail = st.hands.map((h) => `${handValue(h.cards).total} vs ${dealerBJ ? 'BJ' : d}: ${names[h.result]}`).join(' | ')
    + (st.insuranceBet ? ` | Versicherung ${dealerBJ ? 'gewonnen' : 'verloren'}` : '');
  profiles.record(p, 'blackjack', totalBet, totalPayout, detail);
  delete p.active.blackjack;
  return view(st, true, { payout: totalPayout, totalBet, dealerBlackjack: dealerBJ });
}

function state(p) {
  const st = p.active.blackjack;
  return st ? view(st) : { none: true };
}

function deal(p, body) {
  if (p.active.blackjack) throw new GameError('Es läuft schon eine Runde.');
  const bet = parseBet(body.bet, p);
  p.balance -= bet;
  const st = { shoe: makeDeck(DECKS), dealer: [], hands: [], activeHand: 0, split: false };
  const pc = [draw(st)];
  st.dealer.push(draw(st));
  pc.push(draw(st));
  st.dealer.push(draw(st));
  st.hands.push({ cards: pc, bet, done: false, doubled: false, splitAces: false });
  p.active.blackjack = st;
  // Dealer zeigt ein Ass → erst Versicherung anbieten (bei eigenem Blackjack nicht nötig)
  if (st.dealer[0].r === 14 && !isBlackjack(pc)) { st.insurance = 'offered'; return view(st); }
  if (isBlackjack(pc) || isBlackjack(st.dealer)) return finish(p, st);
  return view(st);
}

function insurance(p, body) {
  const st = current(p);
  if (st.insurance !== 'offered') throw new GameError('Versicherung ist gerade nicht möglich.');
  if (body.take) {
    const cost = Math.floor(st.hands[0].bet / 2);
    if (cost < 1) throw new GameError('Der Einsatz ist zu klein für eine Versicherung.');
    if (p.balance < cost) throw new GameError('Nicht genug Chips für die Versicherung.');
    p.balance -= cost;
    st.insuranceBet = cost;
  }
  st.insurance = 'done';
  if (isBlackjack(st.dealer)) return finish(p, st);
  return view(st, false, { insuranceLost: st.insuranceBet || 0 });
}

function noInsuranceOpen(st) {
  if (st.insurance === 'offered') throw new GameError('Erst entscheiden: Versicherung ja oder nein?');
}

function hit(p) {
  const st = current(p);
  noInsuranceOpen(st);
  const h = st.hands[st.activeHand];
  h.cards.push(draw(st));
  if (handValue(h.cards).total >= 21) h.done = true;
  return advance(p, st);
}

function stand(p) {
  const st = current(p);
  noInsuranceOpen(st);
  st.hands[st.activeHand].done = true;
  return advance(p, st);
}

function double(p) {
  const st = current(p);
  noInsuranceOpen(st);
  const v = view(st);
  if (!v.canDouble) throw new GameError('Verdoppeln ist hier nicht erlaubt.');
  const h = st.hands[st.activeHand];
  if (p.balance < h.bet) throw new GameError('Nicht genug Chips zum Verdoppeln.');
  p.balance -= h.bet;
  h.bet *= 2;
  h.doubled = true;
  h.cards.push(draw(st));
  h.done = true;
  return advance(p, st);
}

function split(p) {
  const st = current(p);
  noInsuranceOpen(st);
  const v = view(st);
  if (!v.canSplit) throw new GameError('Teilen ist hier nicht erlaubt.');
  const h = st.hands[st.activeHand];
  if (p.balance < h.bet) throw new GameError('Nicht genug Chips zum Teilen.');
  p.balance -= h.bet;
  st.split = true;
  const aces = h.cards[0].r === 14;
  const second = { cards: [h.cards.pop()], bet: h.bet, done: false, doubled: false, splitAces: aces };
  h.splitAces = aces;
  h.cards.push(draw(st));
  second.cards.push(draw(st));
  st.hands.splice(st.activeHand + 1, 0, second);
  for (const x of [h, second]) {
    if (aces || handValue(x.cards).total === 21) x.done = true;
  }
  return advance(p, st);
}

module.exports = { state, deal, hit, stand, double, split, insurance };
module.exports._internal = { handValue, isBlackjack };
