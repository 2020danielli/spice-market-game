import { describe, expect, it } from 'vitest';
import type { RootStat } from '../bots/ismcts';
import { newRound, playerView } from '../engine';
import { AnalysisClient, mergeStats, type AnalysisSnapshot } from './analysisClient';
import type { WorkerLike } from './botClient';

class FakeWorker implements WorkerLike {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  terminated = false;
  posted: unknown[] = [];
  postMessage(msg: unknown) { this.posted.push(msg); }
  terminate() { this.terminated = true; }
  reply(data: unknown) { this.onmessage?.({ data } as MessageEvent); }
}

const stat = (key: string, visits: number, win: number, margin: number, lineLen = 1): RootStat => ({
  key, move: { kind: 'camels' }, visits, win, margin,
  line: Array.from({ length: lineLen }, (_, i) => ({ mover: (i % 2) as 0 | 1, parts: [] })),
});
const view = playerView(newRound(1, 0).round, 0);

describe('mergeStats', () => {
  it('sums per-move statistics across workers and sorts by visits', () => {
    const moves = mergeStats([
      [stat('a', 30, 15, 60), stat('b', 10, 2, -10)],
      [stat('a', 10, 5, 20, 3), stat('b', 50, 30, 100, 2)],
    ]);
    expect(moves.map((m) => m.key)).toEqual(['b', 'a']);
    expect(moves[0].visits).toBe(60);
    expect(moves[0].winRate).toBeCloseTo(32 / 60);
    expect(moves[0].margin).toBeCloseTo(90 / 60);
    expect(moves[0].share).toBeCloseTo(0.6);
    expect(moves[0].line).toHaveLength(2); // from the worker with 50 visits
    expect(moves[1].line).toHaveLength(1); // 30 visits beat 10
    expect(moves[0].stderr).toBeGreaterThan(0);
  });
});

describe('AnalysisClient', () => {
  it('merges live updates, reports done, and ignores stale or stopped runs (Review Focus 4)', () => {
    const workers: FakeWorker[] = [];
    const client = new AnalysisClient(2, () => {
      const w = new FakeWorker();
      workers.push(w);
      return w;
    });
    const snaps: AnalysisSnapshot[] = [];
    client.start(view, 'strong', 1000, (s) => snaps.push(s));
    const id1 = (workers[0].posted[0] as { id: number }).id;
    workers[0].reply({ id: id1, iterations: 10, elapsedMs: 250, done: false, stats: [stat('a', 10, 5, 0)] });
    workers[1].reply({ id: id1, iterations: 20, elapsedMs: 260, done: true, stats: [stat('a', 20, 10, 0)] });
    expect(snaps.at(-1)).toMatchObject({ iterations: 30, done: false });
    workers[0].reply({ id: id1, iterations: 40, elapsedMs: 1000, done: true, stats: [stat('a', 40, 20, 0)] });
    expect(snaps.at(-1)).toMatchObject({ iterations: 60, done: true });

    client.start(view, 'typical', 1000, (s) => snaps.push(s));
    const count = snaps.length;
    workers[0].reply({ id: id1, iterations: 99, elapsedMs: 1, done: false, stats: [] });
    expect(snaps.length).toBe(count);
    const id2 = (workers[0].posted[1] as { id: number; type: string }).id;
    client.stop();
    expect(workers[0].posted.at(-1)).toMatchObject({ type: 'stop', id: id2 });
    workers[1].reply({ id: id2, iterations: 5, elapsedMs: 1, done: false, stats: [] });
    expect(snaps.length).toBe(count);
    client.dispose();
    expect(workers.every((w) => w.terminated)).toBe(true);
  });

  it('creates no workers until analysis starts', () => {
    let made = 0;
    const client = new AnalysisClient(3, () => {
      made++;
      return new FakeWorker();
    });
    expect(made).toBe(0);
    client.start(view, 'strong', 10, () => {});
    expect(made).toBe(3);
  });
});
