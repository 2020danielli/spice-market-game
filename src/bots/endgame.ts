import {
  applyMoveMut, cloneRound, enumerateMoves, exchangeMoves, GOODS, other, playerView, scoreRound,
  type Move, type PlayerId, type PlayerView, type Rng, type RoundState,
} from '../engine';
import { determinize } from './determinize';
import { evaluateMove } from './heuristic';
import { beliefModel, getNet } from './nets';
import { estimateOutcome } from './policy';

export interface EndgameParams {
  /** Sampled hidden-card worlds (PIMC). */
  worlds: number;
  /** Plies searched exactly (alpha-beta) in each world before the leaf evaluation. */
  depth: number;
  timeMs: number;
  netName?: string;
  /** Learned opponent-hand model for sampling worlds. */
  beliefName?: string;
  /** Eligible when the deck has at most this many cards, or two token piles are already empty. */
  maxDeck: number;
}

export const DEFAULT_ENDGAME: EndgameParams = { worlds: 40, depth: 5, timeMs: 3000, maxDeck: 5 };

export function isEndgame(r: { deck: unknown[] | number; tokens: RoundState['tokens'] }, maxDeck: number): boolean {
  const deck = typeof r.deck === 'number' ? r.deck : r.deck.length;
  return deck <= maxDeck || GOODS.filter((g) => r.tokens[g].length === 0).length >= 2;
}

/** Final result from the root player's view, scaled to [-1.4, 1.4]: ±1 for the round plus a margin tiebreak. */
function terminalValue(r: RoundState, me: PlayerId): number {
  const res = scoreRound(r, { camelTiebreak: false });
  const w = res.sealWinner === me ? 1 : res.sealWinner === null ? 0 : -1;
  const margin = res.scores[me] - res.scores[other(me)];
  return w + 0.4 * Math.tanh(margin / 15);
}

function leafValue(r: RoundState, me: PlayerId, netName?: string): number {
  const o = netName ? getNet(netName).outcome(r) : estimateOutcome(r);
  return 2 * o.win[me] - 1 + 0.4 * Math.tanh(o.margin[me] / 15);
}

function candidates(r: RoundState): Move[] {
  const p = r.players[r.current];
  const base = enumerateMoves(p.hand, p.herd, r.market, false);
  // Sales first (they end rounds), then the rest: good alpha-beta ordering.
  base.sort((a, b) => (b.kind === 'sell' ? 1 : 0) - (a.kind === 'sell' ? 1 : 0));
  const ex = exchangeMoves(p.hand, p.herd, r.market);
  if (ex.length) {
    const v = playerView(r, r.current);
    base.push(...ex.map((m) => ({ m, s: evaluateMove(v, m) })).sort((a, b) => b.s - a.s).slice(0, 4).map((x) => x.m));
  }
  return base;
}

/** Negamax with alpha-beta; values are from the point of view of the player to move. */
function negamax(r: RoundState, depth: number, alpha: number, beta: number, me: PlayerId, netName: string | undefined, deadline: number): number {
  const sign = r.current === me ? 1 : -1;
  if (r.ended) return sign * terminalValue(r, me);
  if (depth === 0 || performance.now() > deadline) return sign * leafValue(r, me, netName);
  let best = -Infinity;
  for (const m of candidates(r)) {
    const next = cloneRound(r);
    applyMoveMut(next, m);
    const v = -negamax(next, depth - 1, -beta, -alpha, me, netName, deadline);
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}

function sameMove(a: Move, b: Move, r: RoundState): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'take') return r.market[a.index] === r.market[(b as typeof a).index];
  if (a.kind === 'sell') return a.good === (b as typeof a).good && a.count === (b as typeof a).count;
  if (a.kind === 'exchange') {
    const bb = b as typeof a;
    const k = (m: typeof a) => `${m.take.map((i) => r.market[i]).sort()}|${m.giveGoods.slice().sort()}|${m.giveCamels}`;
    return k(a) === k(bb);
  }
  return true;
}

/**
 * Perfect-information Monte Carlo endgame: sample hidden-card worlds, solve each a few plies deep exactly, and play the
 * move with the best average value. Returns null when the position isn't an endgame.
 */
export function solveEndgame(view: PlayerView, rng: Rng, params: EndgameParams = DEFAULT_ENDGAME): Move | null {
  if (!isEndgame({ deck: view.deckSize, tokens: view.tokens }, params.maxDeck)) return null;
  const deadline = performance.now() + params.timeMs;
  const hm = beliefModel(view, params.beliefName);
  const sample = () => determinize(view, rng, hm?.hidden?.(rng), hm?.weights);
  const first = sample();
  const rootMoves = candidates(first);
  if (rootMoves.length === 1) return rootMoves[0];
  const totals = new Array<number>(rootMoves.length).fill(0);
  let worlds = 0;
  for (let w = 0; w < params.worlds && performance.now() < deadline; w++) {
    const world = w === 0 ? first : sample();
    const worldMoves = candidates(world);
    rootMoves.forEach((m, i) => {
      const mm = worldMoves.find((x) => sameMove(x, m, world)) ?? m;
      const next = cloneRound(world);
      applyMoveMut(next, mm);
      totals[i] += -negamax(next, params.depth - 1, -Infinity, Infinity, view.me, params.netName, deadline);
    });
    worlds++;
  }
  if (worlds === 0) return null;
  let best = 0;
  totals.forEach((t, i) => {
    if (t > totals[best]) best = i;
  });
  return rootMoves[best];
}
