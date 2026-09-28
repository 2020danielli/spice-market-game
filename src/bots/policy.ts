import {
  CAMEL_BONUS, countGoods, GOODS, HAND_LIMIT, legalMoves, other, PRECIOUS, sum,
  type BonusSize, type Good, type Move, type PlayerId, type RoundState,
} from '../engine';
import { camelValue, DEFAULT_WEIGHTS, exposure, handPotential } from './heuristic';
import type { Rng } from '../engine';

const EPSILON = 0.08;
/** Rupees of estimated margin per logit unit when turning an unfinished position into a win chance. */
const WIN_SCALE = 5;

function bonusCounts(r: RoundState): Record<BonusSize, number> {
  return { 3: r.bonus[3].length, 4: r.bonus[4].length, 5: r.bonus[5].length };
}

/** Points banked so far (goods + bonus values), without the camel token. */
function banked(r: RoundState, p: PlayerId): number {
  const pl = r.players[p];
  return sum(pl.goodsTokens) + sum(pl.bonusTokens.map((t) => t.value));
}

function camelEdge(r: RoundState, p: PlayerId): number {
  const a = r.players[p].herd, b = r.players[other(p)].herd;
  return a > b ? CAMEL_BONUS : a < b ? -CAMEL_BONUS : 0;
}

function emptyStacks(r: RoundState): number {
  return GOODS.filter((g) => r.tokens[g].length === 0).length;
}

/** Exact value (in this determinized world) of selling n of a good now. */
function saleValue(r: RoundState, g: Good, n: number): number {
  let v = sum(r.tokens[g].slice(0, n));
  if (n >= 3) v += r.bonus[Math.min(n, 5) as BonusSize][0] ?? 0;
  return v;
}

function saleEndsRound(r: RoundState, g: Good, n: number): boolean {
  const stack = r.tokens[g].length;
  return stack > 0 && n >= stack && emptyStacks(r) + 1 >= 3;
}

function sales(r: RoundState, p: PlayerId): { good: Good; count: number; value: number }[] {
  const counts = countGoods(r.players[p].hand);
  return GOODS.filter((g) => counts[g] >= (PRECIOUS.has(g) ? 2 : 1)).map((g) => ({ good: g, count: counts[g], value: saleValue(r, g, counts[g]) }));
}

/** Can player p end the round on their next move (by emptying a third token stack, or by drawing from an empty deck)? */
function canEndRound(r: RoundState, p: PlayerId): boolean {
  if (r.deck.length === 0) return true;
  return sales(r, p).some((s) => saleEndsRound(r, s.good, s.count));
}

export function quickEval(r: RoundState, m: Move): number {
  const me = r.current;
  const pl = r.players[me];
  const w = DEFAULT_WEIGHTS;
  const bc = bonusCounts(r);
  let hand = pl.hand;
  let herd = pl.herd;
  let gained = 0;
  const market: (typeof r.market[number] | null)[] = r.market.slice();
  let tokens: Record<Good, readonly number[]> = r.tokens;
  if (m.kind === 'take') {
    hand = [...hand, r.market[m.index] as Good];
    market[m.index] = null;
  } else if (m.kind === 'camels') {
    market.forEach((c, i) => {
      if (c === 'camel') {
        herd++;
        market[i] = null;
      }
    });
  } else if (m.kind === 'sell') {
    let left = m.count;
    hand = hand.filter((g) => !(g === m.good && left-- > 0));
    gained = saleValue(r, m.good, m.count);
    tokens = { ...r.tokens, [m.good]: r.tokens[m.good].slice(m.count) };
  }
  return (
    gained +
    handPotential(hand, tokens, bc, w) +
    camelValue(herd, r.players[other(me)].herd, w) -
    exposure(market, tokens, w) -
    (hand.length >= HAND_LIMIT ? w.fullHand : 0)
  );
}

/**
 * Fast playout policy that plays like a sensible opponent: it ends the round when a sale (or an empty-deck draw) wins it,
 * cashes in when the opponent could end the round next turn, and otherwise plays the best one-ply move (with a little noise).
 */
