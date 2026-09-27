import { countGoods, GOODS, HAND_LIMIT, legalMoves, PRECIOUS, type BonusSize, type Move, type Rng, type RoundState } from '../engine';
import { setValue } from './heuristic';

/** Cheap, slightly noisy playout policy on a full state (no exchange enumeration). */
export function rolloutMove(r: RoundState, rng: Rng): Move {
  const p = r.players[r.current];
  const counts = countGoods(p.hand);
  const bonusCounts: Record<BonusSize, number> = { 3: r.bonus[3].length, 4: r.bonus[4].length, 5: r.bonus[5].length };
  const full = p.hand.length >= HAND_LIMIT;

  let bestSell: Move | null = null;
  let bestSellVal = 0;
  for (const g of GOODS) {
    const n = counts[g];
    if (!n || (PRECIOUS.has(g) && n < 2)) continue;
    const eager = n >= 3 || PRECIOUS.has(g) || full;
    const val = setValue(g, n, r.tokens, bonusCounts) + (full ? 1 : 0);
    if (eager && val > bestSellVal) {
      bestSellVal = val;
      bestSell = { kind: 'sell', good: g, count: n };
    }
  }
  if (bestSell && (bestSellVal >= 8 || full || rng.next() < 0.3)) return bestSell;

  const camels = r.market.filter((c) => c === 'camel').length;
  if (!full) {
    if (camels >= 3 && rng.next() < 0.6) return { kind: 'camels' };
    let bestIdx = -1;
    let bestVal = -1;
    r.market.forEach((c, i) => {
      if (c === 'camel') return;
      const val = (r.tokens[c][0] ?? 0) + counts[c] * 2 + rng.next() * 2;
      if (val > bestVal) {
        bestVal = val;
        bestIdx = i;
      }
    });
    if (bestIdx >= 0) return { kind: 'take', index: bestIdx };
  }
  if (camels > 0) return { kind: 'camels' };
  if (bestSell) return bestSell;
  const moves = legalMoves(r);
  return moves[rng.int(moves.length)];
}
