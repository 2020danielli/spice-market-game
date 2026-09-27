import { sum } from './cards';
import { CAMEL_BONUS, type MatchConfig, type PlayerId, type RoundResult, type RoundState } from './types';

function leader(x: [number, number]): PlayerId | null {
  return x[0] > x[1] ? 0 : x[1] > x[0] ? 1 : null;
}

export function scoreRound(r: RoundState, config: MatchConfig): RoundResult {
  const [a, b] = r.players;
  const camelWinner: PlayerId | null = a.herd > b.herd ? 0 : b.herd > a.herd ? 1 : null;
  const scores = r.players.map(
    (p, i) => sum(p.goodsTokens) + sum(p.bonusTokens.map((t) => t.value)) + (camelWinner === i ? CAMEL_BONUS : 0),
  ) as [number, number];
  const bonusCounts: [number, number] = [a.bonusTokens.length, b.bonusTokens.length];
  const goodsCounts: [number, number] = [a.goodsTokens.length, b.goodsTokens.length];
  const base = { scores, camelWinner, bonusCounts, goodsCounts };
  let w = leader(scores);
  if (w !== null) return { ...base, sealWinner: w, decidedBy: 'score' };
  if (config.camelTiebreak && camelWinner !== null) return { ...base, sealWinner: camelWinner, decidedBy: 'camelTiebreak' };
  w = leader(bonusCounts);
  if (w !== null) return { ...base, sealWinner: w, decidedBy: 'bonusCount' };
  w = leader(goodsCounts);
  if (w !== null) return { ...base, sealWinner: w, decidedBy: 'goodsCount' };
  return { ...base, sealWinner: null, decidedBy: 'tie' };
}
