import type { Card } from '../engine';
import { cardName } from '../engine';

export const PALETTE: Record<Card, { main: string; dark: string; light: string }> = {
  diamond: { main: '#c8323f', dark: '#6e1019', light: '#f8d3d5' },
  gold: { main: '#e2a72e', dark: '#80550a', light: '#fcebc0' },
  silver: { main: '#a3afbb', dark: '#4b5662', light: '#eef1f4' },
  cloth: { main: '#8e4fb6', dark: '#46195f', light: '#ead8f3' },
  spice: { main: '#4f9b45', dark: '#23501e', light: '#d8eed3' },
  leather: { main: '#8d5a31', dark: '#472911', light: '#efdcc8' },
  camel: { main: '#d7a257', dark: '#7c4f17', light: '#f7e6c9' },
};

export function GoodIcon({ card }: { card: Card }) {
  const { main, dark, light } = PALETTE[card];
  switch (card) {
    case 'diamond':
      return (
        <g strokeLinejoin="round">
          <polygon points="50,90 10,40 27,16 73,16 90,40" fill={main} stroke={dark} strokeWidth="3" />
          <polygon points="27,16 39,40 61,40 73,16" fill={light} opacity="0.55" />
          <path d="M10 40 H90 M39 40 L50 90 L61 40 M27 16 L39 40 L50 16 L61 40 L73 16" fill="none" stroke={dark} strokeWidth="2" />
          <path d="M20 36 L30 22" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity="0.7" />
        </g>
      );
    case 'gold': {
      const bar = (x: number, y: number) => (
        <g transform={`translate(${x} ${y})`}>
          <polygon points="-24,14 24,14 17,-10 -17,-10" fill={main} stroke={dark} strokeWidth="2.5" strokeLinejoin="round" />
          <polygon points="-17,-10 17,-10 13,-4 -13,-4" fill={light} opacity="0.7" />
        </g>
      );
      return (
        <g>
          {bar(27, 72)}
          {bar(73, 72)}
          {bar(50, 46)}
          <path d="M40 38 L46 38" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" opacity="0.8" />
        </g>
      );
    }
    case 'silver':
      return (
        <g stroke={dark} strokeWidth="2.5">
          {[78, 70, 62, 54].map((y) => (
            <ellipse key={y} cx="36" cy={y} rx="22" ry="8" fill={y === 54 ? light : main} />
          ))}
          <circle cx="64" cy="44" r="25" fill={main} />
          <circle cx="64" cy="44" r="18" fill={light} strokeWidth="2" />
          <text x="64" y="52" textAnchor="middle" fontSize="22" fontWeight="700" fill={dark} stroke="none">₹</text>
        </g>
      );
    case 'cloth':
      return (
        <g strokeLinejoin="round">
          <path d="M18 28 Q50 14 82 28 L78 84 Q50 72 22 84 Z" fill={main} stroke={dark} strokeWidth="3" />
          <path d="M34 22 Q38 50 30 80 M50 18 Q54 48 50 76 M66 22 Q62 50 70 80" fill="none" stroke={dark} strokeWidth="2" opacity="0.6" />
          {[36, 50, 64].map((y) => (
            <path key={y} d={`M22 ${y} Q50 ${y - 10} 80 ${y}`} fill="none" stroke={light} strokeWidth="3" strokeDasharray="4 4" />
          ))}
        </g>
      );
    case 'spice':
      return (
        <g strokeLinejoin="round">
          <path d="M28 40 Q50 28 72 40 L80 84 Q50 96 20 84 Z" fill={main} stroke={dark} strokeWidth="3" />
          <path d="M30 40 Q50 18 70 40 Q50 34 30 40 Z" fill="#c9602b" stroke={dark} strokeWidth="2" />
          <path d="M34 42 Q50 50 66 42" fill="none" stroke={light} strokeWidth="4" />
          {[
            [44, 26], [52, 22], [58, 28], [48, 32],
          ].map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="2.5" fill="#f0a24a" />
          ))}
        </g>
      );
    case 'leather':
      return (
        <g>
          <path
            d="M30 14 Q50 24 70 14 Q76 28 88 30 Q80 50 88 70 Q76 72 70 86 Q50 76 30 86 Q24 72 12 70 Q20 50 12 30 Q24 28 30 14Z"
            fill={main} stroke={dark} strokeWidth="3" strokeLinejoin="round"
          />
          <path
            d="M33 24 Q50 32 67 24 Q72 34 80 36 Q74 50 80 64 Q72 66 67 76 Q50 68 33 76 Q28 66 20 64 Q26 50 20 36 Q28 34 33 24Z"
            fill="none" stroke={light} strokeWidth="2" strokeDasharray="5 4"
          />
        </g>
      );
    case 'camel':
      return (
        <g fill={dark}>
          <ellipse cx="46" cy="56" rx="27" ry="14" />
          <ellipse cx="44" cy="42" rx="15" ry="13" />
          <path d="M66 52 Q74 40 76 28 L84 26 Q82 44 72 60 Z" />
          <ellipse cx="84" cy="25" rx="9" ry="5.5" />
          <rect x="24" y="62" width="5" height="26" rx="2" />
          <rect x="33" y="64" width="5" height="24" rx="2" />
          <rect x="56" y="62" width="5" height="26" rx="2" />
          <rect x="64" y="60" width="5" height="28" rx="2" />
          <path d="M19 52 Q12 58 14 68" stroke={dark} strokeWidth="3" fill="none" />
          <path d="M32 40 Q44 30 58 40 L56 50 Q44 44 34 50 Z" fill="#b8312f" />
          <path d="M34 50 L34 54 M40 48 L40 52 M46 47 L46 51 M52 48 L52 52" stroke="#f2c14e" strokeWidth="2" />
        </g>
      );
  }
}

