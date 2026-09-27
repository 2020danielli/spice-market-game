import { describe, expect, it } from 'vitest';
import { applyMove, checkMove, legalMoves, newRound, playerView, Rng, type Card, type Good, type RoundState } from '../engine';
import { easyMove } from './easy';
import { mediumMove } from './heuristic';

function mk(hand: Good[], market: Card[], herd = 0): RoundState {
  const { round } = newRound(9, 0);
  round.players[0].hand = hand;
  round.players[0].herd = herd;
  round.market = market;
  return round;
}

describe('mediumMove', () => {
  it('cashes in a big set', () => {
    const r = mk(['diamond', 'diamond', 'diamond', 'diamond', 'diamond'], ['leather', 'camel', 'camel', 'spice', 'cloth']);
    expect(mediumMove(playerView(r, 0))).toEqual({ kind: 'sell', good: 'diamond', count: 5 });
  });

  it('prefers completing a diamond pair over grabbing leather', () => {
    const r = mk(['diamond', 'cloth'], ['leather', 'diamond', 'camel', 'leather', 'leather']);
    const m = mediumMove(playerView(r, 0));
    expect(m).toEqual({ kind: 'take', index: 1 });
  });

  it('always returns legal moves across random positions', () => {
    const rng = new Rng(77);
    for (let s = 0; s < 30; s++) {
      let r = newRound(s, 0).round;
      while (!r.ended) {
        const v = playerView(r, r.current);
        const m = r.current === 0 ? mediumMove(v) : easyMove(v, rng);
        expect(checkMove(r, m)).toBeNull();
        r = applyMove(r, m);
      }
    }
  });

  it('easy occasionally deviates from medium', () => {
    const r = newRound(4, 0).round;
    const v = playerView(r, 0);
    const med = JSON.stringify(mediumMove(v));
    const rng = new Rng(1);
    const picks = new Set<string>();
    for (let i = 0; i < 40; i++) picks.add(JSON.stringify(easyMove(v, rng)));
    expect(picks.size).toBeGreaterThan(1);
    expect(legalMoves(r).length).toBeGreaterThan(1);
    expect(med).toBeTruthy();
  });
});
