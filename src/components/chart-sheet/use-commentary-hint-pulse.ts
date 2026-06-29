"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { hasSeenTour, subscribeSeenTour } from "@/components/tour/seen-tour";

import { useCommentaryHintSeen } from "./use-commentary-hint-seen";

// Reactive read of the tour-done gate. Unlike useSeenTour's no-op subscribe,
// the hint outlives the tour, so it must re-render when markTourSeen flips the
// flag mid-session, not just read it once at mount.
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
  const tourSeen = useSyncExternalStore(
    subscribeSeenTour,
    hasSeenTour,
    tourServerSnapshot,
  );
  const { seen: hintSeen, markSeen } = useCommentaryHintSeen();
  const chevronRef = useRef<HTMLSpanElement>(null);
  const [pulsing, setPulsing] = useState(false);

  // Both flags are booleans (null during SSR), so the effect keys off a single
  // primitive: only arm once the tour is done and the hint hasn't fired.
  const armable = tourSeen === true && hintSeen === false;

  useEffect(() => {
    if (!armable) return;
    const el = chevronRef.current;
    if (!el) return;

    let observer: IntersectionObserver | null = null;
    let clearTimer: ReturnType<typeof setTimeout> | null = null;

    const armTimer = setTimeout(() => {
      observer = new IntersectionObserver(
        ([entry]) => {
          // The initial callback on observe() reports the current ratio, so a
          // row already on screen fires here without waiting for a scroll.
          if (entry.intersectionRatio < VISIBLE_RATIO) return;
          markSeen();
          setPulsing(true);
          observer?.disconnect();
          clearTimer = setTimeout(() => setPulsing(false), PULSE_MS);
        },
        { threshold: [VISIBLE_RATIO] },
      );
      observer.observe(el);
    }, ARM_DELAY_MS);

    return () => {
      clearTimeout(armTimer);
      if (clearTimer) clearTimeout(clearTimer);
      observer?.disconnect();
    };
  }, [armable, markSeen]);

  return { chevronRef, pulsing };
}
