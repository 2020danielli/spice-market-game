import { describe, expect, it } from 'vitest';
import { finishRound, newMatch, playMove } from './match';
import { legalMoves } from './rules';
import { Rng } from './rng';
import type { MatchState } from './types';

function playOutRound(m: MatchState, rng: Rng): MatchState {
  while (!m.round.ended) {
    const moves = legalMoves(m.round);
    m = playMove(m, moves[rng.int(moves.length)]);
  }
  return m;
}

describe('match flow', () => {
  it('is deterministic per seed', () => {
    expect(newMatch({ camelTiebreak: false }, 99)).toEqual(newMatch({ camelTiebreak: false }, 99));
  });

  it('awards seals, lets the loser start, and ends at 2 seals', () => {
    const rng = new Rng(5);
    let m = newMatch({ camelTiebreak: false }, 1234);
    let guard = 0;
    while (m.winner === null && guard++ < 20) {
      m = playOutRound(m, rng);
      const before = m;
      m = finishRound(m);
      const res = m.history[m.history.length - 1];
      if (m.winner === null) {
        expect(m.round.ended).toBe(false);
        expect(m.roundNumber).toBe(before.roundNumber + 1);
        if (res.sealWinner !== null) expect(m.starter).toBe(res.sealWinner === 0 ? 1 : 0);
      }
    }
    expect(m.winner).not.toBeNull();
    expect(m.seals[m.winner!]).toBe(2);
    expect(finishRound(m)).toBe(m);
  });

  it('refuses to finish an unfinished round', () => {
    expect(() => finishRound(newMatch({ camelTiebreak: false }, 1))).toThrow();
  });
});
