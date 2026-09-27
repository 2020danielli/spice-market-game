import { GOODS, type Card, type Good, type PlayerId, type RoundState } from './types';

const LABELS: Record<Card, [string, string]> = {
  diamond: ['Diamond', 'Diamonds'],
  gold: ['Gold', 'Gold'],
  silver: ['Silver', 'Silver'],
  cloth: ['Cloth', 'Cloth'],
  spice: ['Spice', 'Spice'],
  leather: ['Leather', 'Leather'],
  camel: ['Camel', 'Camels'],
};

export function cardName(c: Card, n = 1): string {
  return LABELS[c][n === 1 ? 0 : 1];
}

export function emptyGoodsCount(): Record<Good, number> {
  return { diamond: 0, gold: 0, silver: 0, cloth: 0, spice: 0, leather: 0 };
}

export function countGoods(cards: readonly Good[]): Record<Good, number> {
  const c = emptyGoodsCount();
  for (const g of cards) c[g]++;
  return c;
}

/** Removes each listed good once; null if any is missing. */
export function removeGoods(from: readonly Good[], goods: readonly Good[]): Good[] | null {
  const out = from.slice();
  for (const g of goods) {
    const i = out.indexOf(g);
    if (i < 0) return null;
    out.splice(i, 1);
  }
  return out;
}

/** Removes up to n copies of good. */
export function removeUpTo(from: readonly Good[], good: Good, n: number): Good[] {
  const out: Good[] = [];
  let left = n;
  for (const g of from) {
    if (g === good && left > 0) {
      left--;
      continue;
    }
    out.push(g);
  }
  return out;
}

export const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);

export function other(p: PlayerId): PlayerId {
  return p === 0 ? 1 : 0;
}

/** Tallies every card's location; equals DECK_COMPOSITION in any valid state. */
export function cardCounts(r: RoundState): Record<Card, number> {
  const c: Record<Card, number> = { ...emptyGoodsCount(), camel: 0 };
  for (const x of r.deck) c[x]++;
  for (const x of r.market) c[x]++;
  for (const p of r.players) {
    for (const g of p.hand) c[g]++;
    c.camel += p.herd;
  }
  for (const g of GOODS) c[g] += r.discard[g];
  return c;
}
