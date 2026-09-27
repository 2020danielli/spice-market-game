import { sum, type MatchState, type RoundResult, type RoundState } from '../engine';
import { BonusCoin, CamelCoin, Coin } from './Coin';

const TIEBREAK_NOTE: Record<RoundResult['decidedBy'], string> = {
  score: '',
  camelTiebreak: 'Scores tied — the camel token breaks the tie (house rule).',
  bonusCount: 'Scores tied — more bonus tokens wins.',
  goodsCount: 'Scores and bonus tokens tied — more goods tokens wins.',
  tie: 'A perfect tie — no seal awarded. The round will be replayed.',
};

const wins = (name: string) => (name === 'You' ? 'win' : 'wins');

export function RoundSummary({ round, result, names, roundNumber, seals, onNext }: {
  round: RoundState;
  result: RoundResult;
  names: [string, string];
  roundNumber: number;
  seals: [number, number];
  onNext: () => void;
}) {
  const w = result.sealWinner;
  const matchPoint = w !== null && seals[w] + 1 >= 2;
  return (
    <div className="overlay">
      <div className="modal">
        <h2>Round {roundNumber} complete</h2>
        <p className="sub">
          {w === null ? 'No seal this round.' : `${names[w]} ${wins(names[w])} a Seal of Excellence.`} {TIEBREAK_NOTE[result.decidedBy]}
        </p>
        <table className="score-table">
          <thead>
            <tr><th /><th>{names[0]}</th><th>{names[1]}</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>Goods</td>
              {round.players.map((p, i) => (
                <td key={i}>
                  <div className="coins-inline">{p.goodsTokens.map((v, j) => <Coin key={j} good={p.soldGoods[j]} value={v} size={22} />)}</div>
                  {sum(p.goodsTokens)}
                </td>
              ))}
            </tr>
            <tr>
              <td>Bonus</td>
              {round.players.map((p, i) => (
                <td key={i}>
                  <div className="coins-inline">{p.bonusTokens.map((t, j) => <BonusCoin key={j} size={t.size} value={t.value} px={24} />)}</div>
                  {sum(p.bonusTokens.map((t) => t.value))}
                </td>
              ))}
            </tr>
            <tr>
              <td>Camels</td>
              {round.players.map((p, i) => (
                <td key={i}>
                  <div className="row">{p.herd} {result.camelWinner === i && <CamelCoin px={24} />}</div>
                </td>
              ))}
            </tr>
            <tr className="total">
              <td>Total</td>
              <td>{result.scores[0]}</td>
              <td>{result.scores[1]}</td>
            </tr>
          </tbody>
        </table>
        <div className="actions">
          <button className="btn primary big" onClick={onNext} autoFocus>{matchPoint ? 'See result' : 'Next round'}</button>
        </div>
      </div>
    </div>
  );
}

export function MatchOver({ match, names, onRematch, onMenu }: {
  match: MatchState;
  names: [string, string];
  onRematch: () => void;
  onMenu: () => void;
}) {
  const w = match.winner!;
  return (
    <div className="overlay">
      <div className="modal">
        <h2>{names[w]} {wins(names[w])} the match!</h2>
        <p className="sub">Seals {match.seals[0]} – {match.seals[1]}</p>
        <table className="score-table">
          <thead>
            <tr><th>Round</th><th className="num">{names[0]}</th><th className="num">{names[1]}</th><th>Seal</th></tr>
          </thead>
          <tbody>
            {match.history.map((r, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td className="num">{r.scores[0]}</td>
                <td className="num">{r.scores[1]}</td>
                <td>{r.sealWinner === null ? '—' : names[r.sealWinner]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="actions">
          <button className="btn" onClick={onMenu}>Menu</button>
          <button className="btn primary big" onClick={onRematch} autoFocus>Rematch</button>
        </div>
      </div>
    </div>
  );
}
