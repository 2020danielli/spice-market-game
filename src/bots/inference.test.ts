import { describe, expect, it } from 'vitest';
import { applyMove, checkMove, legalMoves, newRound, playerView, publicMovesOf, Rng, type Move, type RoundState } from '../engine';
import { reconstructHands } from './inference';
import { ismcts } from './ismcts';
import { SEARCH_PARAMS } from './index';

function playSome(seed: number, plies: number) {
  const rng = new Rng(seed);
  let r = newRound(seed, 0).round;
  const history: { before: RoundState; move: Move }[] = [];
  for (let i = 0; i < plies && !r.ended; i++) {
    const moves = legalMoves(r);
    const m = moves[rng.int(moves.length)];
    history.push({ before: r, move: m });
    r = applyMove(r, m);
  }
  return { r, history };
}

describe('reconstructHands', () => {
  it('rewinds the opponent hand exactly from the current hand and their public moves', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const { r, history } = playSome(seed, 14);
      const moves = publicMovesOf(history, 1);
      const hands = reconstructHands(r.players[1].hand, moves);
      expect(hands).not.toBeNull();
      const real = history.filter((h) => h.before.current === 1).map((h) => h.before.players[1].hand.slice().sort());
      expect(hands!.map((h) => h.slice().sort())).toEqual(real);
    }
  });

  it('rejects hands that could not have made those moves', () => {
    const { history } = playSome(3, 14);
    const moves = publicMovesOf(history, 1);
    const sold = moves.find((m) => m.move.kind === 'sell');
    if (!sold) return;
    // An empty current hand cannot have sold goods it never had... reconstruction adds them back, so check a take instead.
    const take = moves.find((m) => m.move.kind === 'take');
    if (!take) return;
    expect(reconstructHands([], moves.filter((m) => m === take))).toBeNull();
  });
});

describe('search with inference', () => {
  it('plays legal moves when the view carries the opponent history', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const { r, history } = playSome(seed, 10);
      if (r.ended) continue;
      const v = playerView(r, r.current, history);
      const m = ismcts(v, { ...SEARCH_PARAMS.hard, timeMs: 1e9, maxIterations: 300, inference: true }, new Rng(seed));
      expect(checkMove(r, m)).toBeNull();
    }
  });
});
