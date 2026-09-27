import { BONUS_SIZES, cardName, GOODS, GOODS_TOKENS, type BonusSize, type Good } from '../engine';
import { anchors } from './animation';
import { BonusCoin, CamelCoin, Coin } from './Coin';
import { MiniCard } from './MoveGlyph';

interface Props {
  tokens: Record<Good, number[]>;
  bonus: Record<BonusSize, number[]>;
  hidden: ReadonlySet<string>;
}

export function TokenBoard({ tokens, bonus, hidden }: Props) {
  return (
    <div className="token-board">
      {GOODS.map((g) => {
        const taken = GOODS_TOKENS[g].length - tokens[g].length;
        return (
          <div className="token-row" key={g}>
            <span className="token-label">
              <MiniCard card={g} />
              {cardName(g)}
            </span>
            <div className="token-stack" data-anchor={anchors.tokens(g)}>
              {tokens[g].map((v, i) => {
                const a = anchors.token(g, i);
                return (
                  <span key={`${g}-${taken + i}`} data-anchor={a} className={`token ${hidden.has(a) ? 'is-hidden' : ''}`}>
                    <Coin good={g} value={v} size={i === 0 ? 30 : 26} />
                  </span>
                );
              })}
              {tokens[g].length === 0 && <span className="empty">sold out</span>}
            </div>
          </div>
        );
      })}
      <div className="bonus-row">
        {BONUS_SIZES.map((s) => (
          <div className="bonus-stack" key={s} data-anchor={anchors.bonus(s)} title={`${s === 5 ? '5+' : s}-card sale bonuses left`}>
            <BonusCoin size={s} px={30} />×{bonus[s].length}
          </div>
        ))}
        <div className="bonus-stack" title="Camel token: 5 rupees to the bigger herd">
          <CamelCoin px={30} />
        </div>
      </div>
    </div>
  );
}
