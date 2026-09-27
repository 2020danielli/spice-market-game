import type { LineStep, OpponentModel, RootStat } from '../bots/ismcts';
import type { Move, PlayerView } from '../engine';
import type { AnalysisUpdate } from './analysisWorker';
import type { WorkerLike } from './botClient';

export interface MoveEval {
  key: string;
  move: Move;
  visits: number;
  winRate: number;
  margin: number;
  share: number;
  /** Standard error of winRate. */
  stderr: number;
  line: LineStep[];
}

export interface AnalysisSnapshot {
  iterations: number;
  elapsedMs: number;
  done: boolean;
  moves: MoveEval[];
}

export function mergeStats(perWorker: readonly (readonly RootStat[])[]): MoveEval[] {
  const acc = new Map<string, { stat: RootStat; lineVisits: number }>();
  for (const stats of perWorker) {
    for (const s of stats) {
      const a = acc.get(s.key);
      if (!a) {
        acc.set(s.key, { stat: { ...s }, lineVisits: s.visits });
        continue;
      }
      a.stat.visits += s.visits;
      a.stat.win += s.win;
      a.stat.margin += s.margin;
      if (s.visits > a.lineVisits) {
        a.stat.line = s.line;
        a.lineVisits = s.visits;
      }
    }
  }
  const all = [...acc.values()].map((a) => a.stat).filter((s) => s.visits > 0);
  const total = all.reduce((t, s) => t + s.visits, 0) || 1;
  return all
    .map((s) => {
      const p = s.win / s.visits;
      return {
        key: s.key, move: s.move, visits: s.visits, winRate: p, margin: s.margin / s.visits,
        share: s.visits / total, stderr: Math.sqrt(Math.max(p * (1 - p), 0.0025) / s.visits), line: s.line,
      };
    })
    .sort((a, b) => b.visits - a.visits);
}

const defaultFactory = (): WorkerLike => new Worker(new URL('./analysisWorker.ts', import.meta.url), { type: 'module' });

export function defaultWorkerCount(): number {
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
  return Math.max(1, Math.min(4, Math.floor(cores / 2)));
}

/** A pool of analysis workers searching the same position with different seeds; their stats are merged live. */
export class AnalysisClient {
  private workers: WorkerLike[] | null = null;
  private runId = 0;
  private active = false;

  constructor(
    private readonly count = defaultWorkerCount(),
    private readonly factory: () => WorkerLike = defaultFactory,
  ) {}

  start(view: PlayerView, opponent: OpponentModel, maxMs: number, onUpdate: (s: AnalysisSnapshot) => void): void {
    this.stop();
    const workers = this.workers ?? (this.workers = Array.from({ length: this.count }, () => this.factory()));
    const id = ++this.runId;
    this.active = true;
    const latest: (AnalysisUpdate | null)[] = workers.map(() => null);
    workers.forEach((w, i) => {
      w.onmessage = (e) => {
        const u = e.data as AnalysisUpdate;
        if (u.id !== this.runId || !this.active) return;
        latest[i] = u;
        const got = latest.filter((x): x is AnalysisUpdate => x !== null);
        const done = got.length === workers.length && got.every((x) => x.done);
        if (done) this.active = false;
        onUpdate({
          iterations: got.reduce((t, x) => t + x.iterations, 0),
          elapsedMs: Math.max(...got.map((x) => x.elapsedMs)),
          done,
          moves: mergeStats(got.map((x) => x.stats)),
        });
      };
      w.postMessage({ type: 'start', id, view, opponent, seed: id * 7919 + i * 104729 + 1, maxMs });
    });
  }

  stop(): void {
    if (this.active && this.workers) for (const w of this.workers) w.postMessage({ type: 'stop', id: this.runId });
    this.active = false;
    this.runId++;
  }

  dispose(): void {
    this.stop();
    for (const w of this.workers ?? []) w.terminate();
    this.workers = null;
  }
}
