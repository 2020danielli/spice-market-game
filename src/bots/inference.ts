import {
  emptyGoodsCount, enumerateMoves, other,
  type BonusSize, type Good, type Move, type PlayerId, type PlayerView, type PublicMove, type Rng, type RoundState,
} from '../engine';
import { determinize } from './determinize';
import { EXPECTED_BONUS } from './heuristic';
import { quickEval } from './policy';

/** Softmax temperature (rupees) of the "sensible player" model used to judge how plausible a move was. */
const TEMPERATURE = 2;
/** Tempering exponent: humans aren't perfectly rational, so each observed move only nudges the belief. */
const BETA = 0.5;
const POOL_SIZE = 160;

/**
 * Rewinds a player's hand through their public moves this round. Every card enters a hand publicly except the deal, so a
 * guess of the current hand fixes the hand before each move. Returns null if the guess could not have made those moves.
 */
export function reconstructHands(current: readonly Good[], moves: readonly PublicMove[]): Good[][] | null {
  const hand = current.slice();
  const out: Good[][] = [];
  const remove = (g: Good) => {
    const k = hand.indexOf(g);
    if (k < 0) return false;
    hand.splice(k, 1);
    return true;
  };
  for (let i = moves.length - 1; i >= 0; i--) {
    const { move, market } = moves[i];
    if (move.kind === 'take') {
      if (!remove(market[move.index] as Good)) return null;
    } else if (move.kind === 'exchange') {
      for (const idx of move.take) if (!remove(market[idx] as Good)) return null;
      hand.push(...move.giveGoods);
    } else if (move.kind === 'sell') {
      for (let c = 0; c < move.count; c++) hand.push(move.good);
    }
    out.unshift(hand.slice());
  }
  return out;
}

function snapshot(pm: PublicMove, hand: Good[]): RoundState {
  const expected = (size: BonusSize) => Array<number>(pm.bonusCounts[size]).fill(EXPECTED_BONUS[size]);
  const me: PlayerId = 0;
  return {
    deck: [],
    market: pm.market.slice(),
    players: [
      { hand, herd: pm.herd, goodsTokens: [], soldGoods: [], bonusTokens: [], known: [] },
      { hand: [], herd: pm.otherHerd, goodsTokens: [], soldGoods: [], bonusTokens: [], known: [] },
    ],
    tokens: pm.tokens,
    bonus: { 3: expected(3), 4: expected(4), 5: expected(5) },
    discard: emptyGoodsCount(),
    current: me,
    ended: false,
    turn: 0,
  };
}

const sameAction = (r: RoundState, a: Move, b: Move) =>
  a.kind === b.kind &&
  (a.kind !== 'take' || r.market[a.index] === r.market[(b as typeof a).index]) &&
  (a.kind !== 'sell' || (a.good === (b as typeof a).good && a.count === (b as typeof a).count));

/** How plausible the observed moves are if the player's current hand is `current` (softmax over a greedy evaluation). */
export function handLikelihood(current: readonly Good[], moves: readonly PublicMove[]): number {
  const hands = reconstructHands(current, moves);
  if (!hands) return 0;
  let logL = 0;
  moves.forEach((pm, i) => {
    if (pm.move.kind === 'exchange') return; // too many alternatives to judge fairly with this model
    const r = snapshot(pm, hands[i]);
    const cands = enumerateMoves(hands[i], pm.herd, pm.market, false);
    const vals = cands.map((m) => quickEval(r, m));
    const actual = quickEval(r, pm.move);
    if (!cands.some((m) => sameAction(r, m, pm.move))) vals.push(actual);
    const top = Math.max(...vals);
    const logZ = Math.log(vals.reduce((s, v) => s + Math.exp((v - top) / TEMPERATURE), 0));
    logL += BETA * ((actual - top) / TEMPERATURE - logZ);
  });
  return Math.exp(logL);
}

export interface HandPool {
  hidden: Good[][];
  cumulative: number[];
}

/** Sample candidate hands for the opponent and weight them by how well they explain the opponent's play this round. */
export function buildHandPool(view: PlayerView, rng: Rng, size = POOL_SIZE): HandPool | null {
  const moves = view.oppMoves ?? [];
  if (moves.length === 0 || view.opp.handSize === view.opp.known.length) return null;
  const opp = other(view.me);
  const hidden: Good[][] = [];
  const cumulative: number[] = [];
  let total = 0;
  for (let i = 0; i < size; i++) {
    const hand = determinize(view, rng).players[opp].hand;
    total += handLikelihood(hand, moves);
    hidden.push(hand.slice(view.opp.known.length));
    cumulative.push(total);
  }
  return total > 0 ? { hidden, cumulative } : null;
}

export function sampleHidden(pool: HandPool, rng: Rng): Good[] {
  const x = rng.next() * pool.cumulative[pool.cumulative.length - 1];
  let lo = 0, hi = pool.cumulative.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (pool.cumulative[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  return pool.hidden[lo];
}
