import { enumerateMoves, type Move, type PlayerView, type Rng } from '../engine';
import { mediumMove } from './heuristic';

/** Sometimes sensible, often random: picks a random action kind, then a random move of that kind. */
export function easyMove(v: PlayerView, rng: Rng): Move {
  if (rng.next() < 0.35) return mediumMove(v);
  const byKind = new Map<Move['kind'], Move[]>();
  for (const m of enumerateMoves(v.hand, v.herd, v.market)) {
    const list = byKind.get(m.kind) ?? [];
    list.push(m);
    byKind.set(m.kind, list);
  }
  const groups = [...byKind.values()];
  const group = groups[rng.int(groups.length)];
  return group[rng.int(group.length)];
}
