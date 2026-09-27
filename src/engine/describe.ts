import { cardName, sum } from './cards';
import type { BonusSize, Card, Move, RoundState } from './types';

/** A move broken into renderable pieces (icons, arrows, points) for the log, banners and analysis. */
export type MovePart =
  | { t: 'text'; text: string }
  | { t: 'cards'; cards: Card[] }
  | { t: 'arrow' }
  | { t: 'points'; value: number }
  | { t: 'bonus'; size: BonusSize };

export function listCards(cards: readonly Card[]): string {
  const counts = new Map<Card, number>();
  for (const c of cards) counts.set(c, (counts.get(c) ?? 0) + 1);
  return [...counts].map(([c, n]) => (n === 1 ? cardName(c) : `${n} ${cardName(c, n)}`)).join(', ');
}

export function describeMove(before: RoundState, m: Move, who: string): string {
  switch (m.kind) {
    case 'take':
      return `${who} took ${cardName(before.market[m.index])}.`;
    case 'camels': {
      const n = before.market.filter((c) => c === 'camel').length;
      return `${who} took ${n} ${cardName('camel', n).toLowerCase()}.`;
    }
    case 'exchange': {
      const taken = m.take.map((i) => before.market[i]);
      const given: Card[] = [...m.giveGoods, ...Array<Card>(m.giveCamels).fill('camel')];
      return `${who} exchanged ${listCards(given)} for ${listCards(taken)}.`;
    }
    case 'sell': {
      const pts = sum(before.tokens[m.good].slice(0, m.count));
      const size = Math.min(m.count, 5) as BonusSize;
      const bonus = m.count >= 3 && before.bonus[size].length > 0;
      return `${who} sold ${m.count} ${cardName(m.good, m.count)} for ${pts} ${pts === 1 ? 'rupee' : 'rupees'}${bonus ? ' + a bonus token' : ''}.`;
    }
  }
}

export function describeMoveParts(before: RoundState, m: Move): MovePart[] {
  switch (m.kind) {
    case 'take':
      return [{ t: 'text', text: 'took' }, { t: 'cards', cards: [before.market[m.index]] }];
    case 'camels':
      return [{ t: 'text', text: 'took' }, { t: 'cards', cards: before.market.filter((c) => c === 'camel') }];
    case 'exchange':
      return [
        { t: 'text', text: 'swapped' },
        { t: 'cards', cards: [...m.giveGoods, ...Array<Card>(m.giveCamels).fill('camel')] },
        { t: 'arrow' },
        { t: 'cards', cards: m.take.map((i) => before.market[i]) },
      ];
    case 'sell': {
      const parts: MovePart[] = [
        { t: 'text', text: 'sold' },
        { t: 'cards', cards: Array<Card>(m.count).fill(m.good) },
        { t: 'points', value: sum(before.tokens[m.good].slice(0, m.count)) },
      ];
      const size = Math.min(m.count, 5) as BonusSize;
      if (m.count >= 3 && before.bonus[size].length > 0) parts.push({ t: 'bonus', size });
      return parts;
    }
  }
}
