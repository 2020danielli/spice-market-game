import { describe, expect, it } from 'vitest';
import { applyMove, checkMove, legalMoves } from './rules';
import { newRound } from './setup';
import type { Card, Good, RoundState } from './types';

function mk(o: { hand?: Good[]; herd?: number; market?: Card[]; deck?: Card[]; oppHand?: Good[]; oppHerd?: number }): RoundState {
  const { round } = newRound(1, 0);
  round.players[0].hand = o.hand ?? [];
  round.players[0].herd = o.herd ?? 0;
  round.players[1].hand = o.oppHand ?? [];
  round.players[1].herd = o.oppHerd ?? 0;
  if (o.market) round.market = o.market;
  if (o.deck) round.deck = o.deck;
  return round;
}

describe('take one good', () => {
  it('moves the card to hand, refills the same slot from the deck top, passes the turn', () => {
    const r = mk({ hand: ['leather'], market: ['gold', 'camel', 'spice', 'cloth', 'silver'], deck: ['leather', 'diamond'] });
    const n = applyMove(r, { kind: 'take', index: 0 });
    expect(n.players[0].hand).toEqual(['leather', 'gold']);
    expect(n.players[0].known).toEqual(['gold']);
    expect(n.market).toEqual(['diamond', 'camel', 'spice', 'cloth', 'silver']);
    expect(n.deck).toEqual(['leather']);
    expect(n.current).toBe(1);
    expect(r.players[0].hand).toEqual(['leather']); // immutability
  });

  it('refuses at 7 cards and refuses camels', () => {
    const full: Good[] = ['leather', 'leather', 'cloth', 'cloth', 'spice', 'spice', 'gold'];
    const r = mk({ hand: full, market: ['gold', 'camel', 'spice', 'cloth', 'silver'] });
    expect(checkMove(r, { kind: 'take', index: 0 })).toMatch(/hand is full/);
    const r2 = mk({ hand: [], market: ['gold', 'camel', 'spice', 'cloth', 'silver'] });
    expect(checkMove(r2, { kind: 'take', index: 1 })).toMatch(/Camels/);
  });
});

describe('take camels', () => {
  it('takes every camel, even with a full hand', () => {
    const full: Good[] = ['leather', 'leather', 'cloth', 'cloth', 'spice', 'spice', 'gold'];
    const r = mk({ hand: full, herd: 1, market: ['camel', 'gold', 'camel', 'camel', 'silver'], deck: ['cloth', 'spice', 'leather', 'gold'] });
    const n = applyMove(r, { kind: 'camels' });
    expect(n.players[0].herd).toBe(4);
    expect(n.market).toEqual(['gold', 'gold', 'leather', 'spice', 'silver']);
    expect(n.ended).toBe(false);
  });

  it('rejects when there are no camels', () => {
    const r = mk({ market: ['gold', 'gold', 'leather', 'spice', 'silver'] });
    expect(checkMove(r, { kind: 'camels' })).toMatch(/no camels/);
  });

  it('ends the round when the deck runs out mid-refill (Review Focus 2)', () => {
    const r = mk({ market: ['camel', 'camel', 'camel', 'gold', 'silver'], deck: ['leather'] });
    const n = applyMove(r, { kind: 'camels' });
    expect(n.ended).toBe(true);
    expect(n.market.length).toBe(3);
    expect(n.market).toContain('leather');
  });
});

describe('exchange', () => {
  const market: Card[] = ['gold', 'diamond', 'camel', 'leather', 'spice'];

  it('swaps hand goods and camels into the taken slots', () => {
    const r = mk({ hand: ['cloth', 'leather'], herd: 2, market });
    const n = applyMove(r, { kind: 'exchange', take: [0, 1], giveGoods: ['cloth'], giveCamels: 1 });
    expect(n.players[0].hand.slice().sort()).toEqual(['diamond', 'gold', 'leather']);
    expect(n.players[0].herd).toBe(1);
    expect(n.market).toEqual(['cloth', 'camel', 'camel', 'leather', 'spice']);
    expect(n.deck).toEqual(r.deck);
  });

  it('enforces the exchange rules', () => {
    const r = mk({ hand: ['cloth', 'leather', 'spice'], herd: 1, market });
    expect(checkMove(r, { kind: 'exchange', take: [0], giveGoods: ['cloth'], giveCamels: 0 })).toMatch(/at least 2/);
    expect(checkMove(r, { kind: 'exchange', take: [0, 2], giveGoods: ['cloth', 'spice'], giveCamels: 0 })).toMatch(/camels/);
    expect(checkMove(r, { kind: 'exchange', take: [0, 3], giveGoods: ['leather', 'cloth'], giveCamels: 0 })).toMatch(/same type/);
    expect(checkMove(r, { kind: 'exchange', take: [0, 1], giveGoods: ['cloth'], giveCamels: 0 })).toMatch(/exactly 2/);
    expect(checkMove(r, { kind: 'exchange', take: [0, 1], giveGoods: [], giveCamels: 2 })).toMatch(/camels/);
    expect(checkMove(r, { kind: 'exchange', take: [0, 1], giveGoods: ['gold', 'cloth'], giveCamels: 0 })).toMatch(/do not have/);
  });

  it('enforces the hand limit when giving camels', () => {
    const six: Good[] = ['cloth', 'cloth', 'cloth', 'leather', 'leather', 'leather'];
    const r = mk({ hand: six, herd: 2, market });
    expect(checkMove(r, { kind: 'exchange', take: [0, 1], giveGoods: [], giveCamels: 2 })).toMatch(/more than 7/);
    expect(checkMove(r, { kind: 'exchange', take: [0, 1], giveGoods: ['cloth'], giveCamels: 1 })).toBeNull();
  });
});

