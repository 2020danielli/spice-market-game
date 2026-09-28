import { GOODS, type Good, type PlayerView, type Rng } from '../engine';
import { BELIEF_FEATURE_COUNT, beliefFeatures, hiddenSlots, unseenGoods } from './belief';
import type { NetWeights } from './valueNet';

/**
 * Joint opponent-hand model (v2). Instead of a weight per good, it scores every possible hidden hand (a multiset of at
 * most a handful of cards over 6 goods: a few hundred candidates), so it can believe "two diamonds or two gold, not one
 * of each". Score = log(number of ways to deal that hand from the unseen cards) + learned correction from public
 * features, including the opponent's recent moves in order. Softmax over candidates → exact sampling.
 */

const RECENT_MOVES = 6;
const PER_MOVE = 4 + 6 + 6 + 6 + 6;
export const BELIEF2_FEATURE_COUNT = BELIEF_FEATURE_COUNT + RECENT_MOVES * PER_MOVE;
/** Per-candidate inputs appended to the position features: counts, and counts relative to what's unseen. */
export const CANDIDATE_FEATURE_COUNT = 12;

export function beliefFeatures2(v: PlayerView, out: Float32Array = new Float32Array(BELIEF2_FEATURE_COUNT)): Float32Array {
  beliefFeatures(v, out);
  let i = BELIEF_FEATURE_COUNT;
  const moves = v.oppMoves ?? [];
  for (let k = 0; k < RECENT_MOVES; k++) {
    const pm = moves[moves.length - 1 - k];
    const slot = out.subarray(i, i + PER_MOVE);
    slot.fill(0);
    i += PER_MOVE;
    if (!pm) continue;
    const m = pm.move;
    slot[['take', 'camels', 'exchange', 'sell'].indexOf(m.kind)] = 1;
    const taken = m.kind === 'take' ? [pm.market[m.index]] : m.kind === 'exchange' ? m.take.map((j) => pm.market[j]) : [];
    for (const c of taken) if (c !== 'camel') slot[4 + GOODS.indexOf(c as Good)] += 1 / 3;
    if (m.kind === 'exchange') for (const g of m.giveGoods) slot[10 + GOODS.indexOf(g)] += 1 / 3;
    if (m.kind === 'sell') slot[16 + GOODS.indexOf(m.good)] = m.count / 5;
    if (m.kind === 'take' || m.kind === 'camels') {
      GOODS.forEach((g, gi) => {
        if (pm.market.includes(g) && !taken.includes(g)) slot[22 + gi] = 1;
      });
    }
  }
  return out;
}

/** Every multiset of `n` goods with count[g] ≤ pool[g], as count vectors in GOODS order. */
export function handCandidates(n: number, pool: Record<Good, number>): number[][] {
  const out: number[][] = [];
  const cur = new Array<number>(GOODS.length).fill(0);
  const rec = (gi: number, left: number) => {
    if (gi === GOODS.length - 1) {
      if (left <= pool[GOODS[gi]]) {
        cur[gi] = left;
        out.push(cur.slice());
      }
      return;
    }
    for (let c = Math.min(left, pool[GOODS[gi]]); c >= 0; c--) {
      cur[gi] = c;
      rec(gi + 1, left - c);
    }
    cur[gi] = 0;
  };
  if (n >= 0) rec(0, n);
  return out;
}

const logChoose = (n: number, k: number) => {
  let s = 0;
  for (let j = 0; j < k; j++) s += Math.log((n - j) / (j + 1));
  return s;
};

/** log of the number of ways to deal this hand from the unseen cards (uniform-dealing prior). */
export function logDealWays(counts: readonly number[], pool: Record<Good, number>): number {
  let s = 0;
  GOODS.forEach((g, gi) => {
    s += logChoose(pool[g], counts[gi]);
  });
  return s;
}

export function candidateFeatures(counts: readonly number[], pool: Record<Good, number>, out: Float32Array): void {
  GOODS.forEach((g, gi) => {
    out[gi] = counts[gi] / 5;
    out[6 + gi] = pool[g] > 0 ? counts[gi] / pool[g] : 0;
  });
}

export class JointBeliefNet {
  private readonly layers: { w: Float32Array; b: Float32Array; in: number; out: number }[];
  private readonly x = new Float32Array(BELIEF2_FEATURE_COUNT);
  private readonly cf = new Float32Array(CANDIDATE_FEATURE_COUNT);

  constructor(weights: NetWeights) {
    if (weights.features !== BELIEF2_FEATURE_COUNT + CANDIDATE_FEATURE_COUNT) throw new Error(`joint belief net expects ${weights.features} inputs`);
    this.layers = weights.layers.map((l) => ({ w: Float32Array.from(l.w.flat()), b: Float32Array.from(l.b), in: l.w[0].length, out: l.w.length }));
  }

  /** Candidate hidden hands (count vectors) with their probabilities. */
  distribution(v: PlayerView): { hands: number[][]; probs: number[] } {
    const pool = unseenGoods(v);
    const hands = handCandidates(hiddenSlots(v), pool);
    if (hands.length <= 1) return { hands, probs: hands.map(() => 1) };
    beliefFeatures2(v, this.x);
    const l0 = this.layers[0];
    const base = new Float32Array(l0.out);
    for (let o = 0; o < l0.out; o++) {
      let s = l0.b[o];
      const row = o * l0.in;
      for (let k = 0; k < BELIEF2_FEATURE_COUNT; k++) s += l0.w[row + k] * this.x[k];
      base[o] = s;
    }
    const scores = hands.map((h) => {
      candidateFeatures(h, pool, this.cf);
      let input = new Float32Array(l0.out);
      for (let o = 0; o < l0.out; o++) {
        let s = base[o];
        const row = o * l0.in + BELIEF2_FEATURE_COUNT;
        for (let k = 0; k < CANDIDATE_FEATURE_COUNT; k++) s += l0.w[row + k] * this.cf[k];
        input[o] = this.layers.length === 1 || s > 0 ? s : 0;
      }
      for (let li = 1; li < this.layers.length; li++) {
        const l = this.layers[li];
        const out = new Float32Array(l.out);
        const last = li === this.layers.length - 1;
        for (let o = 0; o < l.out; o++) {
          let s = l.b[o];
          const row = o * l.in;
          for (let k = 0; k < l.in; k++) s += l.w[row + k] * input[k];
          out[o] = last || s > 0 ? s : 0;
        }
        input = out;
      }
      return logDealWays(h, pool) + input[0];
    });
    const top = Math.max(...scores);
    const e = scores.map((s) => Math.exp(s - top));
    const z = e.reduce((a, b) => a + b, 0);
    return { hands, probs: e.map((x) => x / z) };
  }

  /** A sampler of hidden hands (as card lists) for this view, or undefined when nothing is hidden. */
  sampler(v: PlayerView): ((rng: Rng) => Good[]) | undefined {
    const { hands, probs } = this.distribution(v);
    if (hands.length === 0) return undefined;
    const cdf: number[] = [];
    let acc = 0;
    for (const p of probs) cdf.push((acc += p));
    return (rng) => {
      const x = rng.next() * acc;
      let lo = 0;
      let hi = cdf.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (cdf[mid] < x) lo = mid + 1;
        else hi = mid;
      }
      const cards: Good[] = [];
      hands[lo].forEach((c, gi) => {
        for (let j = 0; j < c; j++) cards.push(GOODS[gi]);
      });
      return cards;
    };
  }
}
