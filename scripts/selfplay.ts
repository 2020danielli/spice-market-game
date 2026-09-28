// Self-play data v2: value rows (features2), policy targets (root visit shares), and compressed raw positions.
// usage: tsx scripts/selfplay.ts <seedStart> <rounds> <iterationsPerMove> <outPrefix>
// Playout-cap randomization (KataGo): FULL_FRAC of moves get the full search and are recorded as policy targets; the rest
// get a quarter of the iterations and only feed value rows. Root Dirichlet noise on full searches when a policy is loaded.
// Env: NET (bundled value net name, default v1), NET_PATH (json, registered as 'dev' and used instead), POLICY_PATH (json).
// Files: <prefix>.value3.f32 rows = FEATURE2_COUNT + win + margin/40 + q (search win chance for that player, NaN if none)
//        <prefix>.state.f32  rows = gid + FEATURE2_COUNT            (position, from the mover's view)
//        <prefix>.cand.f32   rows = gid + MOVE_FEATURE_COUNT + share (each root candidate and its visit share)
//        <prefix>.belief2.f32 rows = BELIEF2_FEATURE_COUNT + true hidden counts (6) + unseen pool counts (6), per observer
// BELIEF_PATH: play with a belief model (the search reads the opponent's moves). pos lines include the move played.
//        <prefix>.pos.jsonl.gz  one raw position per line (for re-featurizing later)
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { SEARCH_PARAMS } from '../src/bots';
import { solveEndgame } from '../src/bots/endgame';
import { hiddenSlots, unseenGoods } from '../src/bots/belief';
import { BELIEF2_FEATURE_COUNT, beliefFeatures2 } from '../src/bots/beliefJoint';
import { features2, FEATURE2_COUNT, moveFeatures, MOVE_FEATURE_COUNT } from '../src/bots/features2';
import { IsmctsSearch, moveKey, type SearchParams } from '../src/bots/ismcts';
import { registerBelief, registerNet, registerPolicy } from '../src/bots/nets';
import { applyMove, newRound, playerView, Rng, scoreRound, GOODS, type HistoryEntry, type Move, type PlayerId, type RoundState } from '../src/engine';

const [seedArg, roundsArg, itsArg, prefix] = process.argv.slice(2);
if (process.env.NET_PATH) registerNet('dev', JSON.parse(readFileSync(process.env.NET_PATH, 'utf8')));
if (process.env.BELIEF_PATH) registerBelief('devb', JSON.parse(readFileSync(process.env.BELIEF_PATH, 'utf8')));
if (process.env.POLICY_PATH) registerPolicy('devp', JSON.parse(readFileSync(process.env.POLICY_PATH, 'utf8')));
const params: SearchParams = {
  ...SEARCH_PARAMS.expert, endgame: undefined, timeMs: 1e9, maxIterations: Number(itsArg),
  policy: 'hybrid', marginWeight: 0.3, exchangeK: 30,
  netName: process.env.NET_PATH ? 'dev' : (process.env.NET ?? 'v1'),
  ...(process.env.POLICY_PATH ? { policyName: 'devp', exchangeK: 14 } : {}),
  ...(process.env.BELIEF_PATH ? { beliefName: 'devb' } : {}),
};
const FULL_FRAC = Number(process.env.FULL_FRAC ?? 0.25);
const endgameParams = { worlds: 16, depth: 4, timeMs: 500, maxDeck: 5, netName: params.netName, beliefName: params.beliefName };

for (const ext of ['value3.f32', 'state.f32', 'cand.f32', 'belief2.f32', 'pos.jsonl.gz']) writeFileSync(`${prefix}.${ext}`, Buffer.alloc(0));
let value: number[] = [], state: number[] = [], cand: number[] = [], belief: number[] = [], pos: string[] = [];
const flush = () => {
  appendFileSync(`${prefix}.value3.f32`, Buffer.from(new Float32Array(value).buffer));
  appendFileSync(`${prefix}.state.f32`, Buffer.from(new Float32Array(state).buffer));
  appendFileSync(`${prefix}.cand.f32`, Buffer.from(new Float32Array(cand).buffer));
  appendFileSync(`${prefix}.belief2.f32`, Buffer.from(new Float32Array(belief).buffer));
  if (pos.length) appendFileSync(`${prefix}.pos.jsonl.gz`, gzipSync(pos.join('\n') + '\n'));
  value = []; state = []; cand = []; belief = []; pos = [];
};