export function CardFace({ card }: { card: Card }) {
  const { main, dark, light } = PALETTE[card];
  return (
    <svg viewBox="0 0 100 140" className="card-svg" role="img" aria-label={cardName(card)}>
      <rect x="2" y="2" width="96" height="136" rx="9" fill="#fbf4e4" stroke={dark} strokeWidth="3" />
      <rect x="8" y="8" width="84" height="124" rx="6" fill={light} stroke={main} strokeWidth="2" />
      <path d="M8 52 Q50 4 92 52" fill="none" stroke={main} strokeWidth="2" opacity="0.6" />
      <circle cx="17" cy="17" r="5" fill={main} stroke={dark} strokeWidth="1.5" />
      <circle cx="83" cy="17" r="5" fill={main} stroke={dark} strokeWidth="1.5" />
      <svg x="12" y="26" width="76" height="76" viewBox="0 0 100 100">
        <GoodIcon card={card} />
      </svg>
      <rect x="14" y="110" width="72" height="18" rx="9" fill={main} />
      <text x="50" y="123.5" textAnchor="middle" fontSize="11" fontWeight="700" letterSpacing="1.2" fill="#fff">
        {cardName(card).toUpperCase()}
      </text>
    </svg>
  );
}

function starPoints(cx: number, cy: number, outer: number, inner: number, n: number): string {
  const pts: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI * i) / n - Math.PI / 2;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(' ');
}

export function CardBack() {
  return (
    <svg viewBox="0 0 100 140" className="card-svg" role="img" aria-label="Face-down card">
      <rect x="2" y="2" width="96" height="136" rx="9" fill="#26285f" stroke="#12133a" strokeWidth="3" />
      <rect x="8" y="8" width="84" height="124" rx="6" fill="none" stroke="#d9a641" strokeWidth="1.5" />
      <circle cx="50" cy="70" r="30" fill="none" stroke="#d9a641" strokeWidth="1.5" />
      <polygon points={starPoints(50, 70, 26, 11, 8)} fill="#b8312f" stroke="#d9a641" strokeWidth="1.2" />
      <circle cx="50" cy="70" r="7" fill="#d9a641" />
      {[22, 118].map((y) => (
        <polygon key={y} points={starPoints(50, y, 7, 3, 4)} fill="#d9a641" />
      ))}
    </svg>
  );
}
