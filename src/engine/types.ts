export type Good = 'diamond' | 'gold' | 'silver' | 'cloth' | 'spice' | 'leather';
export type Card = Good | 'camel';
export type BonusSize = 3 | 4 | 5;
export type PlayerId = 0 | 1;

export const GOODS: readonly Good[] = ['diamond', 'gold', 'silver', 'cloth', 'spice', 'leather'];
export const PRECIOUS: ReadonlySet<Good> = new Set<Good>(['diamond', 'gold', 'silver']);
export const BONUS_SIZES: readonly BonusSize[] = [3, 4, 5];

export const DECK_COMPOSITION: Readonly<Record<Card, number>> = {
  diamond: 6, gold: 6, silver: 6, cloth: 8, spice: 8, leather: 10, camel: 11,
};
export const GOODS_TOKENS: Readonly<Record<Good, readonly number[]>> = {
  diamond: [7, 7, 5, 5, 5],
  gold: [6, 6, 5, 5, 5],
  silver: [5, 5, 5, 5, 5],
  cloth: [5, 3, 3, 2, 2, 1, 1],
  spice: [5, 3, 3, 2, 2, 1, 1],
  leather: [4, 3, 2, 1, 1, 1, 1, 1, 1],
};
export const BONUS_TOKENS: Readonly<Record<BonusSize, readonly number[]>> = {
  3: [3, 3, 2, 2, 2, 1, 1],
  4: [6, 6, 5, 5, 4, 4],
  5: [10, 10, 9, 8, 8],
};
export const HAND_LIMIT = 7;
export const MARKET_SIZE = 5;
export const CAMEL_BONUS = 5;

export interface BonusToken { size: BonusSize; value: number }

export interface PlayerState {
  hand: Good[];
  herd: number;
  goodsTokens: number[];
  /** The good each goods token was earned for (parallel to goodsTokens). */
  soldGoods: Good[];
  bonusTokens: BonusToken[];
  /** Cards the opponent has watched enter this hand and not yet leave (public knowledge). */
  known: Good[];
}

export interface RoundState {
  /** Draw pile; the top card is the last element. */
  deck: Card[];
  market: Card[];
  players: [PlayerState, PlayerState];
  /** Goods token stacks; index 0 is the top (highest) token. */
  tokens: Record<Good, number[]>;
  /** Bonus token stacks, shuffled; values are hidden from players. */
  bonus: Record<BonusSize, number[]>;
  /** Goods cards sold so far (public). */
  discard: Record<Good, number>;
  current: PlayerId;
  ended: boolean;
  turn: number;
}

export type Move =
  | { kind: 'take'; index: number }
  | { kind: 'camels' }
  | { kind: 'exchange'; take: number[]; giveGoods: Good[]; giveCamels: number }
  | { kind: 'sell'; good: Good; count: number };

export interface MatchConfig { camelTiebreak: boolean }

export interface RoundResult {
  scores: [number, number];
  camelWinner: PlayerId | null;
  bonusCounts: [number, number];
  goodsCounts: [number, number];
  sealWinner: PlayerId | null;
  decidedBy: 'score' | 'camelTiebreak' | 'bonusCount' | 'goodsCount' | 'tie';
}

export interface MatchState {
  config: MatchConfig;
  rng: number;
  seals: [number, number];
  roundNumber: number;
  starter: PlayerId;
  round: RoundState;
  history: RoundResult[];
  winner: PlayerId | null;
}
