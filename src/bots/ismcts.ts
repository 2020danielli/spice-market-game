import {
  applyMoveMut, cloneRound, describeMoveParts, GOODS, enumerateMoves, exchangeMoves, other, playerView, scoreRound,
  type Move, type MovePart, type PlayerId, type PlayerView, type Rng, type RoundState,
} from '../engine';
import { determinize } from './determinize';
import { evaluateMove } from './heuristic';
import { buildHandPool, sampleHidden, type HandPool } from './inference';
import { DEFAULT_ENDGAME, solveEndgame, type EndgameParams } from './endgame';
import { beliefModel, getNet, getPolicy, type HiddenModel } from './nets';
import { endgameMove, estimateOutcome, smartRolloutMove, type EvalWeights } from './policy';
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
  /** basic: the original cheap playouts to the end. smart: endgame-aware greedy playouts, cut off and scored heuristically. */
  policy?: 'basic' | 'smart' | 'hybrid';
  /** Playout length before the heuristic estimate takes over (smart policy). */
  rolloutPlies?: number;
  /** Weight of the final margin (vs the round win) in the reward. */
  marginWeight?: number;
  /** Solve endgames exactly (PIMC + alpha-beta) instead of searching with MCTS once the deck is nearly empty. */
  endgame?: Partial<EndgameParams>;
  /** Learned policy network (by name): ranks candidate moves (incl. which exchanges to consider) and guides selection (PUCT). */
  policyName?: string;
  /** PUCT exploration constant when a policy network is used. */
  cPuct?: number;
  /** Learned opponent-hand model: sample the opponent's unseen cards from it (needs the view's oppMoves history). */
  beliefName?: string;
  /** Self-play only: mix Dirichlet(0.3) noise into the root priors with this weight (AlphaZero uses 0.25). */
  rootNoise?: number;
  /** Learned value network (by name) used to score positions instead of playing them out (early phase only if phaseDeck is set). */
  netName?: string;
  /** Read the opponent's behaviour: weight guesses of their hand by how well they explain the moves they made. */
  inference?: boolean;
  /** Weights of the heuristic position evaluation. */
  evalWeights?: EvalWeights;
  /** Phased search: evaluate-only while the deck has more than this many cards and fewer than 2 token stacks are empty; full playouts after. */
  phaseDeck?: number;
  /** Blend weight of an immediate heuristic evaluation at the tree leaf with the playout result (implicit-minimax style). */
  evalBlend?: number;
  /** Ensemble determinization: search this many separate trees, each on one fixed sample of the hidden cards, and sum their votes. */
  trees?: number;
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
export function moveKey(r: RoundState, m: Move): string {
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

interface Candidates {
  moves: Move[];
  /** Policy priors aligned with `moves` (only with a policy network). */
  priors: number[] | null;
}

/** How many exchanges the cheap heuristic pre-selects before the policy network re-ranks them. */
const POLICY_EXCHANGE_POOL = 40;

function candidateSet(r: RoundState, depth: number, params: SearchParams, cache: Map<string, Candidates>): Candidates {
  const p = r.players[r.current];
  const withEx = depth < params.exchangeDepth;
  const sig = `${withEx ? 1 : 0}|${r.current}|${p.hand.slice().sort().join('')}|${p.herd}|${r.market.join('')}|${GOODS.map((g) => r.tokens[g].length).join('')}`;
  const hit = cache.get(sig);
  if (hit) return hit;
  let moves = enumerateMoves(p.hand, p.herd, r.market, false);
  // The policy net is costly: it ranks the root's moves (computed once per search). Deeper nodes use even priors.
  const policy = params.policyName && depth === 0 ? getPolicy(params.policyName) : null;
  if (withEx) {
    const ex = exchangeMoves(p.hand, p.herd, r.market);
    if (ex.length > 0) {
      const view = playerView(r, r.current);
      const pool = ex
        .map((m) => ({ m, s: evaluateMove(view, m) }))
        .sort((a, b) => b.s - a.s)
        .slice(0, policy ? POLICY_EXCHANGE_POOL : params.exchangeK)
        .map((x) => x.m);
      if (policy) {
        const pr = policy.priors(r, pool);
        moves = moves.concat(pool.map((m, i) => ({ m, p: pr[i] })).sort((a, b) => b.p - a.p).slice(0, params.exchangeK).map((x) => x.m));
      } else moves = moves.concat(pool);
    }
  }
  const out: Candidates = {
    moves,
    priors: policy ? policy.priors(r, moves) : params.policyName ? moves.map(() => 1 / moves.length) : null,
  };
  if (cache.size >= (params.cacheLimit ?? DEFAULT_CACHE_LIMIT)) cache.clear();
  cache.set(sig, out);
  return out;
}

function candidates(r: RoundState, depth: number, params: SearchParams, cache: Map<string, Candidates>): Move[] {
  return candidateSet(r, depth, params, cache).moves;
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

function reward(o: Outcome, p: PlayerId, marginWeight = 0.2): number {
  return (1 - marginWeight) * o.win[p] + marginWeight * (0.5 + 0.5 * Math.tanh(o.margin[p] / 15));
}

function gamma(a: number, rng: Rng): number {
  // Marsaglia–Tsang; for a < 1 boost with U^(1/a).
  if (a < 1) return gamma(a + 1, rng) * Math.pow(rng.next() || 1e-12, 1 / a);
  const d = a - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number;
    let v: number;
    do {
      const u1 = rng.next() || 1e-12;
      x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * rng.next());
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rng.next();
    if (Math.log(u || 1e-12) < 0.5 * x * x + d - d * v + d * Math.log(v)) return d * v;
  }
}

export function dirichlet(n: number, a: number, rng: Rng): number[] {
  const g = Array.from({ length: n }, () => gamma(a, rng));
  const z = g.reduce((s, x) => s + x, 0) || 1;
  return g.map((x) => x / z);
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
  private readonly cache = new Map<string, Candidates>();
  private noise: number[] | null = null;

  /** When set, every iteration searches this one sampled world (an ensemble member) instead of resampling. */
  private readonly world: RoundState | null;
  private readonly handPool: HandPool | null;
  private readonly hiddenModel: HiddenModel | undefined;

  constructor(
    private readonly view: PlayerView,
    private readonly params: SearchParams,
    private readonly rng: Rng,
    fixedWorld = false,
  ) {
    this.handPool = params.inference ? buildHandPool(view, rng) : null;
    this.hiddenModel = beliefModel(view, params.beliefName);
    this.world = fixedWorld ? this.sample() : null;
    this.rootMoves = candidates(this.world ?? determinize(view, rng), 0, params, this.cache);
    this.root = new Node(null, 'root', other(view.me), null, []);
  }

  get cacheSize(): number {
    return this.cache.size;
  }

  private sample(): RoundState {
    const hm = this.hiddenModel;
    const forced = this.handPool ? sampleHidden(this.handPool, this.rng) : hm?.hidden?.(this.rng);
    return determinize(this.view, this.rng, forced, hm?.weights);
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
    const state = this.world ? cloneRound(this.world) : this.sample();
    let node = this.root;
    let depth = 0;
    while (!state.ended) {
      const cand = candidateSet(state, depth, params, this.cache);
      const keyed = cand.moves.map((m) => [moveKey(state, m), m] as const);

      const typicalOpp = params.opponent === 'typical' && state.current !== this.view.me;
      if (cand.priors && !typicalOpp) {
        // PUCT (AlphaZero): pick by value + prior-weighted exploration, over expanded and unexpanded moves alike.
        const cPuct = params.cPuct ?? 1.5;
        let total = 1;
        const kids = keyed.map(([k]) => node.children.find((c) => c.key === k) ?? null);
        for (const ch of kids) if (ch) total += ch.visits;
        const sqrtN = Math.sqrt(total);
        let priors = cand.priors;
        if (depth === 0 && params.rootNoise) {
          // Root moves are the same in every determinization (my hand and the market are known), so one draw fits all.
          this.noise ??= dirichlet(priors.length, 0.3, rng);
          const e = params.rootNoise;
          const nz = this.noise;
          priors = priors.map((p, j) => (1 - e) * p + e * (nz[j] ?? 0));
        }
        let bi = 0;
        let bestS = -Infinity;
        for (let j = 0; j < keyed.length; j++) {
          const ch = kids[j];
          const q = ch && ch.visits > 0 ? ch.reward / ch.visits : 0.4;
          const sc = q + (cPuct * priors[j] * sqrtN) / (1 + (ch?.visits ?? 0));
          if (sc > bestS) {
            bestS = sc;
            bi = j;
          }
        }
        const [k, m] = keyed[bi];
        let child = kids[bi];
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

      if (typicalOpp) {
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
    const smart = params.policy === 'smart';
    const hybrid = params.policy === 'hybrid';
    const late = params.phaseDeck !== undefined && (state.deck.length <= params.phaseDeck || GOODS.filter((g) => state.tokens[g].length === 0).length >= 2);
    const net = params.netName && !late ? getNet(params.netName) : null;
    const maxPlies = net ? 0 : params.phaseDeck !== undefined ? (late ? 300 : 0) : (params.rolloutPlies ?? (smart ? 16 : 300));
    const leafEval = params.evalBlend ? estimateOutcome(state, params.evalWeights) : null;
    while (!state.ended && steps++ < maxPlies) {
      const m = smart ? smartRolloutMove(state, rng) : hybrid ? (endgameMove(state) ?? rolloutMove(state, rng)) : rolloutMove(state, rng);
      applyMoveMut(state, m);
    }
    let o: Outcome = state.ended ? outcome(state) : net ? net.outcome(state) : estimateOutcome(state, params.evalWeights);
    if (leafEval) {
      const a = params.evalBlend!;
      o = {
        win: [(1 - a) * o.win[0] + a * leafEval.win[0], (1 - a) * o.win[1] + a * leafEval.win[1]],
        margin: [(1 - a) * o.margin[0] + a * leafEval.margin[0], (1 - a) * o.margin[1] + a * leafEval.margin[1]],
      };
    }
    for (let n: Node | null = node; n; n = n.parent) {
      n.visits++;
      n.reward += reward(o, n.mover, params.marginWeight);
      n.win += o.win[n.mover];
      n.margin += o.margin[n.mover];
    }
    this.iterations++;
  }

  /** Search's value of the root for the player to move (average win chance over all simulations). */
  rootValue(): number {
    let v = 0;
    let w = 0;
    for (const c of this.root.children) {
      v += c.visits;
      w += c.win;
    }
    return v > 0 ? w / v : 0.5;
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
    const mostVisited = this.root.children.reduce((a, b) => (b.visits > a.visits ? b : a));
    if (!this.params.policy || this.params.policy === 'basic') return mostVisited.move!;
    // Among well-explored moves, prefer the best average reward (breaks near-ties by margin instead of noise).
    const contenders = this.root.children.filter((c) => c.visits >= 0.6 * mostVisited.visits);
    return contenders.reduce((a, b) => (b.reward / b.visits > a.reward / a.visits ? b : a)).move!;
  }
}

/** Pick a move from merged root stats: most-visited, with near-ties broken by average reward. */
export function pickFromStats(stats: readonly RootStat[], marginWeight = 0.2): Move | null {
  if (stats.length === 0) return null;
  const top = stats.reduce((a, b) => (b.visits > a.visits ? b : a));
  const score = (s: RootStat) => (1 - marginWeight) * (s.win / s.visits) + marginWeight * (0.5 + 0.5 * Math.tanh(s.margin / s.visits / 15));
  return stats.filter((s) => s.visits >= 0.6 * top.visits).reduce((a, b) => (score(b) > score(a) ? b : a)).move;
}

/** Sum per-move root stats from several searches (keys are card-type based, so they line up across trees). */
export function mergeRootStats(all: readonly (readonly RootStat[])[]): RootStat[] {
  const acc = new Map<string, RootStat>();
  for (const stats of all) for (const s of stats) {
    const a = acc.get(s.key);
    if (a) {
      a.visits += s.visits;
      a.win += s.win;
      a.margin += s.margin;
    } else acc.set(s.key, { ...s });
  }
  return [...acc.values()];
}

export function ismcts(view: PlayerView, params: SearchParams, rng: Rng): Move {
  if (params.endgame) {
    const solved = solveEndgame(view, rng, { ...DEFAULT_ENDGAME, netName: params.netName, beliefName: params.beliefName, ...params.endgame, timeMs: params.timeMs });
    if (solved) return solved;
  }
  const trees = params.trees ?? 1;
  if (trees > 1) {
    const all: RootStat[][] = [];
    let first: Move | null = null;
    for (let i = 0; i < trees; i++) {
      const s = new IsmctsSearch(view, params, rng, true);
      if (s.rootMoves.length === 1) return s.rootMoves[0];
      first ??= s.rootMoves[0];
      s.runFor(params.timeMs / trees, params.maxIterations / trees);
      all.push(s.rootStats());
    }
    return pickFromStats(mergeRootStats(all), params.marginWeight) ?? first!;
  }
  const search = new IsmctsSearch(view, params, rng);
  if (search.rootMoves.length === 1) return search.rootMoves[0];
  search.runFor(params.timeMs, params.maxIterations);
  return search.bestMove();
}
