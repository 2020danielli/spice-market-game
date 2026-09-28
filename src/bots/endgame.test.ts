import { describe, expect, it } from 'vitest';
import { applyMove, checkMove, legalMoves, newRound, playerView, Rng, type Good, type RoundState } from '../engine';
import { isEndgame, solveEndgame } from './endgame';

function late(seed: number): RoundState | null {
  const rng = new Rng(seed);
  let r = newRound(seed, 0).round;
  while (!r.ended && !isEndgame(r, 5)) {
    const m = legalMoves(r);
    r = applyMove(r, m[rng.int(m.length)]);
  }
  return r.ended ? null : r;
}

describe('solveEndgame', () => {
  it('returns legal moves in real endgames and null before them', () => {
    expect(solveEndgame(playerView(newRound(1, 0).round, 0), new Rng(1))).toBeNull();
    let tested = 0;
    for (let s = 1; s <= 25 && tested < 8; s++) {
      const r = late(s);
      if (!r) continue;
      const m = solveEndgame(playerView(r, r.current), new Rng(s), { worlds: 6, depth: 3, timeMs: 2000, maxDeck: 5 });
      expect(m).not.toBeNull();
      expect(checkMove(r, m!)).toBeNull();
      tested++;
    }
    expect(tested).toBeGreaterThan(3);
  });

  it('cashes in when the opponent can end the round next turn', () => {
    const r = newRound(4242, 0).round;
    r.tokens.diamond = [];
    r.tokens.gold = [];
    r.tokens.spice = [1];
    r.players[0].hand = ['leather', 'leather', 'leather', 'cloth'] as Good[];
    r.players[0].goodsTokens = [7, 7, 6, 6];
    r.players[1].hand = ['spice', 'spice', 'silver', 'cloth'] as Good[];
    r.players[1].known = ['spice', 'spice'];
    r.players[1].goodsTokens = [7, 7, 5, 6, 6, 5, 5];
    r.market = ['gold', 'silver', 'cloth', 'leather', 'camel'];
    const m = solveEndgame(playerView(r, 0), new Rng(3), { worlds: 10, depth: 3, timeMs: 3000, maxDeck: 5 });
    expect(m).toEqual({ kind: 'sell', good: 'leather', count: 3 });
  });
});
