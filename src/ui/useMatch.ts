import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TIER_INFO, type Tier } from '../bots';
import {
  applyMove, checkMove, describeMove, finishRound, newMatch, playerView, scoreRound,
  type HistoryEntry, type MatchConfig, type Move, type MovePart, type PlayerId,
} from '../engine';
import { SEARCH_PARAMS } from '../bots';
import { DEFAULT_ENDGAME, isEndgame } from '../bots/endgame';
import { ParallelBot } from '../worker/analysisClient';
import { BotClient } from '../worker/botClient';
import { planMoveAnimation, stageDuration, type MoveAnimation } from './animation';
import { seatHandSlots, type HandSlot } from './handDisplay';

export type Seat = { kind: 'human' } | { kind: 'bot'; tier: Tier };
export interface GameSetup {
  seats: [Seat, Seat];
  config: MatchConfig;
  seed: number;
  /** Show opponent cards you watched them take face-up. */
  showKnown: boolean;
}
export type Phase = 'playing' | 'roundOver' | 'matchOver';
export interface LogEntry {
  id: number;
  round: number;
  player: PlayerId | null;
  parts: MovePart[];
  text: string;
}
export type AnimStage = 'highlight' | 'flying' | 'refill';
export interface ActiveAnimation {
  plan: MoveAnimation;
  stage: AnimStage;
}
export interface PlayOptions {
  /** Bots announce: highlight their pick before the cards move. */
  announce: boolean;
  handSlots: readonly HandSlot[];
  chosenKeys?: readonly string[];
  /** Runs right before the new state lands (used to keep the human's hand arrangement). */
  onCommit?: () => void;
}

export function seatName(setup: GameSetup, p: PlayerId): string {
  const s = setup.seats[p];
  if (s.kind === 'human') return 'You';
  const label = TIER_INFO[s.tier].label;
  return setup.seats.every((x) => x.kind === 'bot') ? `${p === 0 ? 'South' : 'North'} (${label})` : `${label} bot`;
}

const BOT_MIN_THINK_MS = 500;
export const HIGHLIGHT_MS = 850;