const rng = new Rng(Number(seedArg) * 13 + 7);
let gid = 0; // per-file position ids (stored as float32: must stay below 2^24)
for (let g = Number(seedArg); g < Number(seedArg) + Number(roundsArg); g++) {
  let r: RoundState = newRound(3_000_000 + g, (g % 2) as PlayerId).round;
  const positions: RoundState[] = [];
  const qs: number[] = [];
  const played: Move[] = [];
  const history: HistoryEntry[] = [];
  let seed = g * 97 + 11;
  let ply = 0;
  while (!r.ended) {
    positions.push(r);
    qs.push(NaN);
    // Belief rows: from each seat, public features vs the opponent's true unseen cards.
    for (const p of [0, 1] as PlayerId[]) {
      const bv = playerView(r, p, history);
      if (hiddenSlots(bv) <= 0) continue;
      const opp = r.players[p === 0 ? 1 : 0];
      const pool = unseenGoods(bv);
      belief.push(...beliefFeatures2(bv));
      for (const g of GOODS) belief.push(opp.hand.filter((c) => c === g).length - opp.known.filter((c) => c === g).length);
      for (const g of GOODS) belief.push(pool[g]);
    }
    const view = playerView(r, r.current, history);
    let move: Move | null = solveEndgame(view, new Rng(seed++), endgameParams);
    if (!move) {
      const full = rng.next() < FULL_FRAC;
      const sp: SearchParams = full ? { ...params, rootNoise: params.policyName ? 0.25 : undefined } : { ...params, maxIterations: Math.ceil(params.maxIterations / 4) };
      const search = new IsmctsSearch(view, sp, new Rng(seed++));
      search.runFor(1e9, sp.maxIterations);
      const stats = search.rootStats();
      const total = stats.reduce((a, s) => a + s.visits, 0) || 1;
      qs[qs.length - 1] = search.rootValue();
      if (full && search.rootMoves.length > 1) {
        const id = gid++;
        state.push(id, ...features2(r, r.current));
        for (const m of search.rootMoves) {
          const st = stats.find((s) => s.key === moveKey(r, m));
          cand.push(id, ...moveFeatures(r, m), (st?.visits ?? 0) / total);
        }
      }
      // Early in the round, sample in proportion to visits (AlphaZero-style exploration); later, play the best move.
      if (ply < 8 && stats.length) {
        let x = rng.next() * total;
        move = stats[stats.length - 1].move;
        for (const s of stats) {
          x -= s.visits;
          if (x <= 0) {
            move = s.move;
            break;
          }
        }
      } else move = search.bestMove();
    }
    history.push({ before: r, move });
    played.push(move);
    r = applyMove(r, move);
    ply++;
  }
  const res = scoreRound(r, { camelTiebreak: false });
  positions.forEach((p0, k) => {
    const q = qs[k];
    pos.push(JSON.stringify({ r: p0, move: played[k], q, winner: res.sealWinner, scores: res.scores }));
    for (const p of [0, 1] as PlayerId[]) {
      value.push(...features2(p0, p));
      value.push(res.sealWinner === p ? 1 : res.sealWinner === null ? 0.5 : 0);
      value.push((res.scores[p] - res.scores[p === 0 ? 1 : 0]) / 40);
      value.push(Number.isNaN(q) ? NaN : p === p0.current ? q : 1 - q);
    }
  });
  if ((g + 1) % 10 === 0) flush();
}
flush();
console.error(`done ${roundsArg} rounds; features ${FEATURE2_COUNT}, move features ${MOVE_FEATURE_COUNT}, belief2 ${BELIEF2_FEATURE_COUNT}`);
