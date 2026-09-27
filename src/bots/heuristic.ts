import {
  countGoods, enumerateMoves, GOODS, HAND_LIMIT, PRECIOUS, removeGoods, removeUpTo, sum,
  type BonusSize, type Card, type Good, type Move, type PlayerView,
} from '../engine';

/** Mean value of each bonus stack. */
export const EXPECTED_BONUS: Record<BonusSize, number> = { 3: 2, 4: 5, 5: 9 };

export interface Weights {
  /** Per-turn discount on unrealized set value. */
  setDiscount: number;
  camelEach: number;
  camelCap: number;
  camelLead: number;
  exposureTop: number;
  exposureCamel: number;
  fullHand: number;
}

export const DEFAULT_WEIGHTS: Weights = {
  setDiscount: 0.7,
  camelEach: 0.6,
  camelCap: 5,
  camelLead: 2.5,
  exposureTop: 0.5,
  exposureCamel: 0.35,
  fullHand: 1.5,
};

/** Rupees from selling n of a good right now (tokens + expected bonus). 0 if the sale is illegal. */
export function setValue(
  good: Good, n: number, tokens: Record<Good, readonly number[]>, bonusCounts: Record<BonusSize, number>,
): number {
  if (n <= 0 || (PRECIOUS.has(good) && n < 2)) return 0;
  let v = sum(tokens[good].slice(0, n));
  if (n >= 3) {
    const size = Math.min(n, 5) as BonusSize;
    if (bonusCounts[size] > 0) v += EXPECTED_BONUS[size];
  }
  return v;
}

/** Discounted value of the hand, allowing each set to grow by up to 2 more cards. */
export function handPotential(
  hand: readonly Good[], tokens: Record<Good, readonly number[]>, bonusCounts: Record<BonusSize, number>, w: Weights,
): number {
  const counts = countGoods(hand);
  let total = 0;
  for (const g of GOODS) {
    const n = counts[g];
    if (!n) continue;
    let best = 0;
    for (let extra = 0; extra <= 2; extra++) {
      best = Math.max(best, setValue(g, n + extra, tokens, bonusCounts) * Math.pow(w.setDiscount, 1 + extra));
    }
    total += best;
  }
  return total;
}

export function camelValue(herd: number, oppHerd: number, w: Weights): number {
  const lead = herd > oppHerd ? w.camelLead : herd === oppHerd ? w.camelLead / 2 : 0;
  return w.camelEach * Math.min(herd, w.camelCap) + lead;
}

/** What the market we leave behind offers the opponent. Unknown (refilled) slots are null. */
export function exposure(market: readonly (Card | null)[], tokens: Record<Good, readonly number[]>, w: Weights): number {
  let top = 0;
  let camels = 0;
  for (const c of market) {
    if (c === null) continue;
    if (c === 'camel') camels++;
    else top = Math.max(top, tokens[c][0] ?? 0);
  }
  return w.exposureTop * top + w.exposureCamel * camels;
}

interface Sim {
  hand: Good[];
  herd: number;
  gained: number;
  market: (Card | null)[];
  tokens: Record<Good, readonly number[]>;
}

/** Applies a move to what the viewer knows; refilled market slots become null (unknown). */
export function simulate(v: PlayerView, m: Move): Sim {
  let hand = v.hand.slice();
  let herd = v.herd;
  let gained = 0;
  const market: (Card | null)[] = v.market.slice();
  let tokens: Record<Good, readonly number[]> = v.tokens;
  switch (m.kind) {
    case 'take':
      hand.push(market[m.index] as Good);
      market[m.index] = null;
      break;
    case 'camels':
      market.forEach((c, i) => {
        if (c === 'camel') {
          herd++;
          market[i] = null;
        }
      });
      break;
    case 'exchange': {
      const taken = m.take.map((i) => market[i] as Good);
      hand = removeGoods(hand, m.giveGoods)!;
      hand.push(...taken);
      herd -= m.giveCamels;
      const returned: Card[] = [...m.giveGoods, ...Array<Card>(m.giveCamels).fill('camel')];
      m.take.forEach((slot, j) => {
        market[slot] = returned[j];
      });
      break;
    }
    case 'sell':
      hand = removeUpTo(hand, m.good, m.count);
      gained = setValue(m.good, m.count, v.tokens, v.bonusCounts) || sum(v.tokens[m.good].slice(0, m.count));
      tokens = { ...v.tokens, [m.good]: v.tokens[m.good].slice(m.count) };
      break;
  }
  return { hand, herd, gained, market, tokens };
}

export function evaluateMove(v: PlayerView, m: Move, w: Weights = DEFAULT_WEIGHTS): number {
  const s = simulate(v, m);
  return (
    s.gained +
    handPotential(s.hand, s.tokens, v.bonusCounts, w) +
    camelValue(s.herd, v.opp.herd, w) -
    exposure(s.market, s.tokens, w) -
    (s.hand.length >= HAND_LIMIT ? w.fullHand : 0)
  );
}

/** One-ply greedy: the move with the best resulting position. */
export function mediumMove(v: PlayerView, w: Weights = DEFAULT_WEIGHTS): Move {
  const moves = enumerateMoves(v.hand, v.herd, v.market);
  let best = moves[0];
  let bestScore = -Infinity;
  for (const m of moves) {
    const s = evaluateMove(v, m, w);
    if (s > bestScore) {
      bestScore = s;
      best = m;
    }
  }
  return best;
}
