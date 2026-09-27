import { CardRun } from './MoveGlyph';
import type { Intent, IntentKind } from './selection';

const MODE: Record<IntentKind, string> = { take: 'Take', camels: 'Camels', sell: 'Sell', exchange: 'Exchange' };

interface Props {
  myTurn: boolean;
  waitingText: string;
  intent: Intent | null;
  onConfirm: () => void;
  onClear: () => void;
}

export function ActionBar({ myTurn, waitingText, intent, onConfirm, onClear }: Props) {
  if (!myTurn) {
    return (
      <div className="action-bar">
        <span className="muted">{waitingText}</span>
      </div>
    );
  }
  if (!intent) {
    return (
      <div className="action-bar">
        <span className="muted">Your turn — pick a market card, a camel, or cards from your hand. Drag your cards to rearrange.</span>
      </div>
    );
  }
  const message = intent.error ?? intent.hint;
  return (
    <div className="action-bar">
      <span className={`mode mode-${intent.kind}`}>{MODE[intent.kind]}</span>
      <span className="flow">
        {intent.give.length > 0 && <CardRun cards={intent.give} />}
        {intent.give.length > 0 && intent.get.length > 0 && <span className="glyph-arrow">→</span>}
        {intent.get.length > 0 && <CardRun cards={intent.get} />}
        {intent.points !== null && (
          <span className="glyph-points">
            +{intent.points}
            {intent.bonus && ' & bonus'}
          </span>
        )}
      </span>
      {message && <span className={`msg ${intent.error ? 'msg-error' : 'msg-hint'}`}>{intent.error ? `⚠ ${message}` : message}</span>}
      <span className="spacer" />
      <button className="btn ghost" onClick={onClear}>
        Clear
      </button>
      <button className="btn primary" disabled={!intent.move} onClick={onConfirm}>
        {intent.cta}
      </button>
    </div>
  );
}

export function SpectateBar(props: {
  paused: boolean;
  onTogglePause: () => void;
  onStep: () => void;
  speedMs: number;
  onSpeed: (ms: number) => void;
}) {
  return (
    <div className="action-bar spectate-bar">
      <button className="btn primary" onClick={props.onTogglePause}>
        {props.paused ? '▶ Resume' : '❚❚ Pause'}
      </button>
      <button className="btn" onClick={props.onStep} disabled={!props.paused}>
        Step
      </button>
      <label className="row muted">
        Delay
        <input type="range" min={100} max={3000} step={100} value={props.speedMs} onChange={(e) => props.onSpeed(Number(e.target.value))} />
        {(props.speedMs / 1000).toFixed(1)}s
      </label>
    </div>
  );
}
