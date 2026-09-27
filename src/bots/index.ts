import { Rng, type Move, type PlayerView } from '../engine';
import { easyMove } from './easy';
import { mediumMove } from './heuristic';
import { ismcts, type SearchParams } from './ismcts';

export type Tier = 'easy' | 'medium' | 'hard' | 'expert';
export const TIERS: readonly Tier[] = ['easy', 'medium', 'hard', 'expert'];

export const TIER_INFO: Record<Tier, { label: string; blurb: string }> = {
  easy: { label: 'Easy', blurb: 'Plays loosely — often random, sometimes sensible.' },
  medium: { label: 'Medium', blurb: 'Greedy one-move lookahead: builds sets, guards the market.' },
  hard: { label: 'Hard', blurb: 'Counts cards and searches ~1s per move.' },
  expert: { label: 'Expert', blurb: 'Counts cards and searches ~4s per move, wider and deeper.' },
};

export const SEARCH_PARAMS: Record<'hard' | 'expert', SearchParams> = {
  hard: { timeMs: 1000, maxIterations: 6000, exchangeK: 6, exchangeDepth: 1, exploration: 0.7 },
  expert: { timeMs: 4000, maxIterations: 40000, exchangeK: 10, exchangeDepth: 2, exploration: 0.7 },
};

/** Open-ended search used by the analysis panel (run for as long as the panel wants). */
export const ANALYSIS_PARAMS: SearchParams = { timeMs: 0, maxIterations: Infinity, exchangeK: 10, exchangeDepth: 2, exploration: 0.7 };

/** scale < 1 shrinks the search budget (used by tests and the bench). */
export function chooseMove(tier: Tier, view: PlayerView, seed: number, scale = 1): Move {
  const rng = new Rng(seed);
  switch (tier) {
    case 'easy':
      return easyMove(view, rng);
    case 'medium':
      return mediumMove(view);
    case 'hard':
    case 'expert': {
      const p = SEARCH_PARAMS[tier];
      return ismcts(view, { ...p, timeMs: p.timeMs * scale, maxIterations: Math.max(30, Math.round(p.maxIterations * scale)) }, rng);
    }
  }
}
