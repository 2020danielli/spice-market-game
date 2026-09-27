import type { Tier } from '../bots';
import type { Move, PlayerView } from '../engine';

export interface WorkerLike {
  onmessage: ((e: MessageEvent) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
  postMessage(msg: unknown): void;
  terminate(): void;
}
export type WorkerFactory = () => WorkerLike;

const defaultFactory: WorkerFactory = () => new Worker(new URL('./botWorker.ts', import.meta.url), { type: 'module' });

/** Runs bots off the UI thread. At most one request is in flight; cancel() guarantees its answer is never delivered. */
export class BotClient {
  private worker: WorkerLike | null = null;
  private pending: object | null = null;

  constructor(private factory: WorkerFactory = defaultFactory) {}

  request(tier: Tier, view: PlayerView, seed: number): Promise<Move> {
    this.cancel();
    const w = this.worker ?? (this.worker = this.factory());
    const token = {};
    this.pending = token;
    return new Promise<Move>((resolve, reject) => {
      w.onmessage = (e) => {
        if (this.pending !== token) return;
        this.pending = null;
        resolve(e.data as Move);
      };
      w.onerror = (e) => {
        if (this.pending !== token) return;
        this.pending = null;
        reject(new Error(`Bot worker failed: ${e.message}`));
      };
      w.postMessage({ tier, view, seed });
    });
  }

  cancel(): void {
    if (this.pending && this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.pending = null;
  }

  dispose(): void {
    this.cancel();
    this.worker?.terminate();
    this.worker = null;
  }
}
