'use client';

import { useEffect, useEffectEvent } from 'react';

// Stacking order of the overlays Escape can close, lowest first. A rank, not
// activation order, decides who is on top: a layer can activate after one that
// covers it, as the sheet does when it rises during the tour.
export const ESCAPE_LAYER = {
  sheet: 0,
  card: 1,
  popover: 2,
  tour: 3,
} as const;

type EscapeRank = (typeof ESCAPE_LAYER)[keyof typeof ESCAPE_LAYER];

interface Layer {
  rank: EscapeRank;
  onEscape: (e: KeyboardEvent) => void;
}

const layers: Layer[] = [];

// Equal ranks go to the most recently activated layer.
function topLayer(): Layer | undefined {
  let top: Layer | undefined;
  for (const layer of layers) {
    if (!top || layer.rank >= top.rank) top = layer;
  }
  return top;
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') topLayer()?.onEscape(e);
}

/** Whether an open layer outranks `rank`, so the next Escape belongs to it. */
export function isEscapeLayerAbove(rank: EscapeRank) {
  return layers.some((layer) => layer.rank > rank);
}

/** While `active`, Escape reaches `onEscape` only if no higher layer is open. */
export function useEscapeLayer(
  active: boolean,
  rank: EscapeRank,
  onEscape: (e: KeyboardEvent) => void,
) {
  const handleEscape = useEffectEvent(onEscape);
  useEffect(() => {
    if (!active) return;
    const layer: Layer = { rank, onEscape: (e) => handleEscape(e) };
    layers.push(layer);
    if (layers.length === 1) window.addEventListener('keydown', onKeyDown);
    return () => {
      layers.splice(layers.indexOf(layer), 1);
      if (layers.length === 0) window.removeEventListener('keydown', onKeyDown);
    };
  }, [active, rank]);
}
