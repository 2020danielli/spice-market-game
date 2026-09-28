import { other } from './cards';
import { GOODS, type BonusSize, type BonusToken, type Card, type Good, type Move, type PlayerId, type RoundState } from './types';

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
  /** The opponent's moves this round with the public table before each one (for reading their behaviour). */
  oppMoves?: PublicMove[];
}

/** One move and the public position it was made in. */
export interface PublicMove {
  move: Move;
  market: Card[];
  tokens: Record<Good, number[]>;
  bonusCounts: Record<BonusSize, number>;
  /** The mover's herd before the move. */
  herd: number;
  otherHerd: number;
}

export interface HistoryEntry {
  before: RoundState;
  move: Move;
}

/** A player's moves this round, with only what everyone could see at the time. */
export function publicMovesOf(history: readonly HistoryEntry[], player: PlayerId): PublicMove[] {
  return history
    .filter((h) => h.before.current === player)
    .map(({ before, move }) => {
      const tokens = {} as Record<Good, number[]>;
      for (const g of GOODS) tokens[g] = before.tokens[g].slice();
      return {
        move,
        market: before.market.slice(),
        tokens,
        bonusCounts: { 3: before.bonus[3].length, 4: before.bonus[4].length, 5: before.bonus[5].length },
        herd: before.players[player].herd,
        otherHerd: before.players[other(player)].herd,
      };
    });
}

export function playerView(r: RoundState, me: PlayerId, history?: readonly HistoryEntry[]): PlayerView {
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
    oppMoves: history ? publicMovesOf(history, other(me)) : undefined,
  };
}
