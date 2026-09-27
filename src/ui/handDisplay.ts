import { GOODS, type Good, type PlayerId, type RoundState } from '../engine';

export interface HandSlot {
  key: string;
  card: Good | 'back';
  /** A face-up card in an opponent's hand that you saw them take. */
  known?: boolean;
}

export function sortHand(hand: readonly Good[]): Good[] {
  return hand.slice().sort((a, b) => GOODS.indexOf(a) - GOODS.indexOf(b));
}

/**
 * Render keys for a hand. Face-up cards are keyed by good + ordinal so each animates with its card;
 * face-down cards are keyed by position only, so enter/exit animations can't reveal the hidden hand.
 */
export function handDisplay(sortedHand: readonly Good[], faceUp: boolean): HandSlot[] {
  if (!faceUp) return sortedHand.map((_, i) => ({ key: `back-${i}`, card: 'back' }));
  const ordinals = new Map<Good, number>();
  return sortedHand.map((g) => {
    const k = ordinals.get(g) ?? 0;
    ordinals.set(g, k + 1);
    return { key: `${g}-${k}`, card: g };
  });
}

/** An opponent's hand: cards you saw them take are face-up (if enabled); the rest are backs keyed by position. */
export function opponentHandDisplay(hand: readonly Good[], known: readonly Good[], showKnown: boolean): HandSlot[] {
  const face = showKnown ? sortHand(known) : [];
  const ordinals = new Map<Good, number>();
  const slots: HandSlot[] = face.map((g) => {
    const k = ordinals.get(g) ?? 0;
    ordinals.set(g, k + 1);
    return { key: `k-${g}-${k}`, card: g, known: true };
  });
  for (let i = 0; i < hand.length - face.length; i++) slots.push({ key: `back-${i}`, card: 'back' });
  return slots;
}

/** Display slots for a seat that isn't the local human's arranged hand. */
export function seatHandSlots(r: RoundState, p: PlayerId, faceUp: boolean, showKnown: boolean): HandSlot[] {
  const pl = r.players[p];
  return faceUp ? handDisplay(sortHand(pl.hand), true) : opponentHandDisplay(pl.hand, pl.known, showKnown);
}
