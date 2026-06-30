"use client";

import { type CSSProperties, useEffect, useRef, useState } from "react";

import { ChevronsRightIcon } from "@/components/icons/chevrons-right";
import { useGlobeChart } from "@/lib/globe-chart-store";

// Tune the skip cue here: how long the chevron stays on screen and how far it
// slides toward the tapped edge. Kept brief so it confirms the skip without
// pulling the eye off the globe.
const FLASH_MS = 340;
const TRAVEL_PX = 20;

// A transient directional chevron on the tapped globe edge confirms a track
// skip (next = right, prev = left): it fades in, slides toward that edge, and
// fades out. It stays an overlay, never a globe rotation, so "skip a song" reads
// distinct from rotating to a country. Pointer-transparent so it never blocks
// the taps below it; reduced motion drops the slide for a plain opacity flash
// (handled in globals.css, matching the tour/hint idiom).
export function SkipFlash() {
  const skipSignal = useGlobeChart((s) => s.skipSignal);
  const prevNonceRef = useRef(skipSignal.nonce);
  const [flash, setFlash] = useState<{ dir: 1 | -1; nonce: number } | null>(
    null,
  );

  // Ref-gated so only an actual skip (a bumped nonce) plays the cue, never a
  // dep-only re-run or the mount baseline.
  useEffect(() => {
    if (skipSignal.nonce === prevNonceRef.current) return;
    prevNonceRef.current = skipSignal.nonce;
    setFlash({ dir: skipSignal.dir, nonce: skipSignal.nonce });
  }, [skipSignal]);

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
      className={`pointer-events-none fixed inset-y-0 right-0 left-0 z-40 flex items-center px-5 ${
        isNext ? "justify-end" : "justify-start"
      }`}
    >
      <span
        key={flash.nonce}
        data-dir={isNext ? "next" : "prev"}
        className="skip-flash text-sunrise"
        style={
          {
            "--skip-flash-dur": `${FLASH_MS}ms`,
            "--skip-flash-travel": `${TRAVEL_PX}px`,
          } as CSSProperties
        }
      >
        <ChevronsRightIcon
          className={`h-10 w-10 ${isNext ? "" : "-scale-x-100"}`}
        />
      </span>
    </div>
  );
}
