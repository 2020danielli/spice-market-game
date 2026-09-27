import { other } from './cards';
import { GOODS, type BonusSize, type BonusToken, type Card, type Good, type PlayerId, type RoundState } from './types';

/** Everything one player may legally know. Bots only ever see this. */
export interface PlayerView {
  me: PlayerId;
  current: PlayerId;
  turn: number;
  hand: Good[];
  herd: number;
  goodsTokens: number[];
  soldGoods: Good[];
  bonusTokens: BonusToken[];
  /** What the opponent knows about my hand. */
  myKnown: Good[];
  opp: { handSize: number; herd: number; known: Good[]; goodsTokens: number[]; soldGoods: Good[]; bonusSizes: BonusSize[] };
  market: Card[];
  deckSize: number;
  tokens: Record<Good, number[]>;
  bonusCounts: Record<BonusSize, number>;
  discard: Record<Good, number>;
}

export function playerView(r: RoundState, me: PlayerId): PlayerView {
  const p = r.players[me];
  const o = r.players[other(me)];
  const tokens = {} as Record<Good, number[]>;
  for (const g of GOODS) tokens[g] = r.tokens[g].slice();
  return {
    me,
    current: r.current,
    turn: r.turn,
    hand: p.hand.slice(),
    herd: p.herd,
    goodsTokens: p.goodsTokens.slice(),
    soldGoods: p.soldGoods.slice(),
    bonusTokens: p.bonusTokens.map((t) => ({ ...t })),
    myKnown: p.known.slice(),
    opp: {
      handSize: o.hand.length,
      herd: o.herd,
      known: o.known.slice(),
      goodsTokens: o.goodsTokens.slice(),
      soldGoods: o.soldGoods.slice(),
      bonusSizes: o.bonusTokens.map((t) => t.size),
    },
    market: r.market.slice(),
    deckSize: r.deck.length,
    tokens,
    bonusCounts: { 3: r.bonus[3].length, 4: r.bonus[4].length, 5: r.bonus[5].length },
    discard: { ...r.discard },
  };
}
