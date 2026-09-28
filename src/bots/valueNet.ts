import type { PlayerId, RoundState } from '../engine';
import { features, FEATURE_COUNT } from './features';
import { features2, FEATURE2_COUNT } from './features2';
import type { Outcome } from './policy';

/** A small MLP (features → hidden → hidden → [win logit, margin/40]) trained on self-play; see training/train.py. */
export interface NetWeights {
  features: number;
  layers: { w: number[][]; b: number[] }[];
}

interface Layer {
  w: Float32Array;
  b: Float32Array;
  in: number;
  out: number;
}

export class ValueNet {
  private readonly layers: Layer[];
  private readonly buf: Float32Array[];
  private readonly x: Float32Array;
  private readonly extract: (r: RoundState, p: PlayerId, out: Float32Array) => Float32Array;

  constructor(weights: NetWeights) {
    if (weights.features === FEATURE_COUNT) this.extract = features;
    else if (weights.features === FEATURE2_COUNT) this.extract = features2;
    else throw new Error(`net expects ${weights.features} features; known sets are ${FEATURE_COUNT} and ${FEATURE2_COUNT}`);
    this.x = new Float32Array(weights.features);
    this.layers = weights.layers.map((l) => ({
      w: Float32Array.from(l.w.flat()),
      b: Float32Array.from(l.b),
      in: l.w[0].length,
      out: l.w.length,
    }));
    this.buf = this.layers.map((l) => new Float32Array(l.out));
  }

  /** [win logit, margin in rupees] for player p. */
  private forward(r: RoundState, p: PlayerId): [number, number] {
    let input = this.extract(r, p, this.x);
    this.layers.forEach((l, li) => {
      const out = this.buf[li];
      const last = li === this.layers.length - 1;
      for (let o = 0; o < l.out; o++) {
        let s = l.b[o];
        const row = o * l.in;
        for (let i = 0; i < l.in; i++) s += l.w[row + i] * input[i];
        out[o] = last || s > 0 ? s : 0;
      }
      input = out;
    });
    return [input[0], input[1] * 40];
  }

  /** Symmetrized estimate: average of both players' views so the two win chances sum to 1. */
  outcome(r: RoundState): Outcome {
    const [l0, m0] = this.forward(r, 0);
    const [l1, m1] = this.forward(r, 1);
    const w0 = (1 / (1 + Math.exp(-l0)) + 1 - 1 / (1 + Math.exp(-l1))) / 2;
    const m = (m0 - m1) / 2;
    return { win: [w0, 1 - w0], margin: [m, -m] };
  }
}
