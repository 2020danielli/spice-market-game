import { emptyGoodsCount } from './cards';
import { Rng } from './rng';
import {
  BONUS_SIZES, BONUS_TOKENS, DECK_COMPOSITION, GOODS, GOODS_TOKENS,
  type BonusSize, type Card, type Good, type PlayerId, type PlayerState, type RoundState,
} from './types';

function emptyPlayer(): PlayerState {
  return { hand: [], herd: 0, goodsTokens: [], soldGoods: [], bonusTokens: [], known: [] };
}

export function newRound(rngState: number, starter: PlayerId): { round: RoundState; rng: number } {
  const rng = new Rng(rngState);
  const pool: Card[] = [];
  for (const card of Object.keys(DECK_COMPOSITION) as Card[]) {
    const n = card === 'camel' ? DECK_COMPOSITION.camel - 3 : DECK_COMPOSITION[card];
    for (let i = 0; i < n; i++) pool.push(card);
  }
  const deck = rng.shuffle(pool);
  const market: Card[] = ['camel', 'camel', 'camel', deck.pop()!, deck.pop()!];
  const players: [PlayerState, PlayerState] = [emptyPlayer(), emptyPlayer()];
  for (const p of players) {
    for (let i = 0; i < 5; i++) {
      const c = deck.pop()!;
      if (c === 'camel') p.herd++;
      else p.hand.push(c);
    }
  }
  const tokens = {} as Record<Good, number[]>;
  for (const g of GOODS) tokens[g] = GOODS_TOKENS[g].slice();
  const bonus = {} as Record<BonusSize, number[]>;
  for (const s of BONUS_SIZES) bonus[s] = rng.shuffle(BONUS_TOKENS[s]);
  return {
    round: { deck, market, players, tokens, bonus, discard: emptyGoodsCount(), current: starter, ended: false, turn: 0 },
    rng: rng.state,
  };
}
