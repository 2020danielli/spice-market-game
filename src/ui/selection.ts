import {
  cardName, checkMove, sum,
  type BonusSize, type Card, type Good, type Move, type PlayerId, type RoundState,
} from '../engine';
import type { HandCard } from './hand';

export interface Selection {
  market: number[];
  /** HandCard ids (stable across drags), not positions. */
  hand: number[];
  camels: number;
}
export const EMPTY_SELECTION: Selection = { market: [], hand: [], camels: 0 };

export type IntentKind = 'take' | 'camels' | 'sell' | 'exchange';

export interface Intent {
  kind: IntentKind;
  /** The legal move this selection describes, or null while incomplete/illegal. */
  move: Move | null;
  give: Card[];
  get: Card[];
  points: number | null;
  bonus: boolean;
  /** Primary button label: the move, or what is still missing. */
  cta: string;
  /** Neutral guidance while the selection is incomplete. */
  hint: string | null;
  /** A rule the selection breaks. */
  error: string | null;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function interpretSelection(r: RoundState, me: PlayerId, sel: Selection, hand: readonly HandCard[]): Intent | null {
  const marketCards = sel.market.map((i) => r.market[i]);
  const handGoods = sel.hand.map((id) => hand.find((c) => c.id === id)?.good).filter((g): g is Good => g !== undefined);
  const give: Card[] = [...handGoods, ...Array<Card>(sel.camels).fill('camel')];
  if (marketCards.length === 0 && give.length === 0) return null;

  const base = { give, get: marketCards, points: null, bonus: false, hint: null, error: null };
  let intent: Intent;

  if (marketCards.includes('camel')) {
    const camels = r.market.filter((c) => c === 'camel');
    const cta = `Take ${plural(camels.length, 'camel')}`;
    intent =
      marketCards.some((c) => c !== 'camel') || give.length > 0
        ? { ...base, kind: 'camels', move: null, cta, error: 'Camels are taken on their own — deselect the other cards.' }
        : { ...base, kind: 'camels', move: { kind: 'camels' }, get: camels, cta };
  } else if (marketCards.length === 0) {
    if (sel.camels === 0 && new Set(handGoods).size === 1) {
      const good = handGoods[0];
      const count = handGoods.length;
      const size = Math.min(count, 5) as BonusSize;
      intent = {
        ...base, kind: 'sell', move: { kind: 'sell', good, count }, get: [],
        points: sum(r.tokens[good].slice(0, count)), bonus: count >= 3 && r.bonus[size].length > 0,
        cta: `Sell ${count} ${cardName(good, count)}`,
      };
    } else {
      intent = {
        ...base, kind: 'exchange', move: null, cta: 'Pick cards to take',
        hint: handGoods.length === 0
          ? 'Giving camels — now pick the market goods to take for them.'
          : 'To sell, pick one type. To exchange, pick market goods to take.',
      };
    }
  } else if (marketCards.length === 1 && give.length === 0) {
    intent = { ...base, kind: 'take', move: { kind: 'take', index: sel.market[0] }, cta: `Take ${cardName(marketCards[0])}` };
  } else {
    const k = marketCards.length;
    if (k < 2) {
      intent = { ...base, kind: 'exchange', move: null, cta: 'Pick 1 more to take', hint: 'An exchange takes at least 2 market goods.' };
    } else if (give.length < k) {
      intent = {
        ...base, kind: 'exchange', move: null, cta: `Pick ${k - give.length} more to give`,
        hint: `Give ${plural(k, 'card')} from your hand or herd for the ${k} you take.`,
      };
    } else if (give.length > k) {
      intent = { ...base, kind: 'exchange', move: null, cta: 'Counts must match', hint: `You’re giving ${give.length} but taking ${k}.` };
    } else {
      intent = {
        ...base, kind: 'exchange', cta: `Exchange ${k} for ${k}`,
        move: { kind: 'exchange', take: sel.market.slice(), giveGoods: handGoods, giveCamels: sel.camels },
      };
    }
  }

  if (r.current !== me) return { ...intent, move: null, error: 'Wait for your turn.' };
  if (intent.move) {
    const error = checkMove(r, intent.move);
    if (error) return { ...intent, move: null, error };
  }
  return intent;
}

/** The selection that expresses a move (used to preview an analysis suggestion on the table). */
export function selectionForMove(m: Move, r: RoundState, hand: readonly HandCard[]): Selection {
  const pickIds = (goods: readonly Good[]) => {
    const used = new Set<number>();
    return goods
      .map((g) => {
        const c = hand.find((x) => x.good === g && !used.has(x.id));
        if (c) used.add(c.id);
        return c?.id;
      })
      .filter((id): id is number => id !== undefined);
  };
  switch (m.kind) {
    case 'take':
      return { market: [m.index], hand: [], camels: 0 };
    case 'camels':
      return { market: r.market.flatMap((c, i) => (c === 'camel' ? [i] : [])), hand: [], camels: 0 };
    case 'sell':
      return { market: [], hand: pickIds(Array<Good>(m.count).fill(m.good)), camels: 0 };
    case 'exchange':
      return { market: m.take.slice(), hand: pickIds(m.giveGoods), camels: m.giveCamels };
  }
}

/** Herd camels are chosen from the top of the stack down; the top card is the leftmost (index 0). */
export function isCamelSelected(_herd: number, selected: number, index: number): boolean {
  return index < selected;
}

/** Clicking an unselected camel adds one to the selection; clicking a selected one removes one. */
export function toggleCamel(herd: number, selected: number, index: number): number {
  const next = isCamelSelected(herd, selected, index) ? selected - 1 : selected + 1;
  return Math.max(0, Math.min(herd, next));
}
