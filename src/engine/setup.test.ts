import { describe, expect, it } from 'vitest';
import { cardCounts } from './cards';
import { newRound } from './setup';
import { DECK_COMPOSITION, HAND_LIMIT } from './types';

describe('newRound', () => {
  it('deals a legal opening', () => {
    const { round } = newRound(42, 1);
    expect(round.market).toHaveLength(5);
    expect(round.market.slice(0, 3)).toEqual(['camel', 'camel', 'camel']);
    for (const p of round.players) {
      expect(p.hand.length + p.herd).toBe(5);
      expect(p.hand).not.toContain('camel');
      expect(p.hand.length).toBeLessThanOrEqual(HAND_LIMIT);
    }
    expect(round.deck).toHaveLength(55 - 5 - 10);
    expect(cardCounts(round)).toEqual(DECK_COMPOSITION);
    expect(round.tokens.diamond).toEqual([7, 7, 5, 5, 5]);
    expect(round.tokens.leather).toEqual([4, 3, 2, 1, 1, 1, 1, 1, 1]);
    expect(round.bonus[3].slice().sort()).toEqual([1, 1, 2, 2, 2, 3, 3]);
    expect(round.bonus[5].slice().sort((a, b) => a - b)).toEqual([8, 8, 9, 10, 10]);
    expect(round.current).toBe(1);
    expect(round.ended).toBe(false);
  });

  it('is deterministic per seed and varies across seeds', () => {
    expect(newRound(7, 0)).toEqual(newRound(7, 0));
    expect(newRound(7, 0).round.deck).not.toEqual(newRound(8, 0).round.deck);
  });
});