describe('sell', () => {
  it('takes top tokens, a bonus for 3+, and records the discard', () => {
    const r = mk({ hand: ['leather', 'leather', 'leather', 'leather', 'gold'] });
    r.bonus[4] = [5, 6, 4];
    const n = applyMove(r, { kind: 'sell', good: 'leather', count: 4 });
    expect(n.players[0].goodsTokens).toEqual([4, 3, 2, 1]);
    expect(n.players[0].soldGoods).toEqual(['leather', 'leather', 'leather', 'leather']);
    expect(n.players[0].bonusTokens).toEqual([{ size: 4, value: 5 }]);
    expect(n.tokens.leather).toEqual([1, 1, 1, 1, 1]);
    expect(n.players[0].hand).toEqual(['gold']);
    expect(n.discard.leather).toBe(4);
  });

  it('uses the 5-stack for 6 cards', () => {
    const r = mk({ hand: Array<Good>(6).fill('cloth') });
    const n = applyMove(r, { kind: 'sell', good: 'cloth', count: 6 });
    expect(n.players[0].bonusTokens[0].size).toBe(5);
    expect(n.players[0].goodsTokens).toEqual([5, 3, 3, 2, 2, 1]);
  });

  it('requires 2+ precious goods', () => {
    const r = mk({ hand: ['diamond', 'gold', 'gold'] });
    expect(checkMove(r, { kind: 'sell', good: 'diamond', count: 1 })).toMatch(/at least 2/);
    expect(checkMove(r, { kind: 'sell', good: 'gold', count: 2 })).toBeNull();
    expect(checkMove(r, { kind: 'sell', good: 'gold', count: 3 })).toMatch(/only have 2/);
  });

  it('allows selling into an empty token stack (Review Focus 3)', () => {
    const r = mk({ hand: ['spice', 'spice', 'spice'] });
    r.tokens.spice = [];
    const n = applyMove(r, { kind: 'sell', good: 'spice', count: 3 });
    expect(n.players[0].goodsTokens).toEqual([]);
    expect(n.players[0].bonusTokens).toHaveLength(1);
  });

  it('gives no bonus when the bonus stack is exhausted (Review Focus 5)', () => {
    const r = mk({ hand: ['spice', 'spice', 'spice'] });
    r.bonus[3] = [];
    const n = applyMove(r, { kind: 'sell', good: 'spice', count: 3 });
    expect(n.players[0].bonusTokens).toEqual([]);
    expect(n.players[0].goodsTokens).toEqual([5, 3, 3]);
  });

  it('ends the round when a third token stack empties', () => {
    const r = mk({ hand: ['leather'] });
    r.tokens.diamond = [];
    r.tokens.gold = [];
    r.tokens.leather = [1];
    const n = applyMove(r, { kind: 'sell', good: 'leather', count: 1 });
    expect(n.ended).toBe(true);
  });

  it('updates public knowledge of the seller hand', () => {
    const r = mk({ hand: ['cloth', 'cloth'] });
    r.players[0].known = ['cloth'];
    const n = applyMove(r, { kind: 'sell', good: 'cloth', count: 1 });
    expect(n.players[0].known).toEqual([]);
  });
});

describe('legalMoves', () => {
  it('only produces legal moves, dedupes takes by type, and has exchanges', () => {
    const r = mk({ hand: ['cloth', 'leather', 'diamond'], herd: 2, market: ['gold', 'gold', 'camel', 'leather', 'spice'] });
    const moves = legalMoves(r);
    for (const m of moves) expect(checkMove(r, m)).toBeNull();
    expect(moves.filter((m) => m.kind === 'take')).toHaveLength(3);
    expect(moves.some((m) => m.kind === 'exchange')).toBe(true);
    expect(moves.some((m) => m.kind === 'sell' && m.good === 'diamond')).toBe(false);
  });

  it('never offers take with a full hand', () => {
    const full: Good[] = ['leather', 'leather', 'cloth', 'cloth', 'spice', 'spice', 'gold'];
    const r = mk({ hand: full, market: ['gold', 'gold', 'camel', 'leather', 'spice'] });
    expect(legalMoves(r).some((m) => m.kind === 'take')).toBe(false);
  });
});