export function useMatch(setup: GameSetup) {
  const spectate = setup.seats.every((s) => s.kind === 'bot');
  const [match, setMatch] = useState(() => newMatch(setup.config, setup.seed));
  const [log, setLog] = useState<LogEntry[]>([]);
  const [anim, setAnim] = useState<ActiveAnimation | null>(null);
  const [thinking, setThinking] = useState<PlayerId | null>(null);
  const [paused, setPaused] = useState(false);
  const [speedMs, setSpeedMs] = useState(900);
  const [stepToken, setStepToken] = useState(0);
  const consumedStep = useRef(0);
  const speedRef = useRef(speedMs);
  speedRef.current = speedMs;
  const timeScale = spectate && speedMs < 600 ? 0.5 : 1;
  const scaleRef = useRef(timeScale);
  scaleRef.current = timeScale;
  const botSeed = useRef(setup.seed * 31 + 7);
  const logId = useRef(0);
  /** This round's moves, so bots can read the opponent's behaviour (belief model). */
  const history = useRef<HistoryEntry[]>([]);
  const animating = useRef(false);
  const alive = useRef(true);
  const client = useMemo(() => new BotClient(), []);
  const master = useMemo(() => new ParallelBot(), []);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      client.dispose();
      master.dispose();
    };
  }, [client, master]);

  const phase: Phase = match.winner !== null ? 'matchOver' : match.round.ended ? 'roundOver' : 'playing';

  const pushLog = useCallback((round: number, player: PlayerId | null, parts: MovePart[], text: string) => {
    const id = ++logId.current;
    setLog((l) => [...l, { id, round, player, parts, text }]);
  }, []);

  /** Plays a move as a short scene: (highlight) → flights on the old table → commit → refill flights. */
  const play = useCallback(
    async (move: Move, opts: PlayOptions): Promise<string | null> => {
      if (animating.current) return 'Wait for the current move to finish.';
      const before = match.round;
      const err = checkMove(before, move);
      if (err) return err;
      animating.current = true;
      const wait = (ms: number) => new Promise<void>((res) => window.setTimeout(res, ms * scaleRef.current));
      const after = applyMove(before, move);
      const plan = planMoveAnimation({ before, after, move, handSlots: opts.handSlots, chosenKeys: opts.chosenKeys });
      const text = describeMove(before, move, seatName(setup, before.current));
      try {
        if (opts.announce) {
          setAnim({ plan, stage: 'highlight' });
          await wait(HIGHLIGHT_MS);
          if (!alive.current) return null;
        }
        setAnim({ plan, stage: 'flying' });
        await wait(stageDuration(plan.flights, plan.popups));
        if (!alive.current) return null;
        pushLog(match.roundNumber, before.current, plan.caption, text);
        opts.onCommit?.();
        history.current = [...history.current, { before, move }];
        setMatch((m) => (m.round === before ? { ...m, round: after } : m));
        if (plan.refill.length > 0) {
          setAnim({ plan, stage: 'refill' });
          await wait(stageDuration(plan.refill));
        }
        return null;
      } finally {
        animating.current = false;
        if (alive.current) setAnim(null);
      }
    },
    [match, setup, pushLog],
  );

  const nextRound = useCallback(() => {
    if (match.winner !== null || !match.round.ended) return;
    const res = scoreRound(match.round, match.config);
    const text =
      res.sealWinner === null
        ? `Round ${match.roundNumber} tied — no seal.`
        : `Round ${match.roundNumber}: ${seatName(setup, res.sealWinner)} ${res.sealWinner === 0 && setup.seats[0].kind === 'human' ? 'win' : 'wins'} a Seal of Excellence (${res.scores[0]}–${res.scores[1]}).`;
    pushLog(match.roundNumber, null, [{ t: 'text', text }], text);
    history.current = [];
    setMatch(finishRound(match));
  }, [match, setup, pushLog]);

  useEffect(() => {
    if (phase !== 'playing' || anim !== null) return;
    const current = match.round.current;
    const seat = setup.seats[current];
    if (seat.kind !== 'bot') return;
    if (spectate && paused) {
      if (stepToken === consumedStep.current) return;
      consumedStep.current = stepToken;
    }
    let cancelled = false;
    let timer: number | undefined;
    const started = performance.now();
    setThinking(current);
    const view = playerView(match.round, current, history.current);
    // Master searches on several workers, except in the endgame, where the exact solver (single worker) takes over.
    const multi = seat.tier === 'master' || seat.tier === 'grandmaster' ? SEARCH_PARAMS[seat.tier] : null;
    const parallel = multi && !(multi.endgame && isEndgame({ deck: view.deckSize, tokens: view.tokens }, DEFAULT_ENDGAME.maxDeck));
    const decision = parallel
      ? master.decide(view, multi, multi.timeMs)
      : client.request(seat.tier, view, botSeed.current++);
    decision
      .then((move) => {
        if (cancelled) return;
        const minDelay = spectate ? speedRef.current : BOT_MIN_THINK_MS;
        timer = window.setTimeout(() => {
          if (cancelled) return;
          setThinking(null);
          void play(move, { announce: true, handSlots: seatHandSlots(match.round, current, spectate, setup.showKnown) });
        }, Math.max(0, minDelay - (performance.now() - started)));
      })
      .catch((err) => {
        console.error(err);
        setThinking(null);
      });
    return () => {
      cancelled = true;
      client.cancel();
      master.cancel();
      if (timer !== undefined) clearTimeout(timer);
      setThinking(null);
    };
  }, [match, phase, anim, paused, stepToken, spectate, setup, client, master, play]);

  useEffect(() => {
    if (!spectate || paused || phase !== 'roundOver' || anim !== null) return;
    const t = window.setTimeout(nextRound, 4000);
    return () => clearTimeout(t);
  }, [spectate, paused, phase, anim, nextRound]);

  return {
    match, phase, anim, log, thinking, play, nextRound, spectate,
    history: history.current,
    paused, setPaused, speedMs, setSpeedMs,
    step: () => setStepToken((t) => t + 1),
    timeScale,
  };
}