export function smartRolloutMove(r: RoundState, rng: Rng): Move {
  const moves = legalMoves(r).filter((m) => m.kind !== 'exchange');
  if (moves.length === 0) return legalMoves(r)[0];
  const urgent = endgameMove(r, moves);
  if (urgent) return urgent;
  return greedyMove(r, moves, rng);
}

/** Endgame rules only: end the round when that wins it, or bank the best sale if the opponent can end it next turn. */
export function endgameMove(r: RoundState, moves: Move[] = legalMoves(r)): Move | null {
  const me = r.current;
  const opp = other(me);
  if (emptyStacks(r) < 2 && r.deck.length > 1) return null;

  const lead = banked(r, me) - banked(r, opp);
  // 1. Winning round-enders.
  let bestEnd: Move | null = null;
  let bestEndMargin = 0;
  for (const s of sales(r, me)) {
    if (!saleEndsRound(r, s.good, s.count)) continue;
    const margin = lead + s.value + camelEdge(r, me);
    if (margin > bestEndMargin) {
      bestEndMargin = margin;
      bestEnd = { kind: 'sell', good: s.good, count: s.count };
    }
  }
  if (r.deck.length === 0 && lead + camelEdge(r, me) > bestEndMargin) {
    const draw = moves.find((m) => m.kind === 'take' || m.kind === 'camels');
    if (draw) return draw;
  }
  if (bestEnd) return bestEnd;

  // 2. The opponent can end the round next turn: bank the best sale now.
  if (canEndRound(r, opp)) {
    const best = sales(r, me).sort((a, b) => b.value - a.value)[0];
    if (best && best.value > 0) return { kind: 'sell', good: best.good, count: best.count };
  }
  return null;
}

function greedyMove(r: RoundState, moves: Move[], rng: Rng): Move {
  // Greedy one-ply with a little exploration.
  if (rng.next() < EPSILON) return moves[rng.int(moves.length)];
  let best = moves[0];
  let bestV = -Infinity;
  for (const m of moves) {
    const v = quickEval(r, m) + rng.next() * 0.3;
    if (v > bestV) {
      bestV = v;
      best = m;
    }
  }
  return best;
}

export interface Outcome {
  win: [number, number];
  margin: [number, number];
}

export interface EvalWeights {
  /** Share of the 5-point camel token credited to the current herd leader. */
  camel: number;
  /** Share of each hand's discounted set value credited as future points. */
  potential: number;
  /** Rupees of margin per logit unit when turning the estimate into a win chance. */
  scale: number;
}
export const DEFAULT_EVAL: EvalWeights = { camel: 0.8, potential: 0.6, scale: WIN_SCALE };

/** Exact result for a finished round; otherwise a heuristic estimate of the final margin and win chance. */
export function estimateOutcome(r: RoundState, ew: EvalWeights = DEFAULT_EVAL): Outcome {
  if (r.ended) {
    const s0 = banked(r, 0) + Math.max(0, camelEdge(r, 0));
    const s1 = banked(r, 1) + Math.max(0, camelEdge(r, 1));
    const d = s0 - s1;
    const w0 = d > 0 ? 1 : d < 0 ? 0 : r.players[0].bonusTokens.length > r.players[1].bonusTokens.length ? 1 : r.players[0].bonusTokens.length < r.players[1].bonusTokens.length ? 0 : 0.5;
    return { win: [w0, 1 - w0], margin: [d, -d] };
  }
  const bc = bonusCounts(r);
  const pot = (p: PlayerId) => handPotential(r.players[p].hand, r.tokens, bc, DEFAULT_WEIGHTS);
  const d = banked(r, 0) - banked(r, 1) + camelEdge(r, 0) * ew.camel + (pot(0) - pot(1)) * ew.potential;
  const w0 = 1 / (1 + Math.exp(-d / ew.scale));
  return { win: [w0, 1 - w0], margin: [d, -d] };
}
