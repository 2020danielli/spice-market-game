import {
  BONUS_SIZES, CAMEL_BONUS, countGoods, GOODS, HAND_LIMIT, other, PRECIOUS, sum,
  type BonusSize, type Card, type Good, type Move, type PlayerId, type RoundState,
} from '../engine';
import { features, FEATURE_COUNT } from './features';

/**
 * Richer position features (v2): the original 77 plus races for each good, round-end timing and threats, what the market
 * offers each player, what each side has seen of the other's hand, and hand-limit / exchange pressure.
 */
export const FEATURE2_COUNT = FEATURE_COUNT + 6 * 7 + 10 + 12 + 12 + 6;

const minCount = (g: Good) => (PRECIOUS.has(g) ? 2 : 1);

function saleValue(tokens: readonly number[], n: number, bonus: Record<BonusSize, number[]>): number {
  if (n <= 0) return 0;
  let v = sum(tokens.slice(0, n));
  if (n >= 3) v += bonus[Math.min(n, 5) as BonusSize].length ? [0, 0, 0, 2, 5, 9][Math.min(n, 5)] : 0;
  return v;
}

export function features2(r: RoundState, p: PlayerId, out: Float32Array = new Float32Array(FEATURE2_COUNT)): Float32Array {
  features(r, p, out);
  let i = FEATURE_COUNT;
  const push = (x: number) => {
    out[i++] = x;
  };
  const o = other(p);
  const me = r.players[p];
  const op = r.players[o];
  const mine = countGoods(me.hand);
  const theirs = countGoods(op.hand);
  const empty = GOODS.filter((g) => r.tokens[g].length === 0).length;

  // Races, per good: my/their sale value now, my value if they sell first, bonus eligibility, who leads the race.
  for (const g of GOODS) {
    const t = r.tokens[g];
    const mySale = mine[g] >= minCount(g) ? saleValue(t, mine[g], r.bonus) : 0;
    const theirSale = theirs[g] >= minCount(g) ? saleValue(t, theirs[g], r.bonus) : 0;
    const afterThem = theirs[g] >= minCount(g) ? t.slice(theirs[g]) : t;
    const myIfSecond = mine[g] >= minCount(g) ? saleValue(afterThem, mine[g], r.bonus) : 0;
    push(mySale / 30);
    push(theirSale / 30);
    push((mySale - myIfSecond) / 20); // what I lose by letting them sell first
    push(mine[g] >= 3 && r.bonus[Math.min(mine[g], 5) as BonusSize].length > 0 ? 1 : 0);
    push(theirs[g] >= 3 && r.bonus[Math.min(theirs[g], 5) as BonusSize].length > 0 ? 1 : 0);
    push(Math.sign(mine[g] - theirs[g]));
    push(t.length > 0 && t.length <= 2 ? 1 : 0); // pile about to run out
  }

  // Round-end timing and threats.
  const canEnd = (counts: Record<Good, number>) =>
    r.deck.length === 0 || (empty >= 2 && GOODS.some((g) => r.tokens[g].length > 0 && counts[g] >= Math.max(r.tokens[g].length, minCount(g))));
  const lowPiles = GOODS.filter((g) => r.tokens[g].length > 0 && r.tokens[g].length <= 2).length;
  push(canEnd(mine) ? 1 : 0);
  push(canEnd(theirs) ? 1 : 0);
  push(lowPiles / 6);
  push(empty === 2 ? 1 : 0);
  push(r.deck.length <= 2 ? 1 : 0);
  push(r.deck.length <= 5 ? 1 : 0);
  push(r.deck.length <= 10 ? 1 : 0);
  push(Math.min(r.deck.length / 2, 20) / 20); // rough turns left from the deck
  const bankedLead = sum(me.goodsTokens) + sum(me.bonusTokens.map((b) => b.value)) - sum(op.goodsTokens) - sum(op.bonusTokens.map((b) => b.value));
  const camel = me.herd > op.herd ? CAMEL_BONUS : me.herd < op.herd ? -CAMEL_BONUS : 0;
  push(canEnd(mine) && bankedLead + camel > 0 ? 1 : 0); // I can end it now while ahead
  push(canEnd(theirs) && bankedLead + camel < 0 ? 1 : 0); // they can end it next turn while ahead

  // What the market offers each player: best take (top token × set synergy), matching cards, camels, exposure.
  const takeValue = (counts: Record<Good, number>) => {
    let best = 0;
    for (const c of r.market) {
      if (c === 'camel') continue;
      const n = counts[c] + 1;
      best = Math.max(best, saleValue(r.tokens[c], n, r.bonus) - saleValue(r.tokens[c], n - 1, r.bonus));
    }
    return best;
  };
  const matching = (counts: Record<Good, number>) => r.market.filter((c) => c !== 'camel' && counts[c as Good] > 0).length;
  const camelsInMarket = r.market.filter((c) => c === 'camel').length;
  const topInMarket = Math.max(0, ...r.market.filter((c): c is Good => c !== 'camel').map((g) => r.tokens[g][0] ?? 0));
  push(takeValue(mine) / 15);
  push(takeValue(theirs) / 15);
  push(matching(mine) / 5);
  push(matching(theirs) / 5);
  push(camelsInMarket / 5);
  push(topInMarket / 7);
  push(me.hand.length < HAND_LIMIT && r.market.some((c) => c !== 'camel') ? 1 : 0);
  push(op.hand.length < HAND_LIMIT && r.market.some((c) => c !== 'camel') ? 1 : 0);
  push(camelsInMarket >= 3 ? 1 : 0);
  push(r.market.filter((c) => c !== 'camel' && PRECIOUS.has(c as Good)).length / 5);
  push(me.herd >= 2 ? 1 : 0); // camels available to fund an exchange
  push(op.herd >= 2 ? 1 : 0);

  // Knowledge: which of each hand's cards the other side has seen (public "known" cards), per good.
  const myKnown = countGoods(me.known);
  const theirKnown = countGoods(op.known);
  for (const g of GOODS) push(myKnown[g] / 5);
  for (const g of GOODS) push(theirKnown[g] / 5);

  // Hand-limit pressure.
  push(me.hand.length >= HAND_LIMIT ? 1 : 0);
  push(op.hand.length >= HAND_LIMIT ? 1 : 0);
  push((HAND_LIMIT - me.hand.length) / 7);
  push((HAND_LIMIT - op.hand.length) / 7);
  push(me.hand.length > 0 && op.hand.length > 0 ? (me.hand.length - op.hand.length) / 7 : 0);
  push(BONUS_SIZES.reduce((s, sz) => s + r.bonus[sz].length, 0) / 18);

  if (i !== FEATURE2_COUNT) throw new Error(`feature2 count ${i} != ${FEATURE2_COUNT}`);
  return out;
}

