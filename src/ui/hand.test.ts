import { describe, expect, it } from 'vitest';
import { reconcileHand, sortHandCards, type HandCard } from './hand';

const counter = () => {
  let n = 100;
  return () => n++;
};
const prev: HandCard[] = [
  { id: 1, good: 'leather' },
  { id: 2, good: 'gold' },
  { id: 3, good: 'leather' },
];

describe('reconcileHand', () => {
  it('creates cards for a fresh hand', () => {
    expect(reconcileHand([], ['gold', 'leather'], counter())).toEqual([
      { id: 100, good: 'gold' },
      { id: 101, good: 'leather' },
    ]);
  });

  it('keeps the arrangement, removes the chosen cards, appends new ones on the right', () => {
    expect(reconcileHand(prev, ['gold', 'leather', 'diamond'], counter(), [1])).toEqual([
      { id: 2, good: 'gold' },
      { id: 3, good: 'leather' },
      { id: 100, good: 'diamond' },
    ]);
  });

  it('drops from the right when no ids are given', () => {
    expect(reconcileHand(prev, ['leather', 'gold'], counter())).toEqual([
      { id: 1, good: 'leather' },
      { id: 2, good: 'gold' },
    ]);
  });

  it('is a no-op when nothing changed', () => {
    expect(reconcileHand(prev, ['gold', 'leather', 'leather'], counter())).toEqual(prev);
  });
});

describe('sortHandCards', () => {
  it('orders by good, stable within a good', () => {
    expect(sortHandCards(prev).map((c) => c.id)).toEqual([2, 1, 3]);
  });
});
