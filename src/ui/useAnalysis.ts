import { useEffect, useMemo, useState } from 'react';
import type { OpponentModel } from '../bots/ismcts';
import type { PlayerView } from '../engine';
import { AnalysisClient, type AnalysisSnapshot } from '../worker/analysisClient';

export const ANALYSIS_MAX_MS = 60_000;

/** Streams analysis of `view` while it is non-null; a new view (position) restarts, null stops. */
export function useAnalysis(view: PlayerView | null, opponent: OpponentModel) {
  const client = useMemo(() => new AnalysisClient(), []);
  useEffect(() => () => client.dispose(), [client]);
  const [snap, setSnap] = useState<AnalysisSnapshot | null>(null);
  const [running, setRunning] = useState(false);
  const [runToken, setRunToken] = useState(0);

  useEffect(() => {
    setSnap(null);
    if (!view) {
      client.stop();
      setRunning(false);
      return;
    }
    setRunning(true);
    client.start(view, opponent, ANALYSIS_MAX_MS, (s) => {
      setSnap(s);
      if (s.done) setRunning(false);
    });
    return () => client.stop();
  }, [client, view, opponent, runToken]);

  return {
    snap,
    running,
    stop: () => {
      client.stop();
      setRunning(false);
    },
    rerun: () => setRunToken((t) => t + 1),
  };
}
