import { describe, expect, it } from 'vitest';
import { cardCounts, sum } from './cards';
import { applyMove, checkMove, legalMoves } from './rules';
import { Rng } from './rng';
import { newRound } from './setup';
import { BONUS_TOKENS, DECK_COMPOSITION, GOODS, GOODS_TOKENS, HAND_LIMIT, type RoundState } from './types';

const TOTAL_GOODS_TOKENS = sum(GOODS.map((g) => GOODS_TOKENS[g].length));
const TOTAL_BONUS = BONUS_TOKENS[3].length + BONUS_TOKENS[4].length + BONUS_TOKENS[5].length;

function invariants(r: RoundState) {
  expect(cardCounts(r)).toEqual(DECK_COMPOSITION);
  const stackTokens = sum(GOODS.map((g) => r.tokens[g].length));
  expect(stackTokens + r.players[0].goodsTokens.length + r.players[1].goodsTokens.length).toBe(TOTAL_GOODS_TOKENS);
  const bonusLeft = r.bonus[3].length + r.bonus[4].length + r.bonus[5].length;
  expect(bonusLeft + r.players[0].bonusTokens.length + r.players[1].bonusTokens.length).toBe(TOTAL_BONUS);
  for (const p of r.players) {
    expect(p.hand.length).toBeLessThanOrEqual(HAND_LIMIT);
    expect(p.soldGoods).toHaveLength(p.goodsTokens.length);
    for (const g of p.known) expect(p.hand.filter((h) => h === g).length).toBeGreaterThanOrEqual(p.known.filter((k) => k === g).length);
  }
  if (!r.ended) expect(r.market).toHaveLength(5);
}

describe('random play fuzz', () => {
  it('conserves cards and tokens and always terminates', () => {
    const rng = new Rng(2024);
    for (let game = 0; game < 300; game++) {
      let r = newRound(game * 97 + 1, (game % 2) as 0 | 1).round;
      let steps = 0;
      while (!r.ended) {
        const moves = legalMoves(r);
        expect(moves.length).toBeGreaterThan(0);
        const m = moves[rng.int(moves.length)];
        expect(checkMove(r, m)).toBeNull();
        r = applyMove(r, m);
        invariants(r);
        expect(++steps).toBeLessThan(500);
      }
    }
  }, 60_000);
});
