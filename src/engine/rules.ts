import { cardName, countGoods, other, removeGoods, removeUpTo } from './cards';
import {
  GOODS, HAND_LIMIT, PRECIOUS,
  type BonusSize, type Card, type Good, type Move, type PlayerState, type RoundState,
} from './types';

export function checkMove(r: RoundState, m: Move): string | null {
  if (r.ended) return 'The round is over.';
  const p = r.players[r.current];
  switch (m.kind) {
    case 'take': {
      const c = r.market[m.index];
      if (c === undefined) return 'There is no card there.';
      if (c === 'camel') return 'Camels must be taken all together.';
      if (p.hand.length >= HAND_LIMIT) return `Your hand is full (${HAND_LIMIT} cards).`;
      return null;
    }
    case 'camels':
      return r.market.includes('camel') ? null : 'There are no camels in the market.';
    case 'exchange': {
      const { take, giveGoods, giveCamels } = m;
      if (take.length < 2) return 'An exchange must take at least 2 cards from the market.';
      if (new Set(take).size !== take.length) return 'The same market card was chosen twice.';
      const taken: Card[] = [];
      for (const i of take) {
        const c = r.market[i];
        if (c === undefined) return 'There is no card there.';
        if (c === 'camel') return 'You cannot take camels in an exchange.';
        taken.push(c);
      }
      if (!Number.isInteger(giveCamels) || giveCamels < 0) return 'Invalid number of camels.';
      if (giveGoods.length + giveCamels !== take.length) return `You must give back exactly ${take.length} cards.`;
      if (giveCamels > p.herd) return 'You do not have that many camels.';
      if (!removeGoods(p.hand, giveGoods)) return 'You do not have those cards.';
      const takenSet = new Set(taken);
      if (giveGoods.some((g) => takenSet.has(g))) return 'You cannot take and give back the same type of good.';
      if (p.hand.length - giveGoods.length + take.length > HAND_LIMIT) return `That would leave you with more than ${HAND_LIMIT} cards.`;
      return null;
    }
    case 'sell': {
      const have = p.hand.filter((g) => g === m.good).length;
      if (!Number.isInteger(m.count) || m.count < 1) return 'Select cards to sell.';
      if (m.count > have) return `You only have ${have} ${cardName(m.good, have)}.`;
      if (PRECIOUS.has(m.good) && m.count < 2) return `${cardName(m.good)} must be sold at least 2 at a time.`;
      return null;
    }
  }
}

function clonePlayer(p: PlayerState): PlayerState {
  return {
    hand: p.hand.slice(),
    herd: p.herd,
    goodsTokens: p.goodsTokens.slice(),
    soldGoods: p.soldGoods.slice(),
    bonusTokens: p.bonusTokens.map((t) => ({ ...t })),
    known: p.known.slice(),
  };
}

export function cloneRound(r: RoundState): RoundState {
  const tokens = {} as Record<Good, number[]>;
  for (const g of GOODS) tokens[g] = r.tokens[g].slice();
  return {
    deck: r.deck.slice(),
    market: r.market.slice(),
    players: [clonePlayer(r.players[0]), clonePlayer(r.players[1])],
    tokens,
    bonus: { 3: r.bonus[3].slice(), 4: r.bonus[4].slice(), 5: r.bonus[5].slice() },
    discard: { ...r.discard },
    current: r.current,
    ended: r.ended,
    turn: r.turn,
  };
}

/** Fills the given market slots from the deck; if the deck runs dry the unfilled slots vanish and the round ends. */
function replaceSlots(r: RoundState, slots: number[]): void {
  const unfilled = new Set<number>();
  for (const i of slots) {
    const c = r.deck.pop();
    if (c === undefined) unfilled.add(i);
    else r.market[i] = c;
  }
  if (unfilled.size > 0) {
    r.market = r.market.filter((_, i) => !unfilled.has(i));
    r.ended = true;
  }
}

