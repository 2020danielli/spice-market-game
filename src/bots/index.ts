import { Rng, type Move, type PlayerView } from '../engine';
import { easyMove } from './easy';
import { mediumMove } from './heuristic';
import { ismcts, type SearchParams } from './ismcts';

export type Tier = 'easy' | 'medium' | 'hard' | 'expert' | 'master' | 'grandmaster';
export const TIERS: readonly Tier[] = ['easy', 'medium', 'hard', 'expert', 'master', 'grandmaster'];

export const TIER_INFO: Record<Tier, { label: string; blurb: string }> = {
  easy: { label: 'Easy', blurb: 'Plays loosely — often random, sometimes sensible.' },
  medium: { label: 'Medium', blurb: 'Greedy one-move lookahead: builds sets, guards the market.' },
  hard: { label: 'Hard', blurb: 'Counts cards and searches ~1s per move.' },
  expert: { label: 'Expert', blurb: 'Self-trained neural evaluation + exact endgame solving, ~4s per move.' },
  master: { label: 'Master', blurb: 'Expert on several CPU cores with double the time (~8s).' },
  grandmaster: { label: 'Grandmaster', blurb: 'AlphaZero-style: move + position networks, reads your hand from your moves (~8s).' },
};

/** Phased search: quick evaluations while the deck is large, full endgame-aware playouts once 8 or fewer cards remain. */
const SMART = { policy: 'hybrid', phaseDeck: 8, marginWeight: 0.3 } as const;
/** Value-network search with the exact endgame solver (Expert, Master). */
const NET_ENDGAME = { policy: 'hybrid', netName: 'v1', marginWeight: 0.3, endgame: {} } as const;
/** The previous deployed setting (hybrid playouts throughout), kept for benchmarking. */
export const HYBRID_V2 = { policy: 'hybrid', marginWeight: 0.3 } as const;

/**
 * AlphaZero-style (three rounds of self-play training): value net v7 on richer features, a policy net that ranks the
 * root's moves (PUCT), and a learned whole-hand model of the opponent's hidden cards from their moves this round.
 */
const GRANDMASTER = { policy: 'hybrid', netName: 'v7', policyName: 'v7', cPuct: 1.5, beliefName: 'v7', marginWeight: 0.3, endgame: {} } as const;

export const SEARCH_PARAMS: Record<'hard' | 'expert' | 'master' | 'grandmaster', SearchParams> = {
  hard: { timeMs: 1000, maxIterations: 6000, exchangeK: 6, exchangeDepth: 1, exploration: 0.7, ...SMART },
  // Self-play-trained value network (v1) + exact PIMC endgame solver: 71% vs the previous Expert at 1 s, 56% at 4 s,
  // 92% vs Medium, 100% vs Easy.
  expert: { timeMs: 4000, maxIterations: 200000, exchangeK: 10, exchangeDepth: 2, exploration: 0.7, ...NET_ENDGAME },
  master: { timeMs: 8000, maxIterations: 400000, exchangeK: 14, exchangeDepth: 2, exploration: 0.7, ...NET_ENDGAME },
  // 65-39 (62% ±9, 104 rounds) vs Master at 8 s per move, single core each; 22-2 vs Medium.
  grandmaster: { timeMs: 8000, maxIterations: 400000, exchangeK: 14, exchangeDepth: 2, exploration: 0.7, ...GRANDMASTER },
};

/** The original (v1) search settings, kept for benchmarking. */
export const SEARCH_PARAMS_V1: Record<'hard' | 'expert', SearchParams> = {
  hard: { timeMs: 1000, maxIterations: 6000, exchangeK: 6, exchangeDepth: 1, exploration: 0.7 },
  expert: { timeMs: 4000, maxIterations: 40000, exchangeK: 10, exchangeDepth: 2, exploration: 0.7 },
};

/** Open-ended search used by the analysis panel (run for as long as the panel wants). */
export const ANALYSIS_PARAMS: SearchParams = {
  timeMs: 0, maxIterations: Infinity, exchangeK: 14, exchangeDepth: 2, exploration: 0.7,
  policy: 'hybrid', netName: 'v7', policyName: 'v7', cPuct: 1.5, beliefName: 'v7', marginWeight: 0.3,
};

/** scale < 1 shrinks the search budget (used by tests and the bench). */
export function chooseMove(tier: Tier, view: PlayerView, seed: number, scale = 1): Move {
  const rng = new Rng(seed);
  switch (tier) {
    case 'easy':
      return easyMove(view, rng);
    case 'medium':
      return mediumMove(view);
    case 'hard':
    case 'expert':
    case 'master':
    case 'grandmaster': {
      const p = SEARCH_PARAMS[tier];
      return ismcts(view, { ...p, timeMs: p.timeMs * scale, maxIterations: Math.max(30, Math.round(p.maxIterations * scale)) }, rng);
    }
  }
}
