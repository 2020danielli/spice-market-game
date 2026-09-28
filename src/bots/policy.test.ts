import { describe, expect, it } from 'vitest';
import { applyMove, checkMove, cloneRound, newRound, Rng, type Good, type RoundState } from '../engine';
import { estimateOutcome, smartRolloutMove } from './policy';

function base(): RoundState {
  const r = cloneRound(newRound(4242, 0).round);
  return r;
}

describe('smartRolloutMove', () => {
  it('plays legal moves to the end of many rounds', () => {
    const rng = new Rng(11);
    for (let s = 0; s < 150; s++) {
      let r = newRound(s, (s % 2) as 0 | 1).round;
      let steps = 0;
      while (!r.ended) {
        const m = smartRolloutMove(r, rng);
        expect(checkMove(r, m)).toBeNull();
        r = applyMove(r, m);
        expect(++steps).toBeLessThan(400);
      }
    }
  });

  it('ends the round with a sale when that wins it', () => {
    const r = base();
    r.tokens.diamond = [];
    r.tokens.gold = [];
    r.tokens.spice = [1];
    r.players[0].hand = ['spice', 'cloth'] as Good[];
    r.players[0].goodsTokens = [7, 7, 6, 6, 5];
    r.players[1].goodsTokens = [5, 5, 5];
    r.players[0].herd = r.players[1].herd = 0;
    for (let seed = 0; seed < 20; seed++) expect(smartRolloutMove(r, new Rng(seed))).toEqual({ kind: 'sell', good: 'spice', count: 1 });
  });

  it('cashes in its best sale when the opponent can end the round next turn', () => {
    const r = base();
    r.tokens.diamond = [];
    r.tokens.gold = [];
    r.tokens.spice = [1];
    r.players[0].hand = ['leather', 'leather', 'leather', 'cloth'] as Good[];
    r.players[1].hand = ['spice', 'silver'] as Good[];
    r.market = ['gold', 'silver', 'cloth', 'leather', 'camel'];
    for (let seed = 0; seed < 20; seed++) expect(smartRolloutMove(r, new Rng(seed))).toEqual({ kind: 'sell', good: 'leather', count: 3 });
  });
});

describe('estimateOutcome', () => {
  it('is exact for finished rounds and symmetric otherwise', () => {
    const r = base();
    const o = estimateOutcome(r);
    expect(o.win[0] + o.win[1]).toBeCloseTo(1, 9);
    expect(o.margin[0]).toBeCloseTo(-o.margin[1], 9);
    r.players[0].goodsTokens = [7, 7, 7];
    expect(estimateOutcome(r).win[0]).toBeGreaterThan(o.win[0]);
    r.ended = true;
    expect(estimateOutcome(r).win[0]).toBe(1);
  });
});