export function applyMoveMut(r: RoundState, m: Move): void {
  const err = checkMove(r, m);
  if (err) throw new Error(`Illegal move ${JSON.stringify(m)}: ${err}`);
  const p = r.players[r.current];
  switch (m.kind) {
    case 'take': {
      const g = r.market[m.index] as Good;
      p.hand.push(g);
      p.known.push(g);
      replaceSlots(r, [m.index]);
      break;
    }
    case 'camels': {
      const slots: number[] = [];
      r.market.forEach((c, i) => {
        if (c === 'camel') slots.push(i);
      });
      p.herd += slots.length;
      replaceSlots(r, slots);
      break;
    }
    case 'exchange': {
      const taken = m.take.map((i) => r.market[i] as Good);
      p.hand = removeGoods(p.hand, m.giveGoods)!;
      for (const g of m.giveGoods) {
        const k = p.known.indexOf(g);
        if (k >= 0) p.known.splice(k, 1);
      }
      p.herd -= m.giveCamels;
      const returned: Card[] = [...m.giveGoods, ...Array<Card>(m.giveCamels).fill('camel')];
      m.take.forEach((slot, j) => {
        r.market[slot] = returned[j];
      });
      p.hand.push(...taken);
      p.known.push(...taken);
      break;
    }
    case 'sell': {
      p.hand = removeUpTo(p.hand, m.good, m.count);
      p.known = removeUpTo(p.known, m.good, m.count);
      const got = r.tokens[m.good].splice(0, m.count);
      p.goodsTokens.push(...got);
      for (let i = 0; i < got.length; i++) p.soldGoods.push(m.good);
      if (m.count >= 3) {
        const size = Math.min(m.count, 5) as BonusSize;
        const value = r.bonus[size].shift();
        if (value !== undefined) p.bonusTokens.push({ size, value });
      }
      r.discard[m.good] += m.count;
      break;
    }
  }
  r.turn++;
  r.current = other(r.current);
  if (GOODS.filter((g) => r.tokens[g].length === 0).length >= 3) r.ended = true;
}

export function applyMove(r: RoundState, m: Move): RoundState {
  const next = cloneRound(r);
  applyMoveMut(next, m);
  return next;
}

/** All exchanges, deduplicated by the multiset of taken types. */
export function exchangeMoves(hand: readonly Good[], herd: number, market: readonly Card[]): Move[] {
  const goodSlots: number[] = [];
  market.forEach((c, i) => {
    if (c !== 'camel') goodSlots.push(i);
  });
  const handCounts = countGoods(hand);
  const out: Move[] = [];
  const seen = new Set<string>();
  for (let mask = 0; mask < 1 << goodSlots.length; mask++) {
    const take = goodSlots.filter((_, j) => mask & (1 << j));
    const k = take.length;
    if (k < 2) continue;
    const takenTypes = take.map((i) => market[i] as Good);
    const key = takenTypes.slice().sort().join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    const takenSet = new Set(takenTypes);
    const giveable = GOODS.filter((g) => !takenSet.has(g) && handCounts[g] > 0);
    const minGoods = Math.max(0, k - herd, hand.length + k - HAND_LIMIT);
    const acc: Good[] = [];
    const rec = (idx: number, left: number) => {
      if (idx === giveable.length) {
        if (acc.length >= minGoods) out.push({ kind: 'exchange', take, giveGoods: acc.slice(), giveCamels: k - acc.length });
        return;
      }
      const g = giveable[idx];
      for (let c = 0; c <= Math.min(handCounts[g], left); c++) {
        for (let t = 0; t < c; t++) acc.push(g);
        rec(idx + 1, left - c);
        acc.length -= c;
      }
    };
    rec(0, k);
  }
  return out;
}

export function enumerateMoves(hand: readonly Good[], herd: number, market: readonly Card[], includeExchanges = true): Move[] {
  const moves: Move[] = [];
  if (hand.length < HAND_LIMIT) {
    const seen = new Set<Card>();
    market.forEach((c, i) => {
      if (c !== 'camel' && !seen.has(c)) {
        seen.add(c);
        moves.push({ kind: 'take', index: i });
      }
    });
  }
  if (market.includes('camel')) moves.push({ kind: 'camels' });
  const counts = countGoods(hand);
  for (const g of GOODS) {
    for (let n = PRECIOUS.has(g) ? 2 : 1; n <= counts[g]; n++) moves.push({ kind: 'sell', good: g, count: n });
  }
  if (includeExchanges) moves.push(...exchangeMoves(hand, herd, market));
  return moves;
}

export function legalMoves(r: RoundState): Move[] {
  if (r.ended) return [];
  const p = r.players[r.current];
  return enumerateMoves(p.hand, p.herd, r.market);
}
