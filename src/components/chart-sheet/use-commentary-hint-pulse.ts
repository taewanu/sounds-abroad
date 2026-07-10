"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useStore } from "zustand";

import { tourConcluded } from "@/components/tour/tour-concluded";
import { tourBridge } from "@/lib/tour-bridge";
import { useSeenFlag } from "@/lib/use-seen-flag";

import { commentarySeen } from "./seen-commentary-hint";

// Reactive read of the tour-done gate. Unlike useSeenFlag's no-op subscribe, the
// hint outlives the tour, so it must re-render when the tour flag flips
// mid-session, not just read it once at mount.
const tourServerSnapshot = (): boolean | null => null;

// Wait a beat after the gate opens so the pulse reads as its own moment rather
// than a continuation of the just-dismissed tour.
const ARM_DELAY_MS = 600;
// Fraction of the chevron that must be on screen before it counts as seen. Above
// isIntersecting's 1px floor, so a row half-clipped at the peek snap doesn't
// trigger it.
const VISIBLE_RATIO = 0.6;
// How long the pulse attribute stays on: covers the full grow-into-bobs
// timeline, then clears so the chevron (and the reduced-motion static cue)
// returns to rest.
const PULSE_MS = 1250;

export interface CommentaryHintPulse {
  chevronRef: React.RefObject<HTMLSpanElement | null>;
  pulsing: boolean;
}

// Drives the one-time discovery pulse for the single target row. Mounted only on
// that row, so its store reads and observer cost are paid once, not per row.
export function useCommentaryHintPulse(): CommentaryHintPulse {
  const tourDone = useSyncExternalStore(
    tourConcluded.subscribe,
    tourConcluded.isConcluded,
    tourServerSnapshot,
  );
  // A capped final appearance marks the record concluded while the tour is still
  // on screen; wait for it to leave so the pulse isn't spent under the tour dim.
  const tourActive = useStore(tourBridge, (s) => s.tourActive);
  const { seen: hintSeen, markSeen } = useSeenFlag(commentarySeen);
  const chevronRef = useRef<HTMLSpanElement>(null);
  const [pulsing, setPulsing] = useState(false);

  // Both flags are booleans (null during SSR), so the effect keys off a single
  // primitive: only arm once the tour is done, off screen, and the hint hasn't
  // fired.
  const armable = tourDone === true && !tourActive && hintSeen === false;

  useEffect(() => {
    if (!armable) return;
    const el = chevronRef.current;
    if (!el) return;

    let observer: IntersectionObserver | null = null;
    const armTimer = setTimeout(() => {
      observer = new IntersectionObserver(
        ([entry]) => {
          // The initial callback on observe() reports the current ratio, so a
          // row already on screen fires here without waiting for a scroll.
          if (entry.intersectionRatio < VISIBLE_RATIO) return;
          markSeen();
          setPulsing(true);
          observer?.disconnect();
        },
        { threshold: [VISIBLE_RATIO] },
      );
      observer.observe(el);
    }, ARM_DELAY_MS);

    return () => {
      clearTimeout(armTimer);
      observer?.disconnect();
    };
  }, [armable, markSeen]);

  // Clear the pulse on its own timer, not the observer's. Firing flips `armable`
  // false (markSeen), which tears down the observer effect; bundling the reset
  // there would cancel it and strand the cue on (notably the reduced-motion
  // static ring).
  useEffect(() => {
    if (!pulsing) return;
    const timer = setTimeout(() => setPulsing(false), PULSE_MS);
    return () => clearTimeout(timer);
  }, [pulsing]);

  return { chevronRef, pulsing };
}
