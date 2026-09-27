import { useEffect, useRef } from 'react';
import { MoveGlyph } from './MoveGlyph';
import type { LogEntry } from './useMatch';

export function LogPanel({ log, names }: { log: LogEntry[]; names: [string, string] }) {
  const ref = useRef<HTMLOListElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: 'smooth' });
  }, [log.length]);
  return (
    <section className="log">
      <div className="side-head">
        <h2>Log</h2>
      </div>
      <ol ref={ref}>
        {log.map((e) => (
          <li key={e.id} className={e.player === null ? 'sys' : ''} title={e.text}>
            {e.player === null ? (
              e.text
            ) : (
              <>
                <span className={`who who-${e.player}`}>{names[e.player]}</span>
                <MoveGlyph parts={e.parts} />
              </>
            )}
          </li>
        ))}
        {log.length === 0 && <li className="sys">The market opens…</li>}
      </ol>
    </section>
  );
}
