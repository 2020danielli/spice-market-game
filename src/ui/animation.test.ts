import { describe, expect, it } from 'vitest';
import { applyMove, newRound, type Card, type Good, type Move, type RoundState } from '../engine';
import { planMoveAnimation, resolveSources, stageDuration } from './animation';
import type { HandSlot } from './handDisplay';

function mk(hand: Good[], market: Card[], deck: Card[] = ['leather', 'spice', 'cloth'], herd = 0): RoundState {
  const r = newRound(5, 0).round;
  r.players[0].hand = hand;
  r.players[0].herd = herd;
  r.market = market;
  r.deck = deck;
  return r;
}
const plan = (r: RoundState, move: Move, handSlots: HandSlot[] = [], chosenKeys?: string[]) =>
  planMoveAnimation({ before: r, after: applyMove(r, move), move, handSlots, chosenKeys });

describe('planMoveAnimation', () => {
  it('take: the market card flies to the hand, then the deck refills the slot', () => {
    const a = plan(mk([], ['gold', 'camel', 'camel', 'camel', 'silver']), { kind: 'take', index: 0 });
    expect(a.flights).toMatchObject([{ from: 'market-0', to: 'handtail-0', visual: { kind: 'card', card: 'gold' } }]);
    expect(a.hidden).toEqual(['market-0']);
    expect(a.refill).toMatchObject([{ from: 'deck', to: 'market-0', visual: { kind: 'card', card: 'cloth' } }]);
    expect(a.refillHidden).toEqual(['market-0']);
    expect(a.highlight.market).toEqual([0]);
    expect(a.caption[0]).toEqual({ t: 'text', text: 'took' });
  });

  it('camels: every camel flies to the herd and each slot refills', () => {
    const a = plan(mk([], ['camel', 'gold', 'camel', 'camel', 'silver']), { kind: 'camels' });
    expect(a.flights.map((f) => [f.from, f.to])).toEqual([
      ['market-0', 'herd-0'],
      ['market-2', 'herd-0'],
      ['market-3', 'herd-0'],
    ]);
    expect(a.refill.map((f) => f.to)).toEqual(['market-0', 'market-2', 'market-3']);
  });

  it('exchange: both directions fly at once, from the chosen hand cards and the herd', () => {
    const r = mk(['cloth', 'spice'], ['gold', 'camel', 'diamond', 'camel', 'leather'], undefined, 1);
    const slots: HandSlot[] = [{ key: 'c1', card: 'cloth' }, { key: 'c2', card: 'spice' }];
    const a = plan(r, { kind: 'exchange', take: [0, 2], giveGoods: ['spice'], giveCamels: 1 }, slots, ['c2']);
    expect(a.flights.map((f) => [f.from, f.to, f.visual])).toEqual([
      ['market-0', 'handtail-0', { kind: 'card', card: 'gold' }],
      ['hand-0-c2', 'market-0', { kind: 'card', card: 'spice' }],
      ['market-2', 'handtail-0', { kind: 'card', card: 'diamond' }],
      ['herd-0', 'market-2', { kind: 'card', card: 'camel' }],
    ]);
    expect(a.hidden).toEqual(['market-0', 'market-2', 'hand-0-c2']);
    expect(a.refill).toEqual([]);
    expect(a.highlight).toEqual({ market: [0, 2], handKeys: ['c2'], camels: 1 });
  });

  it('sell: cards cash in, coins and a bonus fly to the earnings, with a popup', () => {
    const r = mk(['cloth', 'cloth', 'cloth', 'gold'], ['gold', 'camel', 'camel', 'camel', 'silver']);
    const slots: HandSlot[] = [
      { key: 'c1', card: 'cloth' }, { key: 'c2', card: 'cloth' }, { key: 'c3', card: 'cloth' }, { key: 'c4', card: 'gold' },
    ];
    const a = plan(r, { kind: 'sell', good: 'cloth', count: 3 }, slots);
    expect(a.flights.filter((f) => f.visual.kind === 'card').map((f) => [f.from, f.to, f.fade])).toEqual([
      ['hand-0-c1', 'tokens-cloth', true],
      ['hand-0-c2', 'tokens-cloth', true],
      ['hand-0-c3', 'tokens-cloth', true],
    ]);
    expect(
      a.flights.filter((f) => f.visual.kind === 'coin').map((f) => [f.from, f.to, (f.visual as { value: number }).value]),
    ).toEqual([
      ['token-cloth-0', 'earned-0', 5],
      ['token-cloth-1', 'earned-0', 3],
      ['token-cloth-2', 'earned-0', 3],
    ]);
    expect(a.flights.filter((f) => f.visual.kind === 'bonus')).toMatchObject([{ from: 'bonus-3', to: 'earned-0' }]);
    expect(a.popups).toMatchObject([{ anchor: 'earned-0', text: '+11 + bonus' }]);
    expect(a.hidden).toEqual(expect.arrayContaining(['hand-0-c1', 'token-cloth-0', 'token-cloth-2']));
  });

  it('sell with a short token pile and an empty bonus stack', () => {
    const r = mk(['spice', 'spice', 'spice'], ['gold', 'camel', 'camel', 'camel', 'silver']);
    r.tokens.spice = [1];
    r.bonus[3] = [];
    const a = plan(r, { kind: 'sell', good: 'spice', count: 3 });
    expect(a.flights.filter((f) => f.visual.kind === 'coin')).toHaveLength(1);
    expect(a.flights.filter((f) => f.visual.kind === 'bonus')).toHaveLength(0);
    expect(a.popups[0].text).toBe('+1');
  });

  it('skips the refill when the deck runs dry and the market shrinks', () => {
    const a = plan(mk([], ['camel', 'camel', 'camel', 'gold', 'silver'], ['leather']), { kind: 'camels' });
    expect(a.refill).toEqual([]);
  });

  it('stageDuration covers the last flight and popup', () => {
    expect(stageDuration([{ id: 'a', from: '', to: '', visual: { kind: 'bonus', size: 3 }, delay: 100, duration: 500, fade: false }])).toBe(600);
    expect(stageDuration([], [{ anchor: 'x', text: '+1', delay: 200 }])).toBe(900);
  });
});

describe('resolveSources', () => {
  const slots: HandSlot[] = [
    { key: 'k-gold-0', card: 'gold', known: true },
    { key: 'back-0', card: 'back' },
    { key: 'back-1', card: 'back' },
  ];
  it('prefers a face-up card of that good, then face-down cards from the right', () => {
    expect(resolveSources(slots, ['gold', 'leather', 'spice'])).toEqual(['k-gold-0', 'back-1', 'back-0']);
  });
  it('uses the chosen slots when given', () => {
    expect(resolveSources([{ key: 'c1', card: 'cloth' }, { key: 'c2', card: 'cloth' }], ['cloth'], ['c2'])).toEqual(['c2']);
  });
  it('returns null when no slot can supply the card', () => {
    expect(resolveSources([], ['gold'])).toEqual([null]);
  });
});
