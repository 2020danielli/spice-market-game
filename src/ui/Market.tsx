import type { Card } from '../engine';
import { anchors } from './animation';
import { CardView, type Badge } from './CardView';

interface Props {
  market: Card[];
  deckSize: number;
  selected: number[];
  badge?: Badge;
  highlight: readonly number[];
  hidden: ReadonlySet<string>;
  onToggle?: (i: number) => void;
}

export function Market({ market, deckSize, selected, badge, highlight, hidden, onToggle }: Props) {
  return (
    <>
      <div className="deck" data-anchor={anchors.deck} title={`${deckSize} cards left in the deck`}>
        {deckSize > 0 ? <CardView card="back" /> : <div className="deck-empty">empty</div>}
        <span className="deck-count">{deckSize}</span>
      </div>
      <div className="market-wrap">
        <div className="market-label">Market</div>
        <div className="market">
          {market.map((c, i) => {
            const a = anchors.market(i);
            const isSel = selected.includes(i);
            return (
              <div key={i} data-anchor={a} className={`slot ${hidden.has(a) ? 'is-hidden' : ''}`}>
                <CardView
                  card={c}
                  selected={isSel}
                  badge={isSel ? badge : undefined}
                  glow={highlight.includes(i)}
                  onClick={onToggle && (() => onToggle(i))}
                />
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
