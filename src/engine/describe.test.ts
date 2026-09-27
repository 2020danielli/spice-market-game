import { describe, expect, it } from 'vitest';
import { describeMoveParts } from './describe';
import { newRound } from './setup';

describe('describeMoveParts', () => {
  it('breaks moves into icon-friendly parts', () => {
    const { round } = newRound(11, 0);
    round.market = ['gold', 'camel', 'camel', 'diamond', 'leather'];
    round.players[0].hand = ['cloth', 'cloth', 'cloth'];
    round.players[0].herd = 1;
    expect(describeMoveParts(round, { kind: 'take', index: 0 })).toEqual([{ t: 'text', text: 'took' }, { t: 'cards', cards: ['gold'] }]);
    expect(describeMoveParts(round, { kind: 'camels' })).toEqual([{ t: 'text', text: 'took' }, { t: 'cards', cards: ['camel', 'camel'] }]);
    expect(describeMoveParts(round, { kind: 'exchange', take: [0, 3], giveGoods: ['cloth'], giveCamels: 1 })).toEqual([
      { t: 'text', text: 'swapped' },
      { t: 'cards', cards: ['cloth', 'camel'] },
      { t: 'arrow' },
      { t: 'cards', cards: ['gold', 'diamond'] },
    ]);
    expect(describeMoveParts(round, { kind: 'sell', good: 'cloth', count: 3 })).toEqual([
      { t: 'text', text: 'sold' },
      { t: 'cards', cards: ['cloth', 'cloth', 'cloth'] },
      { t: 'points', value: 11 },
      { t: 'bonus', size: 3 },
    ]);
  });

  it('omits the bonus when its stack is empty', () => {
    const { round } = newRound(11, 0);
    round.players[0].hand = ['spice', 'spice', 'spice'];
    round.bonus[3] = [];
    expect(describeMoveParts(round, { kind: 'sell', good: 'spice', count: 3 }).some((p) => p.t === 'bonus')).toBe(false);
  });
});
