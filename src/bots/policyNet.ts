import type { Move, RoundState } from '../engine';
import { features2, FEATURE2_COUNT, moveFeatures, MOVE_FEATURE_COUNT } from './features2';
import type { NetWeights } from './valueNet';

/** Scores candidate moves: MLP over [position features (mover's view), move features] → logit; softmax gives priors. */
export class PolicyNet {
  private readonly layers: { w: Float32Array; b: Float32Array; in: number; out: number }[];
  private readonly buf: Float32Array[];
  private readonly x = new Float32Array(FEATURE2_COUNT);
  private readonly mf = new Float32Array(MOVE_FEATURE_COUNT);

  constructor(weights: NetWeights) {
    if (weights.features !== FEATURE2_COUNT + MOVE_FEATURE_COUNT) throw new Error(`policy expects ${weights.features} inputs`);
    this.layers = weights.layers.map((l) => ({ w: Float32Array.from(l.w.flat()), b: Float32Array.from(l.b), in: l.w[0].length, out: l.w.length }));
    this.buf = this.layers.map((l) => new Float32Array(l.out));
  }

  /** Prior probabilities for `moves` in position `r` (for the player to move). */
  priors(r: RoundState, moves: readonly Move[]): number[] {
    // The position part of the first layer is shared by every move: compute it once.
    features2(r, r.current, this.x);
    const l0 = this.layers[0];
    const base = new Float32Array(l0.out);
    for (let o = 0; o < l0.out; o++) {
      let s = l0.b[o];
      const row = o * l0.in;
      for (let i = 0; i < FEATURE2_COUNT; i++) s += l0.w[row + i] * this.x[i];
      base[o] = s;
    }
    const logits = moves.map((m) => {
      moveFeatures(r, m, this.mf);
      let input: Float32Array = this.buf[0];
      for (let o = 0; o < l0.out; o++) {
        let s = base[o];
        const row = o * l0.in + FEATURE2_COUNT;
        for (let i = 0; i < MOVE_FEATURE_COUNT; i++) s += l0.w[row + i] * this.mf[i];
        input[o] = this.layers.length === 1 || s > 0 ? s : 0;
      }
      for (let li = 1; li < this.layers.length; li++) {
        const l = this.layers[li];
        const out = this.buf[li];
        const last = li === this.layers.length - 1;
        for (let o = 0; o < l.out; o++) {
          let s = l.b[o];
          const row = o * l.in;
          for (let i = 0; i < l.in; i++) s += l.w[row + i] * input[i];
          out[o] = last || s > 0 ? s : 0;
        }
        input = out;
      }
      return input[0];
    });
    const top = Math.max(...logits);
    const e = logits.map((l) => Math.exp(l - top));
    const z = e.reduce((a, b) => a + b, 0);
    return e.map((v) => v / z);
  }
}
