import {
  applyMoveMut, describeMoveParts, enumerateMoves, exchangeMoves, other, playerView, scoreRound,
  type Move, type MovePart, type PlayerId, type PlayerView, type Rng, type RoundState,
} from '../engine';
import { determinize } from './determinize';
import { evaluateMove } from './heuristic';
import { rolloutMove } from './rollout';

export type OpponentModel = 'strong' | 'typical';

export interface SearchParams {
  timeMs: number;
  maxIterations: number;
  /** Exchanges kept per node (best by heuristic). */
  exchangeK: number;
  /** Tree depth (plies) below which exchanges are considered at all. */
  exchangeDepth: number;
  exploration: number;
  /** strong: the opponent picks its best reply (UCT). typical: it samples a noisy Medium policy. */
  opponent?: OpponentModel;
  /** Tree size cap; past it the search keeps sampling from the existing tree without expanding. */
  maxNodes?: number;
  /** Candidate-move cache entries kept before the cache is cleared. */
  cacheLimit?: number;
}

/** ~70 MB per search at the cap — keeps a 60 s, 4-worker analysis well under a gigabyte. */
const DEFAULT_MAX_NODES = 200_000;
const DEFAULT_CACHE_LIMIT = 20_000;

/** Softmax temperature, in rupees of heuristic value, for the typical opponent. */
const TYPICAL_TEMPERATURE = 1.5;
const LINE_PLIES = 4;
const LINE_MIN_VISITS = 8;

export interface LineStep {
  mover: PlayerId;
  parts: MovePart[];
}

export interface RootStat {
  key: string;
  move: Move;
  visits: number;
  /** Sum of round wins (1 / 0.5 / 0) from the root player's view. */
  win: number;
  /** Sum of final score margins from the root player's view. */
  margin: number;
  line: LineStep[];
}

class Node {
  children: Node[] = [];
  visits = 0;
  reward = 0;
  win = 0;
  margin = 0;
  avail = 1;
  constructor(
    public move: Move | null,
    public key: string,
    public mover: PlayerId,
    public parent: Node | null,
    public parts: MovePart[],
  ) {}
}

/** Identifies a move by card types so it matches across determinizations. */
function moveKey(r: RoundState, m: Move): string {
  switch (m.kind) {
    case 'take':
      return `t:${r.market[m.index]}`;
    case 'camels':
      return 'c';
    case 'sell':
      return `s:${m.good}:${m.count}`;
    case 'exchange':
      return `x:${m.take.map((i) => r.market[i]).sort().join(',')}|${m.giveGoods.slice().sort().join(',')}|${m.giveCamels}`;
  }
}

function candidates(r: RoundState, depth: number, params: SearchParams, cache: Map<string, Move[]>): Move[] {
  const p = r.players[r.current];
  const withEx = depth < params.exchangeDepth;
  const sig = `${withEx ? 1 : 0}|${r.current}|${p.hand.slice().sort().join('')}|${p.herd}|${r.market.join('')}`;
  const hit = cache.get(sig);
  if (hit) return hit;
  let moves = enumerateMoves(p.hand, p.herd, r.market, false);
  if (withEx) {
    const ex = exchangeMoves(p.hand, p.herd, r.market);
    if (ex.length > 0) {
      const view = playerView(r, r.current);
      const top = ex
        .map((m) => ({ m, s: evaluateMove(view, m) }))
        .sort((a, b) => b.s - a.s)
        .slice(0, params.exchangeK)
        .map((x) => x.m);
      moves = moves.concat(top);
    }
  }
  if (cache.size >= (params.cacheLimit ?? DEFAULT_CACHE_LIMIT)) cache.clear();
  cache.set(sig, moves);
  return moves;
}

interface Outcome {
  win: [number, number];
  margin: [number, number];
}

function outcome(r: RoundState): Outcome {
  const res = scoreRound(r, { camelTiebreak: false });
  const w0 = res.sealWinner === 0 ? 1 : res.sealWinner === null ? 0.5 : 0;
  const d = res.scores[0] - res.scores[1];
  return { win: [w0, 1 - w0], margin: [d, -d] };
}

function reward(o: Outcome, p: PlayerId): number {
  return 0.8 * o.win[p] + 0.2 * (0.5 + 0.5 * Math.tanh(o.margin[p] / 20));
}

function pickWeighted(weights: readonly number[], rng: Rng): number {
  let total = 0;
  for (const w of weights) total += w;
  let x = rng.next() * total;
  for (let i = 0; i < weights.length; i++) {
    x -= weights[i];
    if (x <= 0) return i;
  }
  return weights.length - 1;
}

