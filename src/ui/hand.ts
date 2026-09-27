import { useRef, useState } from 'react';
import { countGoods, emptyGoodsCount, GOODS, type Good } from '../engine';

export interface HandCard {
  id: number;
  good: Good;
}

/**
 * Carries the player's arrangement across a hand change: surviving cards keep their places, cards that left are
 * removed (the chosen ids first, otherwise from the right), and new cards are appended on the right.
 */
export function reconcileHand(prev: readonly HandCard[], hand: readonly Good[], nextId: () => number, removedIds: readonly number[] = []): HandCard[] {
  const need = countGoods(hand);
  const have = countGoods(prev.map((c) => c.good));
  const drop = emptyGoodsCount();
  for (const g of GOODS) drop[g] = Math.max(0, have[g] - need[g]);
  const removed = new Set<number>();
  for (const id of removedIds) {
    const c = prev.find((x) => x.id === id);
    if (c && drop[c.good] > 0) {
      removed.add(id);
      drop[c.good]--;
    }
  }
  for (let i = prev.length - 1; i >= 0; i--) {
    const c = prev[i];
    if (!removed.has(c.id) && drop[c.good] > 0) {
      removed.add(c.id);
      drop[c.good]--;
    }
  }
  const kept = prev.filter((c) => !removed.has(c.id));
  const keptCount = countGoods(kept.map((c) => c.good));
  const added: HandCard[] = [];
  for (const g of GOODS) for (let k = keptCount[g]; k < need[g]; k++) added.push({ id: nextId(), good: g });
  return [...kept, ...added];
}

export function sortHandCards(cards: readonly HandCard[]): HandCard[] {
  return cards.slice().sort((a, b) => GOODS.indexOf(a.good) - GOODS.indexOf(b.good));
}

/** The human's hand in the order they arranged it; reconciled synchronously whenever the engine hand changes. */
export function useHandOrder(hand: readonly Good[]) {
  const nextId = useRef(1);
  const pendingRemoved = useRef<number[]>([]);
  const [state, setState] = useState(() => ({ hand, cards: reconcileHand([], hand, () => nextId.current++) }));
  let cards = state.cards;
  if (state.hand !== hand) {
    cards = reconcileHand(state.cards, hand, () => nextId.current++, pendingRemoved.current);
    pendingRemoved.current = [];
    setState({ hand, cards });
  }
  return {
    cards,
    setCards: (next: HandCard[]) => setState((s) => ({ ...s, cards: next })),
    sort: () => setState((s) => ({ ...s, cards: sortHandCards(s.cards) })),
    /** Call just before the move commits so the exact cards the player picked are the ones removed. */
    markRemoved: (ids: readonly number[]) => {
      pendingRemoved.current = ids.slice();
    },
  };
}
