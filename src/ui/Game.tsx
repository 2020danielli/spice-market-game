import { useCallback, useEffect, useMemo, useState } from 'react';
import type { OpponentModel } from '../bots/ismcts';
import { playerView, scoreRound, type Move, type MovePart, type PlayerId } from '../engine';
import { ActionBar, SpectateBar } from './ActionBar';
import { AnalysisPanel } from './AnalysisPanel';
import { FlightLayer } from './FlightLayer';
import { useHandOrder } from './hand';
import { seatHandSlots, type HandSlot } from './handDisplay';
import { LogPanel } from './LogPanel';
import { Market } from './Market';
import { MatchOver, RoundSummary } from './Modals';
import { MoveGlyph } from './MoveGlyph';
import { PlayerArea } from './PlayerArea';
import { EMPTY_SELECTION, interpretSelection, selectionForMove, type Selection } from './selection';
import { TokenBoard } from './TokenBoard';
import { useAnalysis } from './useAnalysis';
import { seatName, useMatch, type GameSetup } from './useMatch';

const NO_KEYS: ReadonlySet<string> = new Set();

export function Game({ setup, onExit, onRematch }: { setup: GameSetup; onExit: () => void; onRematch: () => void }) {
  const g = useMatch(setup);
  const { match, phase, anim, spectate } = g;
  const r = match.round;
  const human: PlayerId | null = spectate ? null : 0;
  const names: [string, string] = [seatName(setup, 0), seatName(setup, 1)];
  const [sel, setSel] = useState<Selection>(EMPTY_SELECTION);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [showLog, setShowLog] = useState(true);
  const [opponentModel, setOpponentModel] = useState<OpponentModel>('strong');
  const hand = useHandOrder(r.players[0].hand);
  useEffect(() => setSel(EMPTY_SELECTION), [match]);

  const myTurn = human !== null && phase === 'playing' && r.current === human && g.thinking === null && anim === null;
  const intent = myTurn ? interpretSelection(r, 0, sel, hand.cards) : null;

  const bottomSlots = useMemo<HandSlot[]>(
    () => (spectate ? seatHandSlots(r, 0, true, true) : hand.cards.map((c) => ({ key: `c${c.id}`, card: c.good }))),
    [spectate, r, hand.cards],
  );
  const topSlots = useMemo(() => seatHandSlots(r, 1, spectate, setup.showKnown), [r, spectate, setup.showKnown]);

  const toggleMarket = (i: number) => {
    if (!myTurn) return;
    if (r.market[i] === 'camel') {
      const camelSlots = r.market.flatMap((c, j) => (c === 'camel' ? [j] : []));
      const all = camelSlots.every((j) => sel.market.includes(j));
      setSel((s) => ({ ...s, market: all ? s.market.filter((j) => !camelSlots.includes(j)) : [...new Set([...s.market, ...camelSlots])] }));
    } else {
      setSel((s) => ({ ...s, market: s.market.includes(i) ? s.market.filter((j) => j !== i) : [...s.market, i] }));
    }
  };
  const toggleHand = (id: number) => {
    if (!myTurn) return;
    setSel((s) => ({ ...s, hand: s.hand.includes(id) ? s.hand.filter((x) => x !== id) : [...s.hand, id] }));
  };
  const setCamels = (n: number) => {
    if (!myTurn) return;
    setSel((s) => ({ ...s, camels: n }));
  };

  const confirm = useCallback(() => {
    if (!intent?.move) return;
    const ids = sel.hand;
    void g.play(intent.move, {
      announce: false,
      handSlots: bottomSlots,
      chosenKeys: ids.map((id) => `c${id}`),
      onCommit: () => hand.markRemoved(ids),
    });
  }, [intent, sel.hand, g, bottomSlots, hand]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && myTurn) {
        e.preventDefault();
        confirm();
      }
      if (e.key === 'Escape') setSel(EMPTY_SELECTION);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirm, myTurn]);

  const hidden = useMemo<ReadonlySet<string>>(
    () => new Set(anim?.stage === 'flying' ? anim.plan.hidden : anim?.stage === 'refill' ? anim.plan.refillHidden : []),
    [anim],
  );
  const hl = anim?.stage === 'highlight' ? anim.plan.highlight : null;
  const hlKeys = (p: PlayerId): ReadonlySet<string> => (hl && anim?.plan.mover === p ? new Set(hl.handKeys) : NO_KEYS);
  const hlCamels = (p: PlayerId) => (hl && anim?.plan.mover === p ? hl.camels : 0);

  const lastMove = (p: PlayerId): MovePart[] | null => {
    for (let i = g.log.length - 1; i >= 0; i--) {
      const e = g.log[i];
      if (e.round !== match.roundNumber) return null;
      if (e.player === p) return e.parts;
    }
    return null;
  };

  const analysisSide: PlayerId | null =
    !showAnalysis || phase !== 'playing' || anim !== null ? null : spectate ? r.current : myTurn ? 0 : null;
  const analysisView = useMemo(() => (analysisSide === null ? null : playerView(r, analysisSide)), [r, analysisSide]);
  const analysis = useAnalysis(analysisView, opponentModel);
  const pickMove = (m: Move) => {
    if (myTurn) setSel(selectionForMove(m, r, hand.cards));
  };

  const result = phase === 'roundOver' && anim === null ? scoreRound(r, match.config) : null;
  const sidebar = showAnalysis || showLog;
  const waitingText =
    phase !== 'playing' ? 'Round over.' : anim ? (anim.plan.mover === 0 ? 'Moving…' : `${names[1]} is moving…`) : `${names[1]} is thinking…`;

  return (
    <div className={`game ${sidebar ? 'with-side' : ''}`}>
      <header className="topbar">
        <div className="brand">
          <h1>Spice Market</h1>
          <span className="round">Round {match.roundNumber}</span>
        </div>
        <div className="seals">
          {([0, 1] as const).map((p) => (
            <span key={p} className="seal-group">
              {p === 1 && <span className="vs">vs</span>}
              <span>{names[p]}</span>
              {[0, 1].map((k) => (
                <span key={k} className={`seal ${match.seals[p] > k ? 'won' : ''}`} />
              ))}
            </span>
          ))}
        </div>
        <div className="top-actions">
          <button className={`chip ${showAnalysis ? 'on' : ''}`} onClick={() => setShowAnalysis((v) => !v)}>Analysis</button>
          <button className={`chip ${showLog ? 'on' : ''}`} onClick={() => setShowLog((v) => !v)}>Log</button>
          <button className="btn ghost small" onClick={onExit}>Menu</button>
        </div>
      </header>

      <main className="board">
        <PlayerArea
          p={1}
          name={names[1]}
          player={r.players[1]}
          isTurn={phase === 'playing' && r.current === 1}
          thinking={g.thinking === 1}
          revealBonus={spectate}
          size={spectate ? 'md' : 'sm'}
          slots={topSlots}
          hidden={hidden}
          highlightKeys={hlKeys(1)}
          highlightCamels={hlCamels(1)}
          lastMove={lastMove(1)}
        />
        <section className="center">
          <Market
            market={r.market}
            deckSize={r.deck.length}
            selected={sel.market}
            badge={intent ? 'take' : undefined}
            highlight={hl?.market ?? []}
            hidden={hidden}
            onToggle={myTurn ? toggleMarket : undefined}
          />
          <TokenBoard tokens={r.tokens} bonus={r.bonus} hidden={hidden} />
          {anim && anim.stage !== 'refill' && (
            <div className="move-banner" key={`${anim.plan.mover}-${g.log.length}`}>
              <span className={`who who-${anim.plan.mover}`}>{names[anim.plan.mover]}</span>
              <MoveGlyph parts={anim.plan.caption} />
            </div>
          )}
        </section>
        {spectate ? (
          <PlayerArea
            p={0}
            name={names[0]}
            player={r.players[0]}
            isTurn={phase === 'playing' && r.current === 0}
            thinking={g.thinking === 0}
            revealBonus
            size="md"
            slots={bottomSlots}
            hidden={hidden}
            highlightKeys={hlKeys(0)}
            highlightCamels={hlCamels(0)}
            lastMove={lastMove(0)}
          />
        ) : (
          <PlayerArea
            p={0}
            name={names[0]}
            player={r.players[0]}
            isTurn={phase === 'playing' && r.current === 0}
            thinking={false}
            revealBonus
            size="md"
            slots={bottomSlots}
            hidden={hidden}
            highlightKeys={NO_KEYS}
            highlightCamels={0}
            lastMove={lastMove(0)}
            cards={hand.cards}
            onReorder={hand.setCards}
            onSort={hand.sort}
            selectedIds={sel.hand}
            onToggleCard={myTurn ? toggleHand : undefined}
            handBadge={intent?.kind === 'sell' ? 'sell' : 'give'}
            selectedCamels={sel.camels}
            onSetCamels={myTurn ? setCamels : undefined}
          />
        )}
        {spectate ? (
          <SpectateBar paused={g.paused} onTogglePause={() => g.setPaused(!g.paused)} onStep={g.step} speedMs={g.speedMs} onSpeed={g.setSpeedMs} />
        ) : (
          <ActionBar myTurn={myTurn} waitingText={waitingText} intent={intent} onConfirm={confirm} onClear={() => setSel(EMPTY_SELECTION)} />
        )}
      </main>

      {sidebar && (
        <aside className="side">
          {showAnalysis && (
            <AnalysisPanel
              round={r}
              side={analysisSide}
              names={names}
              waitingText={spectate ? 'Analysis starts when the next move is due.' : 'Analysis runs on your turn.'}
              snap={analysis.snap}
              running={analysis.running}
              opponent={opponentModel}
              onOpponent={setOpponentModel}
              onStop={analysis.stop}
              onRerun={analysis.rerun}
              onPick={myTurn ? pickMove : undefined}
            />
          )}
          {showLog && <LogPanel log={g.log} names={names} />}
        </aside>
      )}

      <FlightLayer anim={anim} scale={g.timeScale} />

      {result && (
        <RoundSummary round={r} result={result} names={names} roundNumber={match.roundNumber} seals={match.seals} onNext={g.nextRound} />
      )}
      {phase === 'matchOver' && anim === null && <MatchOver match={match} names={names} onRematch={onRematch} onMenu={onExit} />}
    </div>
  );
}
