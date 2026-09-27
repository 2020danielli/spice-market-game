import {
  BONUS_SIZES, BONUS_TOKENS, DECK_COMPOSITION, GOODS,
  type BonusSize, type BonusToken, type Card, type Good, type PlayerState, type PlayerView, type RoundState, type Rng,
} from '../engine';

/** Samples a full RoundState consistent with everything the viewer knows (card counting included). */
export function determinize(v: PlayerView, rng: Rng): RoundState {
  const remaining: Record<Card, number> = { ...DECK_COMPOSITION };
  for (const c of v.market) remaining[c]--;
  for (const g of v.hand) remaining[g]--;
  for (const g of v.opp.known) remaining[g]--;
  remaining.camel -= v.herd + v.opp.herd;
  for (const g of GOODS) remaining[g] -= v.discard[g];
  const pool: Card[] = [];
  for (const c of Object.keys(remaining) as Card[]) for (let i = 0; i < remaining[c]; i++) pool.push(c);

  const oppHand: Good[] = v.opp.known.slice();
  const deck: Card[] = [];
  for (const c of rng.shuffle(pool)) {
    if (c !== 'camel' && oppHand.length < v.opp.handSize) oppHand.push(c);
    else deck.push(c);
  }

  const bonus = {} as Record<BonusSize, number[]>;
  const oppBonus: BonusToken[] = [];
  for (const size of BONUS_SIZES) {
    const vals = BONUS_TOKENS[size].slice();
    for (const t of v.bonusTokens) if (t.size === size) vals.splice(vals.indexOf(t.value), 1);
    const shuffled = rng.shuffle(vals);
    for (const s of v.opp.bonusSizes) if (s === size) oppBonus.push({ size, value: shuffled.pop()! });
    bonus[size] = shuffled;
  }
  // Keep the opponent's bonus tokens in the order they were earned.
  const oppBonusOrdered: BonusToken[] = [];
  const bySize = new Map<BonusSize, BonusToken[]>();
  for (const t of oppBonus) bySize.set(t.size, [...(bySize.get(t.size) ?? []), t]);
  for (const s of v.opp.bonusSizes) oppBonusOrdered.push(bySize.get(s)!.shift()!);

  const mine: PlayerState = {
    hand: v.hand.slice(), herd: v.herd, goodsTokens: v.goodsTokens.slice(), soldGoods: v.soldGoods.slice(),
    bonusTokens: v.bonusTokens.map((t) => ({ ...t })), known: v.myKnown.slice(),
  };
  const theirs: PlayerState = {
    hand: oppHand, herd: v.opp.herd, goodsTokens: v.opp.goodsTokens.slice(), soldGoods: v.opp.soldGoods.slice(),
    bonusTokens: oppBonusOrdered, known: v.opp.known.slice(),
  };
  const tokens = {} as Record<Good, number[]>;
  for (const g of GOODS) tokens[g] = v.tokens[g].slice();
  return {
    deck,
    market: v.market.slice(),
    players: v.me === 0 ? [mine, theirs] : [theirs, mine],
    tokens,
    bonus,
    discard: { ...v.discard },
    current: v.current,
    ended: false,
    turn: v.turn,
  };
}