/** Description of a move (for the policy network): kind, goods involved, sizes, and immediate effects. */
export const MOVE_FEATURE_COUNT = 4 + 6 + 1 + 6 + 6 + 1 + 1 + 3;

export function moveFeatures(r: RoundState, m: Move, out: Float32Array = new Float32Array(MOVE_FEATURE_COUNT)): Float32Array {
  out.fill(0);
  const kinds = ['take', 'camels', 'exchange', 'sell'] as const;
  out[kinds.indexOf(m.kind)] = 1;
  const gi = (g: Card) => GOODS.indexOf(g as Good);
  let gained = 0;
  if (m.kind === 'take') {
    out[4 + gi(r.market[m.index])] = 1;
    out[11 + gi(r.market[m.index])] = 1;
  } else if (m.kind === 'sell') {
    out[4 + gi(m.good)] = 1;
    out[10] = m.count / 7;
    gained = saleValue(r.tokens[m.good], m.count, r.bonus);
  } else if (m.kind === 'exchange') {
    for (const idx of m.take) out[11 + gi(r.market[idx])] += 0.5;
    for (const g of m.giveGoods) out[17 + gi(g)] += 0.5;
    out[23] = m.giveCamels / 5;
  } else {
    out[24] = r.market.filter((c) => c === 'camel').length / 5;
  }
  out[25] = gained / 30;
  const p = r.players[r.current];
  const newHand = p.hand.length + (m.kind === 'take' ? 1 : m.kind === 'exchange' ? m.take.length - m.giveGoods.length : m.kind === 'sell' ? -m.count : 0);
  out[26] = newHand / 7;
  out[27] = newHand >= HAND_LIMIT ? 1 : 0;
  return out;
}
