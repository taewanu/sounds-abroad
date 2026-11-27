'use client';

import { useSyncExternalStore } from 'react';

import { SNAP_Y_PCT, type SnapState } from '@/components/chart-sheet/sheet';
import { ChevronsRightIcon } from '@/components/icons/chevrons-right';
import { useCoarsePointer } from '@/components/use-coarse-pointer';

import { readRecord, subscribeRecord } from './edge-hint-record';

// SSR can't read the record; defaulting to "used" keeps the cue hidden until
// the client confirms the gesture is still unlearned, so it can only appear,
// never flash and vanish for a user who already steps.
const readUsed = () => readRecord().used;
const serverUsed = () => true;

// Faint directional chevrons at both globe margins while the globe takes taps:
// a standing reminder that tapping either half steps one country west or east.
// Touch-primary devices only, since the gesture model is designed for touch and
// a pointer already gets the hovered country's border. Retires permanently on
// the first step, via the edge-hint record. Pointer-transparent and below the sheet, so it reads
// as part of the globe backdrop, not chrome.
export function EdgeChevrons({ active, sheetSnap }: { active: boolean; sheetSnap: SnapState }) {
  const used = useSyncExternalStore(subscribeRecord, readUsed, serverUsed);
  const coarsePointer = useCoarsePointer();

  if (!active || used || !coarsePointer) return null;

  return (
    <div
      aria-hidden
      data-testid="edge-chevrons"
      style={{
        // Bottom tracks the sheet so the pair centers on the visible globe,
        // the same placement math as the skip flash.
        bottom: sheetSnap === 'full' ? '0%' : `${100 - SNAP_Y_PCT[sheetSnap]}%`,
      }}
      className="pointer-events-none fixed top-0 right-0 left-0 z-10 flex items-center justify-between px-3"
    >
      <span className="edge-chevron">
        <ChevronsRightIcon className="h-7 w-7 -scale-x-100" />
      </span>
      <span className="edge-chevron">
        <ChevronsRightIcon className="h-7 w-7" />
      </span>
    </div>
  );
}
