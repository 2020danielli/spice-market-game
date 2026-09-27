import { describe, expect, it } from 'vitest';
import { legalMoves, newRound, type Card, type Good, type RoundState } from '../engine';
import type { HandCard } from './hand';
import { interpretSelection, isCamelSelected, selectionForMove, toggleCamel } from './selection';

function mk(hand: Good[], market: Card[], herd = 0): { r: RoundState; cards: HandCard[] } {
  const r = newRound(2, 0).round;
  r.players[0].hand = hand;
  r.players[0].herd = herd;
  r.market = market;
  return { r, cards: hand.map((good, i) => ({ id: i + 1, good })) };
}
const market: Card[] = ['gold', 'camel', 'diamond', 'camel', 'leather'];
const sel = (m: number[], h: number[] = [], camels = 0) => ({ market: m, hand: h, camels });

describe('interpretSelection', () => {
  it('returns null for an empty selection', () => {
    const { r, cards } = mk(['cloth'], market);
    expect(interpretSelection(r, 0, sel([]), cards)).toBeNull();
  });

  it('takes a single good', () => {
    const { r, cards } = mk(['cloth'], market);
    expect(interpretSelection(r, 0, sel([0]), cards)).toMatchObject({
      kind: 'take', move: { kind: 'take', index: 0 }, cta: 'Take Gold', get: ['gold'], error: null,
    });
  });

  it('takes all camels, but not mixed with other cards', () => {
    const { r, cards } = mk(['cloth'], market);
    expect(interpretSelection(r, 0, sel([1, 3]), cards)).toMatchObject({ kind: 'camels', move: { kind: 'camels' }, cta: 'Take 2 camels' });
    const mixed = interpretSelection(r, 0, sel([0, 1, 3]), cards)!;
    expect(mixed.move).toBeNull();
    expect(mixed.error).toMatch(/on their own/);
  });

  it('sells one type with a points preview', () => {
    const { r, cards } = mk(['cloth', 'cloth', 'cloth', 'leather'], market);
    expect(interpretSelection(r, 0, sel([], [1, 2, 3]), cards)).toMatchObject({
      kind: 'sell', move: { kind: 'sell', good: 'cloth', count: 3 }, points: 11, bonus: true, cta: 'Sell 3 Cloth',
      give: ['cloth', 'cloth', 'cloth'],
    });
  });

  it('explains an illegal sale', () => {
    const { r, cards } = mk(['diamond', 'cloth'], market);
    const i = interpretSelection(r, 0, sel([], [1]), cards)!;
    expect(i.move).toBeNull();
    expect(i.error).toMatch(/at least 2/);
  });

  it('treats mixed hand types as an exchange in progress, not an error', () => {
    const { r, cards } = mk(['cloth', 'leather'], market);
    const i = interpretSelection(r, 0, sel([], [1, 2]), cards)!;
    expect(i).toMatchObject({ kind: 'exchange', move: null, error: null, cta: 'Pick cards to take' });
    expect(i.hint).toMatch(/one type/);
  });

  it('guides an exchange until the counts match', () => {
    const { r, cards } = mk(['cloth', 'spice'], market, 2);
    expect(interpretSelection(r, 0, sel([0, 2]), cards)).toMatchObject({ kind: 'exchange', move: null, cta: 'Pick 2 more to give', error: null });
    expect(interpretSelection(r, 0, sel([0, 2], [1]), cards)).toMatchObject({ cta: 'Pick 1 more to give' });
    expect(interpretSelection(r, 0, sel([0, 2], [1], 1), cards)).toMatchObject({
      move: { kind: 'exchange', take: [0, 2], giveGoods: ['cloth'], giveCamels: 1 },
      cta: 'Exchange 2 for 2', give: ['cloth', 'camel'], get: ['gold', 'diamond'], error: null,
    });
    expect(interpretSelection(r, 0, sel([0, 2], [1, 2], 1), cards)).toMatchObject({ move: null, cta: 'Counts must match' });
  });

  it('reports rule violations in a complete exchange', () => {
    const { r, cards } = mk(['leather', 'cloth'], market);
    const i = interpretSelection(r, 0, sel([0, 4], [1, 2]), cards)!;
    expect(i.move).toBeNull();
    expect(i.error).toMatch(/same type/);
  });

  it('refuses when it is not your turn', () => {
    const { r, cards } = mk(['cloth'], market);
    r.current = 1;
    expect(interpretSelection(r, 0, sel([0]), cards)).toMatchObject({ move: null, error: 'Wait for your turn.' });
  });
});

describe('selectionForMove', () => {
  it('round-trips every legal move through the selection UI', () => {
    const { r, cards } = mk(['cloth', 'cloth', 'leather', 'spice'], ['gold', 'camel', 'diamond', 'camel', 'leather'], 2);
    for (const m of legalMoves(r)) {
      const i = interpretSelection(r, 0, selectionForMove(m, r, cards), cards)!;
      expect(i.move).toEqual(m);
    }
  });
});

describe('herd camel selection', () => {
  it('selects the top of the stack first, one camel per click', () => {
    // herd of 4: indices 0..3, index 0 is the top (leftmost, fully visible) card
    expect([0, 1, 2, 3].map((i) => isCamelSelected(4, 1, i))).toEqual([true, false, false, false]);
    expect([0, 1, 2, 3].map((i) => isCamelSelected(4, 2, i))).toEqual([true, true, false, false]);
    expect(toggleCamel(4, 0, 0)).toBe(1);
    expect(toggleCamel(4, 1, 3)).toBe(2);
    expect(toggleCamel(4, 2, 2)).toBe(3);
  });

  it('clicking a selected camel removes one', () => {
    expect(toggleCamel(4, 2, 0)).toBe(1);
    expect(toggleCamel(4, 1, 0)).toBe(0);
  });

  it('never exceeds the herd or goes below zero', () => {
    expect(toggleCamel(2, 2, 1)).toBe(1);
    expect(toggleCamel(0, 0, 0)).toBe(0);
  });
});
