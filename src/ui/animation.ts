import {
  describeMoveParts,
  type BonusSize, type Card, type Good, type Move, type MovePart, type PlayerId, type RoundState,
} from '../engine';
import type { HandSlot } from './handDisplay';

export type Visual =
  | { kind: 'card'; card: Card | 'back' }
  | { kind: 'coin'; good: Good; value: number }
  | { kind: 'bonus'; size: BonusSize };

export interface Flight {
  id: string;
  from: string;
  to: string;
  visual: Visual;
  delay: number;
  duration: number;
  /** Shrink and fade on arrival (sold cards). */
  fade: boolean;
}

export interface Popup {
  anchor: string;
  text: string;
  delay: number;
}

export interface MoveAnimation {
  mover: PlayerId;
  caption: MovePart[];
  /** What the mover "points at" before a bot move plays. */
  highlight: { market: number[]; handKeys: string[]; camels: number };
  /** Played on the pre-move table; `hidden` anchors vanish while their copies fly. */
  flights: Flight[];
  hidden: string[];
  popups: Popup[];
  /** Played after the move commits: deck → refilled slots, which stay hidden until their card lands. */
  refill: Flight[];
  refillHidden: string[];
}

export const FLY_MS = 600;
export const STAGGER_MS = 80;
export const REFILL_MS = 420;
const POPUP_MS = 700;

export const anchors = {
  deck: 'deck',
  market: (i: number) => `market-${i}`,
  hand: (p: PlayerId, key: string) => `hand-${p}-${key}`,
  handTail: (p: PlayerId) => `handtail-${p}`,
  herd: (p: PlayerId) => `herd-${p}`,
  tokens: (g: Good) => `tokens-${g}`,
  token: (g: Good, i: number) => `token-${g}-${i}`,
  bonus: (s: BonusSize) => `bonus-${s}`,
  earned: (p: PlayerId) => `earned-${p}`,
};

/** Which displayed hand slots the given goods leave from: chosen slots first, then face-up slots of that good, then face-down slots from the right. */
export function resolveSources(slots: readonly HandSlot[], goods: readonly Good[], chosenKeys?: readonly string[]): (string | null)[] {
  const used = new Set<string>();
  const pool = chosenKeys ? slots.filter((s) => chosenKeys.includes(s.key)) : slots;
  return goods.map((g) => {
    const slot =
      pool.find((s) => !used.has(s.key) && s.card === g) ??
      [...slots].reverse().find((s) => !used.has(s.key) && s.card === 'back');
    if (!slot) return null;
    used.add(slot.key);
    return slot.key;
  });
}

export interface PlanInput {
  before: RoundState;
  after: RoundState;
  move: Move;
  /** The mover's hand exactly as displayed. */
  handSlots: readonly HandSlot[];
  /** Slot keys the mover picked (the human's selection). */
  chosenKeys?: readonly string[];
}

export function planMoveAnimation({ before, after, move, handSlots, chosenKeys }: PlanInput): MoveAnimation {
  const p = before.current;
  const flights: Flight[] = [];
  const hidden: string[] = [];
  const popups: Popup[] = [];
  const highlight = { market: [] as number[], handKeys: [] as string[], camels: 0 };
  let refillSlots: number[] = [];
  let n = 0;
  const fly = (from: string, to: string, visual: Visual, delay: number, fade = false) =>
    flights.push({ id: `f${n++}`, from, to, visual, delay, duration: FLY_MS, fade });
  const handAnchor = (key: string | null) => (key ? anchors.hand(p, key) : anchors.handTail(p));
  const present = (keys: (string | null)[]) => keys.filter((k): k is string => k !== null);

  switch (move.kind) {
    case 'take': {
      fly(anchors.market(move.index), anchors.handTail(p), { kind: 'card', card: before.market[move.index] }, 0);
      hidden.push(anchors.market(move.index));
      highlight.market = [move.index];
      refillSlots = [move.index];
      break;
    }
    case 'camels': {
      const slots = before.market.flatMap((c, i) => (c === 'camel' ? [i] : []));
      slots.forEach((i, j) => fly(anchors.market(i), anchors.herd(p), { kind: 'card', card: 'camel' }, j * STAGGER_MS));
      hidden.push(...slots.map(anchors.market));
      highlight.market = slots;
      refillSlots = slots;
      break;
    }
    case 'exchange': {
      const sources = resolveSources(handSlots, move.giveGoods, chosenKeys);
      const returned: Card[] = [...move.giveGoods, ...Array<Card>(move.giveCamels).fill('camel')];
      move.take.forEach((slot, j) => {
        fly(anchors.market(slot), anchors.handTail(p), { kind: 'card', card: before.market[slot] }, j * STAGGER_MS);
        const from = j < move.giveGoods.length ? handAnchor(sources[j]) : anchors.herd(p);
        fly(from, anchors.market(slot), { kind: 'card', card: returned[j] }, j * STAGGER_MS);
      });
      hidden.push(...move.take.map(anchors.market), ...present(sources).map((k) => anchors.hand(p, k)));
      highlight.market = move.take.slice();
      highlight.handKeys = present(sources);
      highlight.camels = move.giveCamels;
      break;
    }
    case 'sell': {
      const sources = resolveSources(handSlots, Array<Good>(move.count).fill(move.good), chosenKeys);
      sources.forEach((k, j) => fly(handAnchor(k), anchors.tokens(move.good), { kind: 'card', card: move.good }, j * STAGGER_MS, true));
      hidden.push(...present(sources).map((k) => anchors.hand(p, k)));
      highlight.handKeys = present(sources);
      const coinStart = FLY_MS * 0.6 + move.count * STAGGER_MS;
      const got = before.tokens[move.good].slice(0, move.count);
      got.forEach((value, i) => {
        fly(anchors.token(move.good, i), anchors.earned(p), { kind: 'coin', good: move.good, value }, coinStart + i * STAGGER_MS);
        hidden.push(anchors.token(move.good, i));
      });
      const size = Math.min(move.count, 5) as BonusSize;
      const bonus = move.count >= 3 && before.bonus[size].length > 0;
      if (bonus) fly(anchors.bonus(size), anchors.earned(p), { kind: 'bonus', size }, coinStart + got.length * STAGGER_MS);
      const pts = got.reduce((a, b) => a + b, 0);
      popups.push({ anchor: anchors.earned(p), text: `+${pts}${bonus ? ' + bonus' : ''}`, delay: coinStart + FLY_MS * 0.5 });
      break;
    }
  }

  // A failed refill shrinks the market and ends the round — no deck animation then.
  const refill: Flight[] =
    after.market.length === before.market.length
      ? refillSlots.map((i, j) => ({
          id: `r${j}`, from: anchors.deck, to: anchors.market(i), visual: { kind: 'card', card: after.market[i] },
          delay: j * STAGGER_MS, duration: REFILL_MS, fade: false,
        }))
      : [];

  return {
    mover: p, caption: describeMoveParts(before, move), highlight, flights, hidden, popups,
    refill, refillHidden: refill.map((f) => f.to),
  };
}

export function stageDuration(flights: readonly Flight[], popups: readonly Popup[] = []): number {
  let end = 0;
  for (const f of flights) end = Math.max(end, f.delay + f.duration);
  for (const p of popups) end = Math.max(end, p.delay + POPUP_MS);
  return end;
}
