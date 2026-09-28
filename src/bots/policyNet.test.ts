import { describe, expect, it } from 'vitest';
import { enumerateMoves, exchangeMoves, newRound } from '../engine';
import { features2, FEATURE2_COUNT, moveFeatures, MOVE_FEATURE_COUNT } from './features2';
import { ismcts } from './ismcts';
import { registerPolicy } from './nets';
import { PolicyNet } from './policyNet';
import { playerView, Rng } from '../engine';

const H = 8;
const rand = (n: number, m: number, seed: number) => Array.from({ length: n }, (_, i) => Array.from({ length: m }, (_, j) => Math.sin(seed + i * 31 + j * 7) * 0.3));
const weights = { features: FEATURE2_COUNT + MOVE_FEATURE_COUNT, layers: [{ w: rand(H, FEATURE2_COUNT + MOVE_FEATURE_COUNT, 1), b: rand(1, H, 2)[0] }, { w: rand(1, H, 3), b: [0] }] };

/** Straightforward forward pass over the concatenated input, to check the split first layer. */
function reference(r: ReturnType<typeof newRound>['round'], m: Parameters<typeof moveFeatures>[1]): number {
  const x = [...features2(r, r.current), ...moveFeatures(r, m)];
  const h = weights.layers[0].w.map((row, o) => Math.max(0, row.reduce((s, w, i) => s + w * x[i], weights.layers[0].b[o])));
  return weights.layers[1].w[0].reduce((s, w, i) => s + w * h[i], 0);
}

describe('policy net', () => {
  it('priors are a softmax of the full-input forward pass', () => {
    const r = newRound(5, 0).round;
    const p = r.players[r.current];
    const moves = [...enumerateMoves(p.hand, p.herd, r.market, false), ...exchangeMoves(p.hand, p.herd, r.market)];
    const pri = new PolicyNet(weights).priors(r, moves);
    const logits = moves.map((m) => reference(r, m));
    const z = logits.reduce((a, l) => a + Math.exp(l), 0);
    pri.forEach((q, i) => expect(q).toBeCloseTo(Math.exp(logits[i]) / z, 5));
  });

  it('search with PUCT priors returns a legal move', () => {
    registerPolicy('test', weights);
    const r = newRound(9, 0).round;
    const m = ismcts(playerView(r, r.current), { timeMs: 1e9, maxIterations: 300, exchangeK: 6, exchangeDepth: 1, exploration: 0.7, policy: 'hybrid', policyName: 'test' }, new Rng(1));
    expect(['take', 'camels', 'exchange', 'sell']).toContain(m.kind);
  });
});
