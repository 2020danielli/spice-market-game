import { Reorder } from 'framer-motion';
import { useRef } from 'react';
import { sum, type MovePart, type PlayerId, type PlayerState } from '../engine';
import { anchors } from './animation';
import { CardView, type Badge } from './CardView';
import { BonusCoin, Coin } from './Coin';
import type { HandCard } from './hand';
import type { HandSlot } from './handDisplay';
import { MoveGlyph } from './MoveGlyph';
import { isCamelSelected, toggleCamel } from './selection';

interface Props {
  p: PlayerId;
  name: string;
  player: PlayerState;
  isTurn: boolean;
  thinking: boolean;
  revealBonus: boolean;
  size: 'md' | 'sm';
  slots: readonly HandSlot[];
  hidden: ReadonlySet<string>;
  highlightKeys: ReadonlySet<string>;
  highlightCamels: number;
  lastMove: readonly MovePart[] | null;
  /** The human's arranged hand (enables drag + selection). */
  cards?: readonly HandCard[];
  onReorder?: (cards: HandCard[]) => void;
  onSort?: () => void;
  selectedIds?: readonly number[];
  onToggleCard?: (id: number) => void;
  handBadge?: Badge;
  selectedCamels?: number;
  onSetCamels?: (n: number) => void;
  /** Hide the score: show only how many tokens were earned. */
  scoreHidden?: boolean;
  onToggleScore?: () => void;
  /** Seen opponent cards the viewer has flipped face-up. */
  peeked?: ReadonlySet<string>;
  onPeek?: (key: string) => void;
}

export function PlayerArea(props: Props) {
  const { p, name, player, isTurn, thinking, revealBonus, size, slots, hidden, highlightKeys, highlightCamels, lastMove } = props;
  const dragged = useRef(false);
  const goodsPts = sum(player.goodsTokens);
  const bonusPts = sum(player.bonusTokens.map((t) => t.value));
  const hideCls = (a: string) => (hidden.has(a) ? 'is-hidden' : '');

  const card = (slot: HandSlot, selected: boolean, onClick?: () => void) => (
    <CardView
      card={slot.known && !props.peeked?.has(slot.key) ? 'back' : slot.card}
      size={size}
      known={slot.known}
      selected={selected}
      badge={selected ? props.handBadge : undefined}
      glow={highlightKeys.has(slot.key)}
      onClick={onClick}
    />
  );

  return (
    <section className={`player-area ${isTurn ? 'turn' : ''}`}>
      <div className="player-head">
        <span className="player-name">{name}</span>
        {thinking ? (
          <span className="thinking">
            thinking<i>.</i><i>.</i><i>.</i>
          </span>
        ) : isTurn ? (
          <span className="turn-pill">to play</span>
        ) : null}
        {lastMove && !thinking && (
          <span className="last-move" title="Last move">
            <MoveGlyph parts={lastMove} />
          </span>
        )}
        <span className="spacer" />
        {props.scoreHidden ? (
          <div className="earned">
            <span className="token-count">
              {player.goodsTokens.length} commodity token{player.goodsTokens.length === 1 ? '' : 's'} · {player.bonusTokens.length} bonus token{player.bonusTokens.length === 1 ? '' : 's'}
            </span>
            <span className="earned-tail" data-anchor={anchors.earned(p)} />
          </div>
        ) : (
          <>
            <div className="earned">
              {player.goodsTokens.map((v, i) => (
                <Coin key={i} good={player.soldGoods[i]} value={v} size={22} />
              ))}
              {player.bonusTokens.map((t, i) => (
                <BonusCoin key={`b${i}`} size={t.size} value={revealBonus ? t.value : undefined} px={22} />
              ))}
              <span className="earned-tail" data-anchor={anchors.earned(p)} />
            </div>
            <span className="score-chip">
              <b>{goodsPts + (revealBonus ? bonusPts : 0)}</b> ₹
              {!revealBonus && player.bonusTokens.length > 0 && <span className="muted"> + {player.bonusTokens.length} bonus</span>}
            </span>
          </>
        )}
        {props.onToggleScore && (
          <button className="score-toggle" onClick={props.onToggleScore} title={props.scoreHidden ? 'Show score' : 'Hide score'}>
            {props.scoreHidden ? 'Show score' : 'Hide score'}
          </button>
        )}
      </div>
      <div className="player-body">
        {props.cards && props.onReorder ? (
          <Reorder.Group as="div" axis="x" values={props.cards as HandCard[]} onReorder={props.onReorder} className={`hand hand-${size}`}>
            {props.cards.map((c) => {
              const key = `c${c.id}`;
              const a = anchors.hand(p, key);
              return (
                <Reorder.Item
                  as="div"
                  key={c.id}
                  value={c}
                  data-anchor={a}
                  className={`hand-item draggable ${hideCls(a)}`}
                  onDragStart={() => {
                    dragged.current = true;
                  }}
                  onDragEnd={() => {
                    window.setTimeout(() => {
                      dragged.current = false;
                    }, 0);
                  }}
                >
                  {card(
                    { key, card: c.good },
                    props.selectedIds?.includes(c.id) ?? false,
                    props.onToggleCard &&
                      (() => {
                        if (!dragged.current) props.onToggleCard!(c.id);
                      }),
                  )}
                </Reorder.Item>
              );
            })}
            <span className={`tail tail-${size}`} data-anchor={anchors.handTail(p)} />
          </Reorder.Group>
        ) : (
          <div className={`hand hand-${size}`}>
            {slots.map((s) => {
              const a = anchors.hand(p, s.key);
              return (
                <div key={s.key} data-anchor={a} className={`hand-item ${hideCls(a)}`}>
                  {card(s, false, s.known && props.onPeek ? () => props.onPeek!(s.key) : undefined)}
                </div>
              );
            })}
            <span className={`tail tail-${size}`} data-anchor={anchors.handTail(p)} />
          </div>
        )}
        <div className="herd">
          <div className={`herd-cards herd-${size}`}>
            {Array.from({ length: player.herd }, (_, i) => {
              const selected = props.selectedCamels !== undefined && isCamelSelected(player.herd, props.selectedCamels, i);
              return (
                <CardView
                  key={i}
                  card="camel"
                  size={size}
                  selected={selected}
                  badge={selected ? 'give' : undefined}
                  glow={i < highlightCamels}
                  zIndex={player.herd - i}
                  onClick={props.onSetCamels && (() => props.onSetCamels!(toggleCamel(player.herd, props.selectedCamels ?? 0, i)))}
                />
              );
            })}
            <span className={`tail tail-${size}`} data-anchor={anchors.herd(p)} />
          </div>
          <span className="herd-label">
            {player.herd} {player.herd === 1 ? 'camel' : 'camels'}
          </span>
        </div>
        {slots.length === 0 && <span className="hand-empty">No goods in hand</span>}
        {props.onSort && slots.length > 1 && (
          <button className="btn ghost small sort-btn" onClick={props.onSort} title="Sort your hand by good">
            Sort
          </button>
        )}
      </div>
    </section>
  );
}
