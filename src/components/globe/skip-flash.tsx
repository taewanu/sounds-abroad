"use client";

import { type CSSProperties, useEffect, useRef, useState } from "react";

import { SNAP_Y_PCT, type SnapState } from "@/components/chart-sheet/sheet";
import { ChevronsRightIcon } from "@/components/icons/chevrons-right";

// Tune the skip cue here: how long the chevron stays on screen and how far it
// slides toward the tapped edge. Kept brief so it confirms the skip without
// pulling the eye off the globe.
const FLASH_MS = 460;
const TRAVEL_PX = 24;

// A transient directional chevron on the tapped globe edge confirms a track
// skip (next = right, prev = left): it fades in, slides toward that edge, and
// fades out. It stays an overlay, never a globe rotation, so "skip a song" reads
// distinct from rotating to a country. Pointer-transparent so it never blocks
// the taps below it; reduced motion drops the slide for a plain opacity flash
// (handled in globals.css, matching the tour/hint idiom).
export function SkipFlash({
  skip,
  sheetSnap,
}: {
  // The chart's skip cue: `dir` is the skipped direction and `nonce` bumps per
  // skip so a repeat direction still replays. Null until the first skip. The
  // chart raises it only on a real track change, so the cue never fires on a
  // clamped end-of-list skip.
  skip: { dir: 1 | -1; nonce: number } | null;
  sheetSnap: SnapState;
}) {
  const prevNonceRef = useRef(skip?.nonce ?? null);
  const [flash, setFlash] = useState<{ dir: 1 | -1; nonce: number } | null>(
    null,
  );

  // Ref-gated so only a fresh skip (a bumped nonce) plays the cue, never a
  // dep-only re-run or the mount baseline.
  useEffect(() => {
    if (!skip || skip.nonce === prevNonceRef.current) return;
    prevNonceRef.current = skip.nonce;
    setFlash(skip);
  }, [skip]);

  // Clear after the animation; keyed on the flash so a fresh skip resets it.
  useEffect(() => {
    if (!flash) return;
    const id = window.setTimeout(() => setFlash(null), FLASH_MS);
    return () => window.clearTimeout(id);
  }, [flash]);

  if (!flash) return null;

  const isNext = flash.dir === 1;
  return (
    <div
      aria-hidden
      style={{
        // Bottom tracks the sheet: its top edge sits near SNAP_Y% of the
        // viewport, so the covered fraction below is 100 - SNAP_Y% (full covers
        // all, so bottom 0). Centers the cue on visible globe, not the viewport
        // middle the sheet crowds at peek.
        bottom: sheetSnap === "full" ? "0%" : `${100 - SNAP_Y_PCT[sheetSnap]}%`,
      }}
      className={`pointer-events-none fixed top-0 right-0 left-0 z-40 flex items-center px-5 ${
        isNext ? "justify-end" : "justify-start"
      }`}
    >
      <span
        key={flash.nonce}
        className="skip-flash text-aurora"
        style={
          {
            "--skip-flash-dur": `${FLASH_MS}ms`,
            "--skip-flash-travel": `${isNext ? TRAVEL_PX : -TRAVEL_PX}px`,
          } as CSSProperties
        }
      >
        <ChevronsRightIcon
          strokeWidth={2.5}
          className={`h-16 w-16 ${isNext ? "" : "-scale-x-100"}`}
        />
      </span>
    </div>
  );
}
