import type { Card } from '../engine';
import { CardBack, CardFace } from './art';

export type Badge = 'take' | 'give' | 'sell';
const BADGE_TEXT: Record<Badge, string> = { take: '↓', give: '↑', sell: '₹' };
const BADGE_TITLE: Record<Badge, string> = { take: 'Taking', give: 'Giving', sell: 'Selling' };

interface Props {
  card: Card | 'back';
  selected?: boolean;
  onClick?: () => void;
  size?: 'sm' | 'md';
  dim?: boolean;
  badge?: Badge;
  /** Opponent card you saw them take. */
  known?: boolean;
  /** Part of the move being announced. */
  glow?: boolean;
  /** Stacking order within an overlapping pile. */
  zIndex?: number;
}

export function CardView({ card, selected, onClick, size = 'md', dim, badge, known, glow, zIndex }: Props) {
  const cls = ['card', `card-${size}`, selected && 'selected', onClick && 'clickable', dim && 'dim', glow && 'glow'].filter(Boolean).join(' ');
  return (
    <button type="button" className={cls} onClick={onClick} disabled={!onClick} tabIndex={onClick ? 0 : -1} style={zIndex === undefined ? undefined : { zIndex }}>
      {card === 'back' ? <CardBack /> : <CardFace card={card} />}
      {badge && (
        <span className={`badge badge-${badge}`} title={BADGE_TITLE[badge]}>
          {BADGE_TEXT[badge]}
        </span>
      )}
      {known && (
        <span className="eye" title="You saw them take this card">
          <svg viewBox="0 0 24 14" width="14" height="9" aria-hidden="true">
            <path d="M1 7 Q12 -3 23 7 Q12 17 1 7 Z" fill="none" stroke="#f3d27a" strokeWidth="2" />
            <circle cx="12" cy="7" r="3.2" fill="#f3d27a" />
          </svg>
        </span>
      )}
    </button>
  );
}
