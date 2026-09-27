import { chooseMove, TIERS, type Tier } from '../src/bots';
import { applyMove, newRound, playerView, scoreRound, type PlayerId } from '../src/engine';

const [a = 'easy', b = 'medium', gamesArg = '200', scaleArg = '1'] = process.argv.slice(2);
if (!TIERS.includes(a as Tier) || !TIERS.includes(b as Tier)) {
  console.error(`usage: npm run bench -- <tierA> <tierB> [rounds=200] [budgetScale=1]   tiers: ${TIERS.join(', ')}`);
  process.exit(1);
}
const games = Number(gamesArg);
const scale = Number(scaleArg);
const wins = [0, 0];
let ties = 0;
const t0 = Date.now();

for (let g = 0; g < games; g++) {
  const aSeat: PlayerId = g % 4 < 2 ? 0 : 1;
  const seats: Tier[] = aSeat === 0 ? [a as Tier, b as Tier] : [b as Tier, a as Tier];
  let round = newRound(10_000 + g, (g % 2) as PlayerId).round;
  let seed = g * 7919 + 1;
  while (!round.ended) {
    const move = chooseMove(seats[round.current], playerView(round, round.current), seed++, scale);
    round = applyMove(round, move);
  }
  const res = scoreRound(round, { camelTiebreak: false });
  if (res.sealWinner === null) ties++;
  else wins[res.sealWinner === aSeat ? 0 : 1]++;
  if ((g + 1) % 10 === 0 || g + 1 === games) {
    const played = g + 1;
    process.stdout.write(
      `\r${played}/${games}  ${a} ${wins[0]} – ${b} ${wins[1]}  ties ${ties}  ${b} win rate ${((100 * wins[1]) / Math.max(1, played - ties)).toFixed(1)}%  (${((Date.now() - t0) / 1000).toFixed(0)}s)`,
    );
  }
}
process.stdout.write('\n');