/** Single-observer information-set MCTS over determinizations; anytime (iterate as long as you like). */
export class IsmctsSearch {
  iterations = 0;
  nodeCount = 1;
  readonly rootMoves: Move[];
  private readonly root: Node;
  private readonly cache = new Map<string, Move[]>();

  constructor(
    private readonly view: PlayerView,
    private readonly params: SearchParams,
    private readonly rng: Rng,
  ) {
    this.rootMoves = candidates(determinize(view, rng), 0, params, this.cache);
    this.root = new Node(null, 'root', other(view.me), null, []);
  }

  get cacheSize(): number {
    return this.cache.size;
  }

  runFor(ms: number, maxIterations = Infinity): void {
    const deadline = performance.now() + ms;
    for (let i = 0; i < maxIterations; i++) {
      if ((i & 15) === 0 && performance.now() > deadline) break;
      this.iterate();
    }
  }

  iterate(): void {
    const { params, rng } = this;
    const maxNodes = params.maxNodes ?? DEFAULT_MAX_NODES;
    const state = determinize(this.view, rng);
    let node = this.root;
    let depth = 0;
    while (!state.ended) {
      const keyed = candidates(state, depth, params, this.cache).map((m) => [moveKey(state, m), m] as const);

      if (params.opponent === 'typical' && state.current !== this.view.me) {
        const v = playerView(state, state.current);
        const scores = keyed.map(([, m]) => evaluateMove(v, m));
        const top = Math.max(...scores);
        const [k, m] = keyed[pickWeighted(scores.map((s) => Math.exp((s - top) / TYPICAL_TEMPERATURE)), rng)];
        let child = node.children.find((c) => c.key === k);
        const fresh = !child;
        if (!child) {
          if (this.nodeCount >= maxNodes) break;
          this.nodeCount++;
          child = new Node(m, k, state.current, node, describeMoveParts(state, m));
          node.children.push(child);
        }
        applyMoveMut(state, m);
        node = child;
        depth++;
        if (fresh) break;
        continue;
      }

      const legalChildren: Node[] = [];
      const untried: (readonly [string, Move])[] = [];
      for (const km of keyed) {
        const ch = node.children.find((c) => c.key === km[0]);
        if (ch) legalChildren.push(ch);
        else untried.push(km);
      }
      for (const ch of legalChildren) ch.avail++;
      if (untried.length > 0 && this.nodeCount < maxNodes) {
        this.nodeCount++;
        const [k, m] = untried[rng.int(untried.length)];
        const child = new Node(m, k, state.current, node, describeMoveParts(state, m));
        node.children.push(child);
        applyMoveMut(state, m);
        node = child;
        depth++;
        break;
      }
      if (legalChildren.length === 0) break;
      let best = legalChildren[0];
      let bestU = -Infinity;
      for (const ch of legalChildren) {
        const u = ch.reward / ch.visits + params.exploration * Math.sqrt(Math.log(ch.avail) / ch.visits);
        if (u > bestU) {
          bestU = u;
          best = ch;
        }
      }
      applyMoveMut(state, keyed.find(([k]) => k === best.key)![1]);
      node = best;
      depth++;
    }
    let steps = 0;
    while (!state.ended && steps++ < 300) applyMoveMut(state, rolloutMove(state, rng));
    const o = outcome(state);
    for (let n: Node | null = node; n; n = n.parent) {
      n.visits++;
      n.reward += reward(o, n.mover);
      n.win += o.win[n.mover];
      n.margin += o.margin[n.mover];
    }
    this.iterations++;
  }

  rootStats(): RootStat[] {
    return this.root.children.map((c) => ({
      key: c.key, move: c.move!, visits: c.visits, win: c.win, margin: c.margin, line: this.lineFrom(c),
    }));
  }

  /** The most-visited continuation from a root move, while each ply is visited often enough to mean something. */
  private lineFrom(start: Node): LineStep[] {
    const line: LineStep[] = [{ mover: start.mover, parts: start.parts }];
    let n = start;
    while (line.length < LINE_PLIES && n.children.length > 0) {
      const next = n.children.reduce((a, b) => (b.visits > a.visits ? b : a));
      if (next.visits < LINE_MIN_VISITS) break;
      line.push({ mover: next.mover, parts: next.parts });
      n = next;
    }
    return line;
  }

  bestMove(): Move {
    if (this.root.children.length === 0) return this.rootMoves[0];
    return this.root.children.reduce((a, b) => (b.visits > a.visits ? b : a)).move!;
  }
}

export function ismcts(view: PlayerView, params: SearchParams, rng: Rng): Move {
  const search = new IsmctsSearch(view, params, rng);
  if (search.rootMoves.length === 1) return search.rootMoves[0];
  search.runFor(params.timeMs, params.maxIterations);
  return search.bestMove();
}
