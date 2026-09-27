import { other } from './cards';
import { nextRandom } from './rng';
import { applyMove } from './rules';
import { scoreRound } from './scoring';
import { newRound } from './setup';
import type { MatchConfig, MatchState, Move, PlayerId } from './types';

export function newMatch(config: MatchConfig, seed: number): MatchState {
  const [r, s] = nextRandom(seed | 0);
  const starter: PlayerId = r < 0.5 ? 0 : 1;
  const { round, rng } = newRound(s, starter);
  return { config, rng, seals: [0, 0], roundNumber: 1, starter, round, history: [], winner: null };
}

export function playMove(m: MatchState, move: Move): MatchState {
  return { ...m, round: applyMove(m.round, move) };
}

/** Scores the finished round, awards the seal, and deals the next round unless the match is won. */
export function finishRound(m: MatchState): MatchState {
  if (m.winner !== null) return m;
  if (!m.round.ended) throw new Error('The round is not over.');
  const result = scoreRound(m.round, m.config);
  const seals: [number, number] = [m.seals[0], m.seals[1]];
  if (result.sealWinner !== null) seals[result.sealWinner]++;
  const history = [...m.history, result];
  const winner: PlayerId | null = seals[0] >= 2 ? 0 : seals[1] >= 2 ? 1 : null;
  if (winner !== null) return { ...m, seals, history, winner };
  const starter: PlayerId = result.sealWinner === null ? other(m.starter) : other(result.sealWinner);
  const { round, rng } = newRound(m.rng, starter);
  return { ...m, seals, history, starter, round, rng, roundNumber: m.roundNumber + 1 };
}
