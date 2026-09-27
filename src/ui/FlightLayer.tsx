import { motion } from 'framer-motion';
import { useLayoutEffect, useState } from 'react';
import type { Flight, Popup } from './animation';
import { CardBack, CardFace } from './art';
import { BonusCoin, Coin } from './Coin';
import type { ActiveAnimation } from './useMatch';

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function boxOf(anchor: string): Box | null {
  const el = document.querySelector(`[data-anchor="${anchor}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

const EASE = [0.25, 0.8, 0.25, 1] as const;
const COIN = 28;

function FlightView({ f, scale }: { f: Flight; scale: number }) {
  const [boxes, setBoxes] = useState<[Box, Box] | null>(null);
  useLayoutEffect(() => {
    const a = boxOf(f.from);
    const b = boxOf(f.to);
    if (a && b) setBoxes([a, b]);
  }, [f]);
  if (!boxes) return null;
  const [a, b] = boxes;
  const coin = f.visual.kind !== 'card';
  // Coins keep one size and travel centre to centre; cards morph between the two card sizes.
  const at = (x: Box) =>
    coin ? { x: x.x + x.w / 2 - COIN / 2, y: x.y + x.h / 2 - COIN / 2, width: COIN, height: COIN } : { x: x.x, y: x.y, width: x.w, height: x.h };
  const v = f.visual;
  return (
    <motion.div
      className="flight"
      initial={{ ...at(a), opacity: 1, scale: 1 }}
      animate={{ ...at(b), opacity: f.fade ? 0 : 1, scale: f.fade ? 0.6 : 1 }}
      transition={{ delay: (f.delay / 1000) * scale, duration: (f.duration / 1000) * scale, ease: EASE }}
    >
      {v.kind === 'card' ? (
        v.card === 'back' ? <CardBack /> : <CardFace card={v.card} />
      ) : v.kind === 'coin' ? (
        <Coin good={v.good} value={v.value} size="100%" />
      ) : (
        <BonusCoin size={v.size} px="100%" />
      )}
    </motion.div>
  );
}

function PopupView({ p, scale }: { p: Popup; scale: number }) {
  const [box, setBox] = useState<Box | null>(null);
  useLayoutEffect(() => setBox(boxOf(p.anchor)), [p]);
  if (!box) return null;
  return (
    <motion.div
      className="popup"
      initial={{ x: box.x - 70, y: box.y - 8, opacity: 0 }}
      animate={{ y: box.y - 52, opacity: [0, 1, 1, 0] }}
      transition={{ delay: (p.delay / 1000) * scale, duration: 0.7 * scale, times: [0, 0.2, 0.75, 1] }}
    >
      {p.text}
    </motion.div>
  );
}

/** Fixed overlay that flies copies of cards and coins between `data-anchor` elements. */
export function FlightLayer({ anim, scale }: { anim: ActiveAnimation | null; scale: number }) {
  if (!anim || anim.stage === 'highlight') return null;
  const flights = anim.stage === 'flying' ? anim.plan.flights : anim.plan.refill;
  const popups = anim.stage === 'flying' ? anim.plan.popups : [];
  return (
    <div className="flight-layer">
      {flights.map((f) => (
        <FlightView key={`${anim.stage}-${f.id}`} f={f} scale={scale} />
      ))}
      {popups.map((p, i) => (
        <PopupView key={`p${i}`} p={p} scale={scale} />
      ))}
    </div>
  );
}
