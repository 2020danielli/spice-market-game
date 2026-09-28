import { describe, expect, it } from 'vitest';
import { applyMove, GOODS, newRound, playerView, Rng, type HistoryEntry, type RoundState } from '../engine';
import { BELIEF_FEATURE_COUNT, beliefFeatures, hiddenSlots, unseenGoods } from './belief';
import { determinize } from './determinize';
import { ismcts } from './ismcts';
import { registerBelief } from './nets';
import { chooseMove } from '.';

function playSome(seed: number, plies: number): { r: RoundState; history: HistoryEntry[] } {
  let r = newRound(seed, 0).round;
  const history: HistoryEntry[] = [];
  for (let i = 0; i < plies && !r.ended; i++) {
    const move = chooseMove('medium', playerView(r, r.current), seed * 100 + i);
    history.push({ before: r, move });
    r = applyMove(r, move);
  }
  return { r, history };
}

describe('belief model', () => {
  it('features are finite and the right length over random games', () => {
    for (let s = 1; s < 30; s++) {
      const { r, history } = playSome(s, s % 12);
      const f = beliefFeatures(playerView(r, 0, history));
      expect(f.length).toBe(BELIEF_FEATURE_COUNT);
      expect([...f].every(Number.isFinite)).toBe(true);
    }
  });

  it('the true hidden cards always fit inside the unseen pool', () => {
    for (let s = 1; s < 30; s++) {
      const { r, history } = playSome(s, s % 12);
      const v = playerView(r, 0, history);
      const pool = unseenGoods(v);
      const opp = r.players[1];
      for (const g of GOODS) expect(opp.hand.filter((c) => c === g).length - opp.known.filter((c) => c === g).length).toBeLessThanOrEqual(pool[g]);
    }
  });

  it('weighted determinization keeps the hand size and known cards, and follows the weights', () => {
    const r = newRound(3, 0).round;
    const v = playerView(r, 0, []);
    const w = Object.fromEntries(GOODS.map((g) => [g, g === 'diamond' ? 50 : 1])) as Record<(typeof GOODS)[number], number>;
    let diamonds = 0;
    let plain = 0;
    for (let i = 0; i < 300; i++) {
      const opp = determinize(v, new Rng(i), undefined, w).players[1];
      expect(opp.hand.length).toBe(v.opp.handSize);
      for (const k of v.opp.known) expect(opp.hand).toContain(k);
      diamonds += opp.hand.filter((c) => c === 'diamond').length;
      plain += determinize(v, new Rng(i)).players[1].hand.filter((c) => c === 'diamond').length;
    }
    expect(hiddenSlots(v)).toBeGreaterThan(0);
    expect(diamonds).toBeGreaterThan(2 * plain);
  });

  it('search with a belief net returns a legal move', () => {
    const H = 8;
    const mk = (n: number, m: number, k: number) => Array.from({ length: n }, (_, i) => Array.from({ length: m }, (_, j) => Math.cos(k + i * 13 + j * 5) * 0.2));
    registerBelief('test', { features: BELIEF_FEATURE_COUNT, layers: [{ w: mk(H, BELIEF_FEATURE_COUNT, 1), b: mk(1, H, 2)[0] }, { w: mk(6, H, 3), b: [0, 0, 0, 0, 0, 0] }] });
    const { r, history } = playSome(7, 5);
    const m = ismcts(playerView(r, r.current, history), { timeMs: 1e9, maxIterations: 300, exchangeK: 6, exchangeDepth: 1, exploration: 0.7, policy: 'hybrid', beliefName: 'test' }, new Rng(2));
    expect(['take', 'camels', 'exchange', 'sell']).toContain(m.kind);
  });
});

describe('joint belief model', () => {
  it('enumerates every hand that fits the unseen pool', async () => {
    const { handCandidates } = await import('./beliefJoint');
    const pool = { diamond: 1, gold: 0, silver: 2, cloth: 5, spice: 5, leather: 9 };
    const hands = handCandidates(3, pool);
    expect(hands.every((h) => h.reduce((a, b) => a + b, 0) === 3)).toBe(true);
    expect(hands.every((h) => h[0] <= 1 && h[1] === 0 && h[2] <= 2)).toBe(true);
    expect(new Set(hands.map((h) => h.join())).size).toBe(hands.length);
    // Brute force count: goods with room (d≤1, s≤2, c, sp, l) making 3.
    let n = 0;
    for (let d = 0; d <= 1; d++) for (let s = 0; s <= 2; s++) for (let c = 0; c <= 3; c++) for (let sp = 0; sp <= 3; sp++) if (d + s + c + sp <= 3) n++;
    expect(hands.length).toBe(n);
  });

  it('with a zero correction the model is uniform dealing (hypergeometric) and sampling respects the view', async () => {
    const { JointBeliefNet, BELIEF2_FEATURE_COUNT, CANDIDATE_FEATURE_COUNT, handCandidates } = await import('./beliefJoint');
    const n = BELIEF2_FEATURE_COUNT + CANDIDATE_FEATURE_COUNT;
    const net = new JointBeliefNet({ features: n, kind: 'belief2', layers: [{ w: [new Array(n).fill(0)], b: [0] }, { w: [[0]], b: [0] }] } as never);
    const { r, history } = playSome(11, 2);
    const v = playerView(r, 0, history);
    const { hands, probs } = net.distribution(v);
    expect(hands.length).toBe(handCandidates(hiddenSlots(v), unseenGoods(v)).length);
    expect(probs.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    // Uniform dealing: empirical frequency of each good among dealt hidden cards matches the pool share.
    const pool = unseenGoods(v);
    const total = GOODS.reduce((a, g) => a + pool[g], 0);
    const expected = GOODS.map((g) => pool[g] / total);
    const got = GOODS.map((_, gi) => hands.reduce((a, h, k) => a + probs[k] * h[gi], 0) / hiddenSlots(v));
    got.forEach((x, gi) => expect(x).toBeCloseTo(expected[gi], 6));
    const sample = net.sampler(v)!;
    for (let i = 0; i < 50; i++) expect(sample(new Rng(i)).length).toBe(hiddenSlots(v));
  });
});
