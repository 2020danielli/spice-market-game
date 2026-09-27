import { chooseMove, type Tier } from '../bots';
import type { PlayerView } from '../engine';

export interface BotRequest {
  tier: Tier;
  view: PlayerView;
  seed: number;
}

const ctx = self as unknown as { onmessage: ((e: MessageEvent<BotRequest>) => void) | null; postMessage(msg: unknown): void };

ctx.onmessage = (e) => {
  const { tier, view, seed } = e.data;
  ctx.postMessage(chooseMove(tier, view, seed));
};
