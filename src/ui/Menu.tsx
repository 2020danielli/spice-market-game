import { useState } from 'react';
import { TIER_INFO, TIERS, type Tier } from '../bots';
import { CardView } from './CardView';
import type { GameSetup } from './useMatch';

export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

function seedFrom(text: string): number {
  const t = text.trim();
  if (/^\d+$/.test(t)) return Number(t) | 0;
  let h = 2166136261;
  for (const ch of t) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h | 0;
}

function TierPicker({ value, onChange }: { value: Tier; onChange: (t: Tier) => void }) {
  return (
    <div className="tier-grid">
      {TIERS.map((t) => (
        <button key={t} className={`tier-card ${value === t ? 'on' : ''}`} onClick={() => onChange(t)}>
          <b>{TIER_INFO[t].label}</b>
          <span>{TIER_INFO[t].blurb}</span>
        </button>
      ))}
    </div>
  );
}

export function Menu({ onStart }: { onStart: (s: GameSetup) => void }) {
  const [mode, setMode] = useState<'play' | 'watch'>('play');
  const [tier, setTier] = useState<Tier>('medium');
  const [south, setSouth] = useState<Tier>('hard');
  const [north, setNorth] = useState<Tier>('medium');
  const [camelTiebreak, setCamelTiebreak] = useState(true);
  const [showKnown, setShowKnown] = useState(false);
  const [seedText, setSeedText] = useState('');

  const start = () => {
    const seed = seedText.trim() ? seedFrom(seedText) : randomSeed();
    onStart({
      seats: mode === 'play' ? [{ kind: 'human' }, { kind: 'bot', tier }] : [{ kind: 'bot', tier: south }, { kind: 'bot', tier: north }],
      config: { camelTiebreak },
      seed,
      showKnown,
    });
  };

  return (
    <div className="menu">
      <div className="menu-hero">
        <div className="hero-cards">
          {(['diamond', 'gold', 'camel'] as const).map((c, i) => (
            <div key={c} style={{ ['--r' as string]: `${(i - 1) * 10}deg` }}>
              <CardView card={c} />
            </div>
          ))}
        </div>
        <div>
          <h1>Spice Market</h1>
          <p>Trade goods, herd camels, earn two Seals of Excellence.</p>
        </div>
      </div>

      <div className="panel">
        <div className="row" style={{ marginBottom: 14 }}>
          <div className="segmented">
            <button className={mode === 'play' ? 'on' : ''} onClick={() => setMode('play')}>Play vs bot</button>
            <button className={mode === 'watch' ? 'on' : ''} onClick={() => setMode('watch')}>Watch bots</button>
          </div>
        </div>
        {mode === 'play' ? (
          <>
            <h2>Opponent</h2>
            <TierPicker value={tier} onChange={setTier} />
          </>
        ) : (
          <div className="watch-grid">
            <div>
              <h2>North</h2>
              <TierPicker value={north} onChange={setNorth} />
            </div>
            <div>
              <h2>South</h2>
              <TierPicker value={south} onChange={setSouth} />
            </div>
          </div>
        )}
        <label className="field">
          <input type="checkbox" checked={showKnown} onChange={(e) => setShowKnown(e.target.checked)} />
          Show cards you’ve seen them take (face-up, marked with an eye)
        </label>
        <label className="field">
          <input type="checkbox" checked={camelTiebreak} onChange={(e) => setCamelTiebreak(e.target.checked)} />
          House rule: on a tied score, the camel-token holder wins the seal
        </label>
        <label className="field">
          Seed
          <input type="text" placeholder="random" value={seedText} onChange={(e) => setSeedText(e.target.value)} />
        </label>
        <div className="row" style={{ marginTop: 18 }}>
          <button className="btn primary big" onClick={start}>{mode === 'play' ? 'Start match' : 'Start watching'}</button>
        </div>
      </div>

      <details className="panel rules">
        <summary>About the bots</summary>
        <p>
          Every bot sees only what a player at the table could see: your hand stays hidden, and the search bots count the
          cards that have gone by to guess what you and the deck are holding.
        </p>
        <table className="bot-table">
          <thead>
            <tr><th>Bot</th><th>How it decides</th><th>Thinks for</th><th>Strength</th></tr>
          </thead>
          <tbody>
            <tr><td><b>Easy</b></td><td>A third of the time plays like Medium, otherwise a random move.</td><td>instant</td><td>For learning the rules.</td></tr>
            <tr><td><b>Medium</b></td><td>Scores every move with one formula (set values, camels, what the market leaves you) and plays the best.</td><td>instant</td><td>Solid, but never plans ahead.</td></tr>
            <tr><td><b>Hard</b></td><td>Searches thousands of possible futures (Monte Carlo tree search over guesses of the hidden cards). Early in the round it scores positions with a quick formula; near the end it plays each line out, with endgame rules: it ends the round when that wins it and cashes in when you could end it.</td><td>~1 s</td><td>Beats Medium ~7 rounds in 10.</td></tr>
            <tr><td><b>Expert</b></td><td>Searches with a neural network that learned to judge positions from hundreds of thousands of self-play positions, and solves the endgame exactly (it samples your likely hands and calculates every line to the end).</td><td>~4 s</td><td>Beats the previous Expert ~56–71% and Medium 92%.</td></tr>
            <tr><td><b>Master</b></td><td>Expert's search spread over several CPU cores, with twice the time.</td><td>~8 s</td><td>Beats Expert slightly; the strongest before Grandmaster.</td></tr>
            <tr><td><b>Grandmaster</b></td><td>AlphaZero-style, trained over three rounds of self-play: a network suggests which moves to search first, a stronger position network judges them, and a third network reads your hand from how you've played this round (what you took, passed on, traded and sold) to guess your hidden cards. Solves the endgame exactly.</td><td>~8 s</td><td>The strongest: beats Master 62% of rounds (65–39) and Medium 92%. The game has real luck, so it still drops rounds — play best of 3.</td></tr>
          </tbody>
        </table>
        <p className="muted small">
          Measured in bot-vs-bot rounds. Even perfect play loses some rounds to the draw, so no bot wins every time — take a
          best-of-3 over a single round.
        </p>
      </details>

      <details className="panel rules">
        <summary>How to play</summary>
        <p>
          On your turn do <b>one</b> thing: <b>take</b> one good from the market (max 7 cards in hand), <b>take all camels</b>,
          <b> exchange</b> 2+ market goods for the same number of your goods and/or camels (never the same type both ways), or
          <b> sell</b> any number of one good. Diamonds, gold and silver sell in 2s or more. Sales take the top tokens of that good;
          selling 3, 4 or 5+ also earns a hidden bonus token.
        </p>
        <p>
          The round ends when three token piles are empty or the deck runs out. The bigger herd earns the 5-rupee camel token.
          The richer merchant earns a Seal of Excellence — first to two wins.
        </p>
      </details>
    </div>
  );
}
