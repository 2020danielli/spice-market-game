import { describe, expect, it } from 'vitest';
import { applyMove, applyMoveMut, checkMove, cloneRound, newRound, playerView, Rng, type RoundState } from '../engine';
import { chooseMove } from './index';
import { rolloutMove } from './rollout';
import { IsmctsSearch } from './ismcts';
import { SEARCH_PARAMS } from './index';

describe('rolloutMove', () => {
  it('plays legal moves to the end of many rounds', () => {
    const rng = new Rng(3);
    for (let s = 0; s < 100; s++) {
      const r = cloneRound(newRound(s, 0).round);
      let steps = 0;
      while (!r.ended) {
        const m = rolloutMove(r, rng);
        expect(checkMove(r, m)).toBeNull();
        applyMoveMut(r, m);
        expect(++steps).toBeLessThan(400);
      }
    }
  });
});

describe('chooseMove (search tiers)', () => {
  it('returns legal moves under a tiny budget', () => {
    for (let s = 0; s < 5; s++) {
      let r: RoundState = newRound(s, 0).round;
      for (let i = 0; i < 6 && !r.ended; i++) {
        const m = chooseMove(i % 2 ? 'expert' : 'hard', playerView(r, r.current), s * 10 + i, 0.02);
        expect(checkMove(r, m)).toBeNull();
        r = applyMove(r, m);
      }
    }
  });

  it('takes the round-winning sale when it is on the table', () => {
    const r = newRound(8, 0).round;
    r.tokens.diamond = [];
    r.tokens.gold = [];
    r.tokens.silver = [5];
    r.players[0].hand = ['silver', 'silver', 'cloth'];
    r.players[0].goodsTokens = [10];
    r.players[1].goodsTokens = [14];
    r.players[0].herd = 0;
    r.players[1].herd = 0;
    r.market = ['leather', 'leather', 'spice', 'cloth', 'leather'];
    // Selling 2 silver takes the last silver token (5) and ends the round 15-14.
    const m = chooseMove('hard', playerView(r, 0), 1, 0.2);
    expect(m).toEqual({ kind: 'sell', good: 'silver', count: 2 });
  });
});

describe('IsmctsSearch', () => {
  const params = { ...SEARCH_PARAMS.hard, timeMs: 0, maxIterations: Infinity };

  it('accumulates root statistics incrementally', () => {
    const r = newRound(12, 0).round;
    const s = new IsmctsSearch(playerView(r, 0), params, new Rng(1));
    for (let i = 0; i < 60; i++) s.iterate();
    const stats = s.rootStats();
    expect(s.iterations).toBe(60);
    expect(stats.reduce((a, x) => a + x.visits, 0)).toBe(60);
    for (const st of stats) {
      expect(checkMove(r, st.move)).toBeNull();
      expect(st.win).toBeGreaterThanOrEqual(0);
      expect(st.win).toBeLessThanOrEqual(st.visits);
      expect(st.line[0].mover).toBe(0);
    }
  });

  it('builds a likely line that alternates players', () => {
    const r = newRound(12, 0).round;
    const s = new IsmctsSearch(playerView(r, 0), params, new Rng(2));
    for (let i = 0; i < 1500; i++) s.iterate();
    const best = s.rootStats().sort((a, b) => b.visits - a.visits)[0];
    expect(best.line.length).toBeGreaterThanOrEqual(2);
    expect(best.line.length).toBeLessThanOrEqual(4);
    best.line.forEach((step, i) => expect(step.mover).toBe(i % 2 === 0 ? 0 : 1));
  });

  it('supports the typical opponent model', () => {
    const r = newRound(13, 1).round;
    const s = new IsmctsSearch(playerView(r, 1), { ...params, opponent: 'typical' }, new Rng(3));
    for (let i = 0; i < 200; i++) s.iterate();
    expect(checkMove(r, s.bestMove())).toBeNull();
    expect(s.rootStats().reduce((a, x) => a + x.visits, 0)).toBe(200);
  });
});

describe('IsmctsSearch memory bounds', () => {
  const params = { ...SEARCH_PARAMS.hard, timeMs: 0, maxIterations: Infinity };

  it('stops growing the tree at maxNodes but keeps searching', () => {
    const r = newRound(21, 0).round;
    const s = new IsmctsSearch(playerView(r, 0), { ...params, maxNodes: 50 }, new Rng(4));
    for (let i = 0; i < 500; i++) s.iterate();
    expect(s.nodeCount).toBeLessThanOrEqual(50);
    expect(s.iterations).toBe(500);
    expect(checkMove(r, s.bestMove())).toBeNull();
  });

  it('clears the candidate cache when it passes its limit', () => {
    const r = newRound(22, 0).round;
    const s = new IsmctsSearch(playerView(r, 0), { ...params, cacheLimit: 10 }, new Rng(5));
    for (let i = 0; i < 300; i++) s.iterate();
    expect(s.cacheSize).toBeLessThanOrEqual(10);
  });
});
