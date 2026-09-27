import { describe, expect, it } from 'vitest';
import { applyMove, cardCounts, DECK_COMPOSITION, legalMoves, newRound, playerView, Rng, type RoundState } from '../engine';
import { determinize } from './determinize';

function midGame(seed: number, plies: number): RoundState {
  const rng = new Rng(seed);
  let r = newRound(seed, 0).round;
  for (let i = 0; i < plies && !r.ended; i++) {
    const moves = legalMoves(r);
    r = applyMove(r, moves[rng.int(moves.length)]);
  }
  return r;
}

describe('determinize', () => {
  it('produces a consistent full state that matches all public info', () => {
    for (let s = 1; s <= 40; s++) {
      const r = midGame(s, 12);
      if (r.ended) continue;
      const v = playerView(r, r.current);
      const d = determinize(v, new Rng(s));
      expect(cardCounts(d)).toEqual(DECK_COMPOSITION);
      expect(d.market).toEqual(r.market);
      expect(d.deck).toHaveLength(r.deck.length);
      expect(d.players[v.me].hand).toEqual(r.players[v.me].hand);
      const oppIdx = v.me === 0 ? 1 : 0;
      expect(d.players[oppIdx].hand).toHaveLength(r.players[oppIdx].hand.length);
      for (const g of r.players[oppIdx].known) expect(d.players[oppIdx].hand).toContain(g);
      for (const size of [3, 4, 5] as const) expect(d.bonus[size]).toHaveLength(r.bonus[size].length);
      expect(d.players[oppIdx].bonusTokens.map((t) => t.size)).toEqual(r.players[oppIdx].bonusTokens.map((t) => t.size));
      expect(d.tokens).toEqual(r.tokens);
      expect(d.current).toBe(r.current);
    }
  });

  it('samples different hidden hands', () => {
    const r = midGame(3, 6);
    const v = playerView(r, r.current);
    const hands = new Set<string>();
    for (let i = 0; i < 20; i++) hands.add(determinize(v, new Rng(i)).deck.join(','));
    expect(hands.size).toBeGreaterThan(1);
  });
});
