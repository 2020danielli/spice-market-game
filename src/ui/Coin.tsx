import type { BonusSize, Good } from '../engine';
import { GoodIcon, PALETTE } from './art';

export function Coin({ good, value, size = 30 }: { good: Good; value: number; size?: number | string }) {
  const { main, dark, light } = PALETTE[good];
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className="coin">
      <circle cx="20" cy="20" r="18.5" fill={main} stroke={dark} strokeWidth="2" />
      <circle cx="20" cy="20" r="13" fill={light} stroke={dark} strokeWidth="1" strokeDasharray="2 2" />
      <text x="20" y="25.5" textAnchor="middle" fontSize="15" fontWeight="800" fill={dark}>{value}</text>
    </svg>
  );
}

export function BonusCoin({ size, value, px = 34 }: { size: BonusSize; value?: number; px?: number | string }) {
  return (
    <svg width={px} height={px} viewBox="0 0 40 40" className="coin">
      <circle cx="20" cy="20" r="18.5" fill="#26285f" stroke="#d9a641" strokeWidth="2" />
      <text x="20" y={value === undefined ? 18 : 25} textAnchor="middle" fontSize={value === undefined ? 10 : 15} fontWeight="800" fill="#f3d27a">
        {value === undefined ? `×${size}` : value}
      </text>
      {value === undefined && <text x="20" y="30" textAnchor="middle" fontSize="9" fill="#f3d27a">?</text>}
    </svg>
  );
}

export function CamelCoin({ px = 34 }: { px?: number }) {
  return (
    <svg width={px} height={px} viewBox="0 0 40 40" className="coin">
      <circle cx="20" cy="20" r="18.5" fill={PALETTE.camel.light} stroke={PALETTE.camel.dark} strokeWidth="2" />
      <svg x="7" y="6" width="26" height="26" viewBox="0 0 100 100"><GoodIcon card="camel" /></svg>
      <text x="33" y="36" textAnchor="middle" fontSize="10" fontWeight="800" fill={PALETTE.camel.dark}>5</text>
    </svg>
  );
}
