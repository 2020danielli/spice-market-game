import { describe, expect, it } from 'vitest';
import { describeMove } from './describe';
import { applyMove } from './rules';
import { newRound } from './setup';
import { playerView } from './view';

describe('playerView', () => {
  it('hides the opponent hand, deck order and bonus values', () => {
    const { round } = newRound(11, 0);
    const v = playerView(round, 0);
    expect(v.hand).toEqual(round.players[0].hand);
    expect(v.opp.handSize).toBe(round.players[1].hand.length);
    expect(v.deckSize).toBe(round.deck.length);
    expect(v.bonusCounts).toEqual({ 3: 7, 4: 6, 5: 5 });
    const json = JSON.stringify(v);
    expect(json).not.toContain('"deck"');
    expect(json).not.toContain('"bonus"');
    expect(v).not.toHaveProperty('opp.hand');
  });

  it('exposes cards the opponent was seen taking', () => {
    const { round } = newRound(11, 1);
    round.players[1].hand = [];
    round.market = ['gold', 'camel', 'camel', 'camel', 'leather'];
    const after = applyMove(round, { kind: 'take', index: 0 });
    expect(playerView(after, 0).opp.known).toEqual(['gold']);
  });
});

describe('describeMove', () => {
  it('describes each action', () => {
    const { round } = newRound(11, 0);
    round.market = ['gold', 'camel', 'camel', 'diamond', 'leather'];
    round.players[0].hand = ['cloth', 'cloth', 'cloth'];
    round.players[0].herd = 1;
    expect(describeMove(round, { kind: 'take', index: 0 }, 'You')).toBe('You took Gold.');
    expect(describeMove(round, { kind: 'camels' }, 'You')).toBe('You took 2 camels.');
    expect(describeMove(round, { kind: 'exchange', take: [0, 3], giveGoods: ['cloth'], giveCamels: 1 }, 'Bot'))
      .toBe('Bot exchanged Cloth, Camel for Gold, Diamond.');
    expect(describeMove(round, { kind: 'sell', good: 'cloth', count: 3 }, 'You')).toBe('You sold 3 Cloth for 11 rupees + a bonus token.');
    round.tokens.cloth = [1];
    expect(describeMove(round, { kind: 'sell', good: 'cloth', count: 1 }, 'You')).toBe('You sold 1 Cloth for 1 rupee.');
  });
});
