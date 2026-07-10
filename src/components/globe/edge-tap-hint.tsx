"use client";

import { useEffect, useState } from "react";

import type { SnapState } from "@/components/chart-sheet/sheet";
import { PointerIcon } from "@/components/icons/pointer";
import { useTourAnchor } from "@/components/tour/use-tour-anchor";
import { globeChartStore } from "@/lib/globe-chart-store";

import { edgeTapSeen } from "./seen-edge-tap-hint";

// If the user never performs the skip, retire the cue rather than let it linger
// over their listening.
const FALLBACK_MS = 6000;

// The demonstrating hand's horizontal centre; the left echo mirrors it so the
// pair stays symmetric when either moves.
const HAND_EDGE_PCT = 83.5;
const ECHO_EDGE_PCT = 100 - HAND_EDGE_PCT;

// Contextual first-encounter cue for the double-tap-either-edge skip. Unlike the
// linear onboarding tour, this waits for the moment the gesture first becomes
// usable (a track plays and the sheet is below full, so the globe edges are
// tappable), then teaches it in place. Shown once per device; the seen flag
// persists. Pointer-transparent throughout so it never intercepts the taps it
// teaches. Wordless chrome: a globe-dim / sheet-dim sandwich, two aurora edge
// rails behind the sheet, one right-edge double-tap hand with a synced left-edge
// ripple echo, and a "Double-tap either edge to skip" badge.
export function EdgeTapHint({
  active,
  snap,
}: {
  active: boolean;
  snap: SnapState;
}) {
  // Read the persisted flag once at mount, before any track plays, so it holds
  // the true prior-session value. Visibility is derived from `active`, not
  // latched in an effect.
  const [seenAtMount] = useState(() => edgeTapSeen.hasSeen());
  const [dismissed, setDismissed] = useState(false);

  const visible = active && !seenAtMount && !dismissed;

  // Measure the sheet so the sheet-dim covers exactly it, matching its rounded
  // corners. `snap` is the watch signal: the sheet slides between snaps via
  // transform, which moves its box without firing resize or scroll.
  const sheetAnchor = useTourAnchor(
    visible ? '[data-testid="chart-sheet"]' : null,
    snap,
  );

  // Mark the cue seen and retire it once its lesson lands: dismiss the instant
  // the user performs a real skip (a fresh skipIntent nonce during the show), or
  // after FALLBACK_MS if they never do. Mirrors the tour's "complete only on a
  // fresh gesture performed during the beat" rule.
  useEffect(() => {
    if (!visible) return;
    // Mark seen on show, like the prior cue: one appearance per device even if
    // the user leaves without skipping.
    edgeTapSeen.markSeen();
    const unsubscribe = globeChartStore.subscribe((state, prev) => {
      // Only a nonce change after this subscription is a fresh skip performed
      // during the show; a skip from before the cue appeared never counts.
      if (state.skipIntent.nonce !== prev.skipIntent.nonce) setDismissed(true);
    });
    const fallback = window.setTimeout(() => setDismissed(true), FALLBACK_MS);
    return () => {
      unsubscribe();
      window.clearTimeout(fallback);
    };
  }, [visible]);

  if (!visible) return null;

  const sheet = sheetAnchor?.rect;

  return (
    <>
      {/* Backdrop: globe-dim + the two aurora rails, below the sheet (z-10 <
          sheet z-20) so the sheet masks the rails' bottom with its own shape. */}
      <div
        aria-hidden
        data-testid="edge-tap-backdrop"
        className="pointer-events-none fixed inset-0 z-10"
      >
        <div className="tour-dim absolute inset-0 bg-[var(--scrim-tour)]" />
        {/* The rails fade in over the dim-in window so all three layers appear
            together; the pulse rides that fade. */}
        <div className="tour-rails">
          <div className="tour-rail tour-rail-l" />
          <div className="tour-rail tour-rail-r" />
        </div>
      </div>

      {/* Foreground: the sheet's own dim, the double-tap hand, and the badge,
          above the sheet (z-40 > sheet z-20, below the mini-player z-50). Not
          aria-hidden: it holds the status badge, the cue's a11y fallback. */}
      <div
        data-testid="edge-tap-foreground"
        className="pointer-events-none fixed inset-0 z-40"
      >
        {sheet ? (
          <div
            aria-hidden
            className="tour-dim absolute bg-[var(--scrim-tour)]"
            style={{
              left: sheet.left,
              top: sheet.top,
              width: sheet.width,
              height: sheet.height,
              borderRadius: sheetAnchor?.radius ?? 0,
            }}
          />
        ) : null}

        <div
          aria-hidden
          className="fixed -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${HAND_EDGE_PCT}%`, top: "42%" }}
        >
          <div className="tour-double-tap">
            <PointerIcon className="tour-swipe-hand" />
          </div>
        </div>

        {/* Left edge: the same double-tap ripple, no hand, in sync, so "either
            edge" is shown as well as worded. Mirrors the hand's position. */}
        <div
          aria-hidden
          data-testid="edge-tap-echo"
          className="fixed -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${ECHO_EDGE_PCT}%`, top: "42%" }}
        >
          <div className="tour-edge-echo" />
        </div>

        <div
          role="status"
          aria-live="polite"
          data-testid="edge-tap-badge"
          className="tour-badge tour-badge-breathe tour-badge-glow"
          style={{ left: "50%", top: "62%" }}
        >
          Double-tap either edge to skip
        </div>
      </div>
    </>
  );
}
