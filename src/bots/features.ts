import {
  BONUS_SIZES, BONUS_TOKENS, CAMEL_BONUS, countGoods, DECK_COMPOSITION, GOODS, other, sum,
  type Card, type PlayerId, type RoundState,
} from '../engine';

/**
 * Numeric description of a (fully determinized) position from player p's point of view, for the learned value network.
 * Everything is scaled to roughly [0, 1] or [-1, 1].
 */
export const FEATURE_COUNT = 77;

export function features(r: RoundState, p: PlayerId, out: Float32Array = new Float32Array(FEATURE_COUNT)): Float32Array {
  const o = other(p);
  const me = r.players[p];
  const op = r.players[o];
  let i = 0;
  const push = (x: number) => {
    out[i++] = x;
  };
  const mine = countGoods(me.hand);
  const theirs = countGoods(op.hand);
  for (const g of GOODS) push(mine[g] / 7);
  for (const g of GOODS) push(theirs[g] / 7);
  push(me.hand.length / 7);
  push(op.hand.length / 7);
  push(me.herd / 11);
  push(op.herd / 11);
  push(Math.sign(me.herd - op.herd));
  // Market composition
  const market: Record<Card, number> = { diamond: 0, gold: 0, silver: 0, cloth: 0, spice: 0, leather: 0, camel: 0 };
  for (const c of r.market) market[c]++;
  for (const c of [...GOODS, 'camel'] as Card[]) push(market[c] / 5);
  // Token stacks: how many left, value of the top 1, top 3, and all remaining
  let empty = 0;
  for (const g of GOODS) {
    const t = r.tokens[g];
    if (t.length === 0) empty++;
    push(t.length / 9);
    push((t[0] ?? 0) / 7);
    push(sum(t.slice(0, 3)) / 21);
    push(sum(t) / 29);
  }
  push(empty / 3);
  for (const s of BONUS_SIZES) push(r.bonus[s].length / BONUS_TOKENS[s].length);
  // Score so far (banked tokens), and the camel token as it stands
  const banked = (x: typeof me) => sum(x.goodsTokens) + sum(x.bonusTokens.map((t) => t.value));
  const bm = banked(me), bo = banked(op);
  const camel = me.herd > op.herd ? CAMEL_BONUS : me.herd < op.herd ? -CAMEL_BONUS : 0;
  push(bm / 80);
  push(bo / 80);
  push((bm - bo + camel) / 40);
  push(me.goodsTokens.length / 20);
  push(op.goodsTokens.length / 20);
  push(me.bonusTokens.length / 6);
  push(op.bonusTokens.length / 6);
  // Tempo
  push(r.deck.length / 40);
  push(r.current === p ? 1 : 0);
  // Unseen supply (deck composition), and what is still available of each good anywhere outside discards
  const deck: Record<Card, number> = { diamond: 0, gold: 0, silver: 0, cloth: 0, spice: 0, leather: 0, camel: 0 };
  for (const c of r.deck) deck[c]++;
  for (const c of [...GOODS, 'camel'] as Card[]) push(deck[c] / DECK_COMPOSITION[c]);
  for (const g of GOODS) push(r.discard[g] / DECK_COMPOSITION[g]);
  // Immediate sale values for both players (largest sellable set's tokens)
  const saleNow = (counts: Record<string, number>) =>
    Math.max(0, ...GOODS.map((g) => (counts[g] >= (g === 'diamond' || g === 'gold' || g === 'silver' ? 2 : 1) ? sum(r.tokens[g].slice(0, counts[g])) : 0)));
  push(saleNow(mine) / 30);
  push(saleNow(theirs) / 30);
  push(r.ended ? 1 : 0);
  if (i !== FEATURE_COUNT) throw new Error(`feature count ${i} != ${FEATURE_COUNT}`);
  return out;
}
