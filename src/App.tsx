import { useState } from 'react';
import { Game } from './ui/Game';
import { Menu, randomSeed } from './ui/Menu';
import type { GameSetup } from './ui/useMatch';

export function App() {
  const [setup, setSetup] = useState<GameSetup | null>(null);
  const [gameId, setGameId] = useState(0);
  const start = (s: GameSetup) => {
    setSetup(s);
    setGameId((i) => i + 1);
  };
  if (!setup) return <Menu onStart={start} />;
  return <Game key={gameId} setup={setup} onExit={() => setSetup(null)} onRematch={() => start({ ...setup, seed: randomSeed() })} />;
}
