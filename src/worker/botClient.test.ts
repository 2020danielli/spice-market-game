import { describe, expect, it } from 'vitest';
import { newRound, playerView, type Move } from '../engine';
import { BotClient, type WorkerLike } from './botClient';

class FakeWorker implements WorkerLike {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  terminated = false;
  posted: unknown[] = [];
  postMessage(msg: unknown) { this.posted.push(msg); }
  terminate() { this.terminated = true; }
  reply(move: Move) { this.onmessage?.({ data: move } as MessageEvent); }
}

const view = playerView(newRound(1, 0).round, 0);

describe('BotClient', () => {
  it('resolves with the worker reply', async () => {
    const fake = new FakeWorker();
    const client = new BotClient(() => fake);
    const p = client.request('medium', view, 1);
    fake.reply({ kind: 'camels' });
    await expect(p).resolves.toEqual({ kind: 'camels' });
  });

  it('never delivers a cancelled request and replaces the busy worker (Review Focus 4)', async () => {
    const workers: FakeWorker[] = [];
    const client = new BotClient(() => {
      const w = new FakeWorker();
      workers.push(w);
      return w;
    });
    let settled = false;
    client.request('hard', view, 1).then(() => (settled = true));
    client.cancel();
    expect(workers[0].terminated).toBe(true);
    workers[0].reply({ kind: 'camels' });
    await Promise.resolve();
    expect(settled).toBe(false);
    const p2 = client.request('easy', view, 2);
    expect(workers).toHaveLength(2);
    workers[1].reply({ kind: 'take', index: 3 });
    await expect(p2).resolves.toEqual({ kind: 'take', index: 3 });
  });
});
