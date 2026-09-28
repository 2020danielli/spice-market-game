import { DECK_COMPOSITION, GOODS, HAND_LIMIT, sum, type Card, type Good, type PlayerView } from '../engine';
import type { NetWeights } from './valueNet';

/**
 * Learned opponent-hand model. From public information only (the table, card counting, and the opponent's moves this
 * round), predict how likely each good is among the opponent's unseen cards. Sampling: each unseen card of good g in
 * the pool gets weight exp(w_g); the hidden slots are filled by weighted draws without replacement.
 * Trained on self-play where the true hands are known (training/train.py, mode belief).
 */

export const BELIEF_FEATURE_COUNT = 6 * 5 + 8 + 6 * 8 + 5;

/** Unseen goods (not camels) by type: what the opponent's hidden cards are drawn from. */
export function unseenGoods(v: PlayerView): Record<Good, number> {
  const remaining: Record<Card, number> = { ...DECK_COMPOSITION };
  for (const c of v.market) remaining[c]--;
  for (const g of v.hand) remaining[g]--;
  for (const g of v.opp.known) remaining[g]--;
  for (const g of GOODS) remaining[g] -= v.discard[g];
  const out = {} as Record<Good, number>;
  for (const g of GOODS) out[g] = Math.max(0, remaining[g]);
  return out;
}

export function hiddenSlots(v: PlayerView): number {
  return v.opp.handSize - v.opp.known.length;
}

const count = (cards: readonly Card[], g: Good) => cards.reduce((n, c) => n + (c === g ? 1 : 0), 0);

export function beliefFeatures(v: PlayerView, out: Float32Array = new Float32Array(BELIEF_FEATURE_COUNT)): Float32Array {
  let i = 0;
  const push = (x: number) => {
    out[i++] = x;
  };
  const moves = v.oppMoves ?? [];

  // What their moves say, per good: passed it up (and how valuable it was), took it, gave it away, sold it.
  const declined = {} as Record<Good, number>;
  const declinedValue = {} as Record<Good, number>;
  const took = {} as Record<Good, number>;
  const gave = {} as Record<Good, number>;
  const sold = {} as Record<Good, number>;
  for (const g of GOODS) declined[g] = declinedValue[g] = took[g] = gave[g] = sold[g] = 0;
  let camelTakes = 0;
  let exchanges = 0;
  let sinceSell = 0;
  for (const pm of moves) {
    const m = pm.move;
    const takenGoods: Card[] = m.kind === 'take' ? [pm.market[m.index]] : m.kind === 'exchange' ? m.take.map((k) => pm.market[k]) : [];
    if (m.kind === 'take' || m.kind === 'camels') {
      for (const g of GOODS) {
        if (pm.market.includes(g) && !takenGoods.includes(g)) {
          declined[g]++;
          declinedValue[g] += (pm.tokens[g][0] ?? 0) / 7;
        }
      }
    }
    for (const c of takenGoods) if (c !== 'camel') took[c as Good]++;
    if (m.kind === 'exchange') {
      exchanges++;
      for (const g of m.giveGoods) gave[g]++;
    }
    if (m.kind === 'camels') camelTakes++;
    if (m.kind === 'sell') {
      sold[m.good] += m.count;
      sinceSell = 0;
    } else sinceSell++;
  }
  for (const g of GOODS) {
    push(Math.min(declined[g], 8) / 5);
    push(Math.min(declinedValue[g], 8) / 5);
    push(took[g] / 5);
    push(gave[g] / 5);
    push(sold[g] / 7);
  }
  push(moves.length / 20);
  push(camelTakes / 5);
  push(exchanges / 5);
  push(Math.min(sinceSell, 10) / 10);
  const last = moves[moves.length - 1]?.move.kind;
  for (const k of ['take', 'camels', 'exchange', 'sell'] as const) push(last === k ? 1 : 0);

  // The table and card counting, per good.
  const pool = unseenGoods(v);
  for (const g of GOODS) {
    push(pool[g] / 10);
    push(count(v.opp.known, g) / 5);
    push(count(v.market, g) / 5);
    push(count(v.hand, g) / 5);
    push((v.tokens[g][0] ?? 0) / 7);
    push(v.tokens[g].length / 9);
    push(v.opp.soldGoods.filter((s) => s === g).length / 7);
    push(v.discard[g] / 7);
  }

  const hidden = hiddenSlots(v);
  push(hidden / HAND_LIMIT);
  push(v.opp.handSize / HAND_LIMIT);
  push(v.opp.herd / 10);
  push(v.deckSize / 40);
  push(sum(Object.values(pool)) / 40);

  if (i !== BELIEF_FEATURE_COUNT) throw new Error(`belief feature count ${i} != ${BELIEF_FEATURE_COUNT}`);
  return out;
}

export class BeliefNet {
  private readonly layers: { w: Float32Array; b: Float32Array; in: number; out: number }[];
  private readonly x = new Float32Array(BELIEF_FEATURE_COUNT);

  constructor(weights: NetWeights) {
    if (weights.features !== BELIEF_FEATURE_COUNT) throw new Error(`belief net expects ${weights.features} features, have ${BELIEF_FEATURE_COUNT}`);
    this.layers = weights.layers.map((l) => ({ w: Float32Array.from(l.w.flat()), b: Float32Array.from(l.b), in: l.w[0].length, out: l.w.length }));
  }

  /** Per-card weight exp(w_g) for each good among the opponent's unseen cards. */
  weights(v: PlayerView): Record<Good, number> {
    let input: Float32Array = beliefFeatures(v, this.x);
    this.layers.forEach((l, li) => {
      const out = new Float32Array(l.out);
      const last = li === this.layers.length - 1;
      for (let o = 0; o < l.out; o++) {
        let s = l.b[o];
        const row = o * l.in;
        for (let k = 0; k < l.in; k++) s += l.w[row + k] * input[k];
        out[o] = last || s > 0 ? s : 0;
      }
      input = out;
    });
    const w = {} as Record<Good, number>;
    GOODS.forEach((g, k) => {
      w[g] = Math.exp(Math.max(-8, Math.min(8, input[k])));
    });
    return w;
  }
}

/** Probability that one hidden card is each good (the model's view; for display and tests). */
export function hiddenCardOdds(v: PlayerView, w: Record<Good, number>): Record<Good, number> {
  const pool = unseenGoods(v);
  const z = GOODS.reduce((s, g) => s + pool[g] * w[g], 0) || 1;
  const out = {} as Record<Good, number>;
  for (const g of GOODS) out[g] = (pool[g] * w[g]) / z;
  return out;
}
