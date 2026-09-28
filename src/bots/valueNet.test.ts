import { describe, expect, it } from 'vitest';
import { newRound, Rng } from '../engine';
import { FEATURE_COUNT } from './features';
import { ValueNet } from './valueNet';

function randomWeights(seed: number) {
  const rng = new Rng(seed);
  const layer = (inp: number, out: number) => ({
    w: Array.from({ length: out }, () => Array.from({ length: inp }, () => (rng.next() - 0.5) * 0.4)),
    b: Array.from({ length: out }, () => (rng.next() - 0.5) * 0.2),
  });
  return { features: FEATURE_COUNT, layers: [layer(FEATURE_COUNT, 16), layer(16, 16), layer(16, 2)] };
}

describe('ValueNet', () => {
  it('gives complementary win chances and opposite margins for the two players', () => {
    const net = new ValueNet(randomWeights(1));
    for (let s = 0; s < 20; s++) {
      const o = net.outcome(newRound(s, 0).round);
      expect(o.win[0] + o.win[1]).toBeCloseTo(1, 9);
      expect(o.margin[0]).toBeCloseTo(-o.margin[1], 9);
      expect(o.win[0]).toBeGreaterThan(0);
      expect(o.win[0]).toBeLessThan(1);
    }
  });

  it('rejects weights built for a different feature set', () => {
    expect(() => new ValueNet({ ...randomWeights(2), features: FEATURE_COUNT + 1 })).toThrow();
  });
});
