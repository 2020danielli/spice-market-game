// Head-to-head at equal thinking time. usage: tsx scripts/duel.ts <tier> <ms> <seedStart> <rounds> [variant]
// BASELINE=live (the tier as shipped) | medium | easy | same:<variant>; NET2_PATH / POLICY_PATH / BELIEF_PATH load trained nets.
import { chooseMove, HYBRID_V2, SEARCH_PARAMS, SEARCH_PARAMS_V1 } from '../src/bots';
import { readFileSync } from 'node:fs';
import { ismcts } from '../src/bots/ismcts';
import { registerBelief, registerNet, registerPolicy } from '../src/bots/nets';
if (process.env.NET_PATH) registerNet('dev', JSON.parse(readFileSync(process.env.NET_PATH, 'utf8')));
if (process.env.POLICY_PATH) registerPolicy('devp', JSON.parse(readFileSync(process.env.POLICY_PATH, 'utf8')));
if (process.env.BELIEF_PATH) registerBelief('devb', JSON.parse(readFileSync(process.env.BELIEF_PATH, 'utf8')));
if (process.env.NET2_PATH) registerNet('dev2', JSON.parse(readFileSync(process.env.NET2_PATH, 'utf8')));
import { applyMove, newRound, playerView, Rng, scoreRound, type HistoryEntry, type PlayerId } from '../src/engine';

const [tier, msArg, seedArg, roundsArg, variant = 'current'] = process.argv.slice(2) as ['hard' | 'expert' | 'master', string, string, string, string];
const ms = Number(msArg);
const variants: Record<string, object> = {
  current: {},
  hybrid: { policy: 'hybrid', marginWeight: 0.3 },
  smartfull: { policy: 'smart', rolloutPlies: 300, marginWeight: 0.3 },
  ens5: { policy: 'hybrid', marginWeight: 0.3, trees: 5 },
  ens10: { policy: 'hybrid', marginWeight: 0.3, trees: 10 },
  evalonly: { policy: 'smart', rolloutPlies: 0, marginWeight: 0.3 },
  hyb4: { policy: 'hybrid', rolloutPlies: 4, marginWeight: 0.3 },
  hyb8: { policy: 'hybrid', rolloutPlies: 8, marginWeight: 0.3 },
  blend: { policy: 'hybrid', evalBlend: 0.5, marginWeight: 0.3 },
  phased15: { policy: 'hybrid', phaseDeck: 15, marginWeight: 0.3 },
  net: { policy: 'hybrid', netName: 'dev', marginWeight: 0.3 },
  endgame: { policy: 'hybrid', marginWeight: 0.3, endgame: {} },
  netendgame: { policy: 'hybrid', netName: 'dev', marginWeight: 0.3, endgame: {} },
  az: { policy: 'hybrid', netName: 'dev2', policyName: 'devp', cPuct: Number(process.env.CPUCT ?? 1.5), marginWeight: 0.3, endgame: {} },
  azpolicy: { policy: 'hybrid', netName: 'v1', policyName: 'devp', marginWeight: 0.3, endgame: {} },
  net2endgame: { policy: 'hybrid', netName: 'dev2', marginWeight: 0.3, endgame: {} },
  netphasedendgame: { policy: 'hybrid', netName: 'dev', phaseDeck: 12, marginWeight: 0.3, endgame: {} },
  netphased: { policy: 'hybrid', netName: 'dev', phaseDeck: 8, marginWeight: 0.3 },
  phased8: { policy: 'hybrid', phaseDeck: 8, marginWeight: 0.3 },
  ...Object.fromEntries(
    (process.env.EVAL_GRID ?? '').split(';').filter(Boolean).map((spec) => {
      // name:base:camel,potential,scale,exploration   e.g. e1:evalonly:0.8,0.4,5,0.7
      const [name, base, nums] = spec.split(':');
      const [camel, potential, scale, exploration] = nums.split(',').map(Number);
      const b = base === 'evalonly' ? { policy: 'smart', rolloutPlies: 0 } : { policy: 'hybrid', phaseDeck: Number(base.replace('phased', '')) };
      return [name, { ...b, marginWeight: 0.3, exploration, evalWeights: { camel, potential, scale } }];
    }),
  ),
};
const v2 = { ...SEARCH_PARAMS[tier], ...variants[variant], ...(process.env.BELIEF_PATH ? { beliefName: 'devb' } : {}), timeMs: ms, maxIterations: Infinity };
const B = process.env.BASELINE ?? 'v1';
const baseline = B.startsWith('same:') ? { ...SEARCH_PARAMS[tier], ...variants[B.slice(5)] } : B === 'live' ? { ...SEARCH_PARAMS[tier] } : B === 'netendgame' ? { ...SEARCH_PARAMS[tier], policy: 'hybrid' as const, netName: 'dev', marginWeight: 0.3, endgame: {} } : B === 'hybrid' ? { ...SEARCH_PARAMS[tier], ...HYBRID_V2, phaseDeck: undefined, netName: undefined, endgame: undefined } : { ...SEARCH_PARAMS_V1[tier as 'hard' | 'expert'] };
const v1 = { ...baseline, timeMs: ms, maxIterations: Infinity };
let w = 0, l = 0;
for (let g = Number(seedArg); g < Number(seedArg) + Number(roundsArg); g++) {
  const v2Seat: PlayerId = g % 2 === 0 ? 0 : 1;
  let r = newRound(70_000 + Math.floor(g / 2), (Math.floor(g / 2) % 2) as PlayerId).round;
  let seed = g * 977 + 3;
  const history: HistoryEntry[] = [];
  while (!r.ended) {
    const v = playerView(r, r.current, history);
    const s2 = seed++;
    const move = r.current === v2Seat ? ismcts(v, v2, new Rng(s2)) : B === 'medium' || B === 'easy' ? chooseMove(B, v, s2) : ismcts(v, v1, new Rng(s2));
    history.push({ before: r, move });
    r = applyMove(r, move);
  }
  const res = scoreRound(r, { camelTiebreak: false });
  if (res.sealWinner === v2Seat) w++;
  else if (res.sealWinner !== null) l++;
}
console.log(JSON.stringify({ w, l }));
