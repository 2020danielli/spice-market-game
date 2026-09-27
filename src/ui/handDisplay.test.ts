import { describe, expect, it } from 'vitest';
import { handDisplay, opponentHandDisplay } from './handDisplay';

describe('handDisplay', () => {
  it('keys face-up cards by good and ordinal so they animate with their card', () => {
    expect(handDisplay(['gold', 'leather', 'leather'], true)).toEqual([
      { key: 'gold-0', card: 'gold' },
      { key: 'leather-0', card: 'leather' },
      { key: 'leather-1', card: 'leather' },
    ]);
  });

  it('reveals nothing about a face-down hand: keys depend only on hand size', () => {
    const a = handDisplay(['diamond', 'diamond', 'leather'], false);
    const b = handDisplay(['cloth', 'spice', 'spice'], false);
    expect(a).toEqual(b);
    expect(a).toEqual([
      { key: 'back-0', card: 'back' },
      { key: 'back-1', card: 'back' },
      { key: 'back-2', card: 'back' },
    ]);
  });
});

describe('opponentHandDisplay', () => {
  it('shows seen cards face-up and keys unknown cards by position only (Review Focus 3)', () => {
    expect(opponentHandDisplay(['leather', 'gold', 'spice'], ['gold'], true)).toEqual([
      { key: 'k-gold-0', card: 'gold', known: true },
      { key: 'back-0', card: 'back' },
      { key: 'back-1', card: 'back' },
    ]);
    expect(opponentHandDisplay(['diamond', 'gold', 'diamond'], ['gold'], true)).toEqual(
      opponentHandDisplay(['leather', 'gold', 'spice'], ['gold'], true),
    );
  });

  it('hides everything when the aid is off', () => {
    expect(opponentHandDisplay(['gold', 'spice'], ['gold'], false).every((s) => s.card === 'back')).toBe(true);
  });
});
