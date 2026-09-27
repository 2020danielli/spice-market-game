import { describe, expect, it } from 'vitest';
import { scoreRound } from './scoring';
import { newRound } from './setup';
import type { RoundState } from './types';

function base(): RoundState {
  const { round } = newRound(3, 0);
  for (const p of round.players) {
    p.goodsTokens = [];
    p.bonusTokens = [];
    p.herd = 0;
  }
  return round;
}
const off = { camelTiebreak: false };
const on = { camelTiebreak: true };

describe('scoreRound', () => {
  it('awards the camel bonus to the larger herd only', () => {
    const r = base();
    r.players[0].herd = 3;
    r.players[1].herd = 2;
    expect(scoreRound(r, off).scores).toEqual([5, 0]);
    r.players[1].herd = 3;
    expect(scoreRound(r, off).scores).toEqual([0, 0]);
  });

  it('gives the seal to the higher score', () => {
    const r = base();
    r.players[0].goodsTokens = [5, 5];
    r.players[1].goodsTokens = [7];
    r.players[1].bonusTokens = [{ size: 3, value: 2 }];
    const res = scoreRound(r, off);
    expect(res.scores).toEqual([10, 9]);
    expect(res.sealWinner).toBe(0);
    expect(res.decidedBy).toBe('score');
  });

  it('breaks ties by bonus count, then goods count, then none', () => {
    const r = base();
    r.players[0].goodsTokens = [5, 3];
    r.players[1].goodsTokens = [5];
    r.players[1].bonusTokens = [{ size: 3, value: 3 }];
    expect(scoreRound(r, off)).toMatchObject({ sealWinner: 1, decidedBy: 'bonusCount' });
    r.players[1].bonusTokens = [];
    r.players[1].goodsTokens = [4, 4];
    expect(scoreRound(r, off)).toMatchObject({ sealWinner: null, decidedBy: 'tie' });
    r.players[1].goodsTokens = [4, 2, 2];
    expect(scoreRound(r, off)).toMatchObject({ sealWinner: 1, decidedBy: 'goodsCount' });
  });

  it('camelTiebreak house rule lets the camel holder win a tie', () => {
    const r = base();
    r.players[0].goodsTokens = [5];
    r.players[0].herd = 4;
    r.players[1].goodsTokens = [5, 3, 2];
    r.players[1].bonusTokens = [];
    // 0: 5+5 = 10, 1: 10; player 1 has more goods tokens.
    expect(scoreRound(r, off)).toMatchObject({ sealWinner: 1, decidedBy: 'goodsCount' });
    expect(scoreRound(r, on)).toMatchObject({ sealWinner: 0, decidedBy: 'camelTiebreak' });
    r.players[0].herd = 0;
    r.players[0].goodsTokens = [5, 5];
    expect(scoreRound(r, on)).toMatchObject({ sealWinner: 1, decidedBy: 'goodsCount' });
  });
});
