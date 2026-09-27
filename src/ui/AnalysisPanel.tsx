import { motion } from 'framer-motion';
import type { OpponentModel } from '../bots/ismcts';
import { describeMoveParts, type Move, type PlayerId, type RoundState } from '../engine';
import type { AnalysisSnapshot, MoveEval } from '../worker/analysisClient';
import { MoveGlyph } from './MoveGlyph';

const RANK = ['Best', '2nd', '3rd'];
const pct = (p: number) => `${Math.round(p * 100)}%`;

interface Props {
  round: RoundState;
  side: PlayerId | null;
  names: [string, string];
  waitingText: string;
  snap: AnalysisSnapshot | null;
  running: boolean;
  opponent: OpponentModel;
  onOpponent: (m: OpponentModel) => void;
  onStop: () => void;
  onRerun: () => void;
  onPick?: (m: Move) => void;
}

export function AnalysisPanel(props: Props) {
  const { round, side, names, snap, running, opponent } = props;
  const best = snap?.moves[0] ?? null;
  return (
    <section className="analysis">
      <div className="side-head">
        <h2>Analysis</h2>
        {side !== null &&
          (running ? (
            <button className="btn ghost small" onClick={props.onStop}>Stop</button>
          ) : (
            <button className="btn ghost small" onClick={props.onRerun}>Run again</button>
          ))}
      </div>
      {side === null ? (
        <p className="muted pad">{props.waitingText}</p>
      ) : (
        <>
          <div className="analysis-sub">
            <span>
              for <b>{names[side]}</b>
            </span>
            <div className="segmented small">
              <button className={opponent === 'strong' ? 'on' : ''} onClick={() => props.onOpponent('strong')}>Strong opp.</button>
              <button className={opponent === 'typical' ? 'on' : ''} onClick={() => props.onOpponent('typical')}>Typical opp.</button>
            </div>
          </div>
          <div className="evalbar">
            <div className="evalfill" style={{ width: `${(best?.winRate ?? 0.5) * 100}%` }} />
            <span>{best ? `${pct(best.winRate)} to win the round` : 'Evaluating…'}</span>
          </div>
          <div className="analysis-meta">
            {running && <span className="pulse" />}
            {snap ? `${snap.iterations.toLocaleString()} simulations · ${Math.round(snap.elapsedMs / 1000)}s` : 'Starting…'}
            {snap?.done && ' · done'}
          </div>
          <ol className="move-list">
            {snap?.moves.slice(0, 6).map((m, i) => (
              <MoveRow key={m.key} m={m} i={i} round={round} names={names} onPick={props.onPick} />
            ))}
          </ol>
          <p className="footnote">
            Win % = chance to win this round against a {opponent} opponent (± is a 95% band). EV = expected rupee margin at
            round end. Lines are likely continuations; later cards depend on the draw. Uses only what {names[side]}{' '}
            {names[side] === 'You' ? 'can' : 'could'} see.
          </p>
        </>
      )}
    </section>
  );
}

function MoveRow({ m, i, round, names, onPick }: { m: MoveEval; i: number; round: RoundState; names: [string, string]; onPick?: (m: Move) => void }) {
  const top = i < 3;
  return (
    <motion.li
      layout
      transition={{ duration: 0.3 }}
      className={`${top ? 'top' : ''} ${onPick ? 'pickable' : ''}`}
      onClick={onPick ? () => onPick(m.move) : undefined}
      title={onPick ? 'Click to select these cards' : undefined}
    >
      <div className="row-main">
        <span className={`rank ${top ? 'rank-top' : ''}`}>{top ? RANK[i] : i + 1}</span>
        <span className="mv"><MoveGlyph parts={describeMoveParts(round, m.move)} /></span>
        <span className="win">
          <span className="winbar"><span style={{ width: pct(m.winRate) }} /></span>
          {pct(m.winRate)}
          <small>±{m.stderr * 200 < 1 ? '<1' : Math.round(m.stderr * 200)}</small>
        </span>
        <span className={`ev ${m.margin >= 0 ? 'pos' : 'neg'}`}>
          {m.margin >= 0 ? '+' : ''}
          {m.margin.toFixed(1)}
        </span>
      </div>
      {top && m.line.length > 1 && (
        <div className="line">
          <span className="line-label">likely line</span>
          {m.line.slice(1).map((step, j) => (
            <span key={j} className="line-step">
              <span className={`who who-${step.mover}`}>{names[step.mover]}</span>
              <MoveGlyph parts={step.parts} />
            </span>
          ))}
        </div>
      )}
    </motion.li>
  );
}
