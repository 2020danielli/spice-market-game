import { ANALYSIS_PARAMS } from '../bots';
import { IsmctsSearch, type OpponentModel, type RootStat, type SearchParams } from '../bots/ismcts';
import { Rng, type PlayerView } from '../engine';

export type AnalysisRequest =
  | { type: 'start'; id: number; view: PlayerView; opponent: OpponentModel; seed: number; maxMs: number; params?: SearchParams }
  | { type: 'stop'; id: number };

export interface AnalysisUpdate {
  id: number;
  iterations: number;
  elapsedMs: number;
  done: boolean;
  stats: RootStat[];
}

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<AnalysisRequest>) => void) | null;
  postMessage(msg: AnalysisUpdate): void;
};

const SLICE_MS = 250;

interface Job {
  id: number;
  search: IsmctsSearch;
  started: number;
  maxMs: number;
}
let job: Job | null = null;

function tick(current: Job): void {
  if (job !== current) return;
  current.search.runFor(SLICE_MS);
  const elapsedMs = performance.now() - current.started;
  const done = elapsedMs >= current.maxMs;
  ctx.postMessage({ id: current.id, iterations: current.search.iterations, elapsedMs, done, stats: current.search.rootStats() });
  if (done) job = null;
  else setTimeout(() => tick(current), 0);
}

ctx.onmessage = (e) => {
  const msg = e.data;
  if (msg.type === 'stop') {
    if (job?.id === msg.id) job = null;
    return;
  }
  const current: Job = {
    id: msg.id,
    search: new IsmctsSearch(msg.view, { ...(msg.params ?? ANALYSIS_PARAMS), opponent: msg.opponent }, new Rng(msg.seed)),
    started: performance.now(),
    maxMs: msg.maxMs,
  };
  job = current;
  setTimeout(() => tick(current), 0);
};
