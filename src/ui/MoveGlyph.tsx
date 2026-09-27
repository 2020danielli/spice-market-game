import { cardName, type Card, type MovePart } from '../engine';
import { GoodIcon, PALETTE } from './art';
import { BonusCoin } from './Coin';

export function MiniCard({ card }: { card: Card }) {
  const { main, light } = PALETTE[card];
  return (
    <svg className="mini-card" viewBox="0 0 30 40" role="img" aria-label={cardName(card)}>
      <rect x="1.25" y="1.25" width="27.5" height="37.5" rx="5" fill={light} stroke={main} strokeWidth="2.5" />
      <svg x="2" y="7" width="26" height="26" viewBox="0 0 100 100"><GoodIcon card={card} /></svg>
    </svg>
  );
}

/** Consecutive identical cards: up to 2 icons, otherwise one icon and a count. */
export function CardRun({ cards }: { cards: readonly Card[] }) {
  const groups: { card: Card; n: number }[] = [];
  for (const c of cards) {
    const last = groups[groups.length - 1];
    if (last && last.card === c) last.n++;
    else groups.push({ card: c, n: 1 });
  }
  return (
    <span className="card-run">
      {groups.map((grp, i) => (
        <span key={i} className="run-group">
          {grp.n > 2 ? (
            <>
              <MiniCard card={grp.card} />
              <span className="run-count">×{grp.n}</span>
            </>
          ) : (
            Array.from({ length: grp.n }, (_, j) => <MiniCard key={j} card={grp.card} />)
          )}
        </span>
      ))}
    </span>
  );
}

export function MoveGlyph({ parts }: { parts: readonly MovePart[] }) {
  return (
    <span className="glyph">
      {parts.map((p, i) => {
        switch (p.t) {
          case 'text':
            return <span key={i} className="glyph-verb">{p.text}</span>;
          case 'cards':
            return <CardRun key={i} cards={p.cards} />;
          case 'arrow':
            return <span key={i} className="glyph-arrow">→</span>;
          case 'points':
            return <span key={i} className="glyph-points">+{p.value}</span>;
          case 'bonus':
            return <BonusCoin key={i} size={p.size} px={18} />;
        }
      })}
    </span>
  );
}
