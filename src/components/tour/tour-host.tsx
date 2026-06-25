"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useStore } from "zustand";

import type { SnapState } from "@/components/chart-sheet/sheet";
import { usePrefersReducedMotion } from "@/components/use-prefers-reduced-motion";
import { tourBridge } from "@/lib/tour-bridge";

import { TourOverlay } from "./tour-overlay";
import { initialTourState, tourReducer } from "./tour-step";
import { useSeenTour } from "./use-seen-tour";
import { useTourAnchor } from "./use-tour-anchor";

export interface TourHostProps {
  // Observed from ChartScreenInner. The sheet snap and a live preview drive
  // beats 2 and 3; the resolved country code marks a real selection in beat 1.
  // Wired when the host is mounted (the chart-screen edit), not by this file.
  snap: SnapState;
  hasCurrentTrack: boolean;
  selectedCode: string | null;
}

// Gate only. Runs once the user is known to be first-run and the globe is live,
// then hands off to the runner, which owns the step machine. Splitting keeps the
// runner's lazy reducer init from seeing a stale reduced-motion value: the runner
// mounts only after globeReady, by when matchMedia has settled.
export function TourHost({
  snap,
  hasCurrentTrack,
  selectedCode,
}: TourHostProps) {
  const reducedMotion = usePrefersReducedMotion();
  const { seen, markSeen } = useSeenTour();
  const globeReady = useStore(tourBridge, (s) => s.globeReady);
  const [dismissed, setDismissed] = useState(false);

  const handleDone = useCallback(() => {
    markSeen();
    setDismissed(true);
  }, [markSeen]);

  // Derived, not latched in an effect. seen === false is a definite first-run
  // (null means the SSR/first-paint read hasn't resolved); once dismissed it
  // stays gone. globeReady only ever turns true here, so this won't flicker.
  const active = globeReady && seen === false && !dismissed;
  if (!active) return null;
  return (
    <TourRunner
      reducedMotion={reducedMotion}
      snap={snap}
      hasCurrentTrack={hasCurrentTrack}
      selectedCode={selectedCode}
      onDone={handleDone}
    />
  );
}

interface TourRunnerProps extends TourHostProps {
  reducedMotion: boolean;
  onDone: () => void;
}

function TourRunner({
  reducedMotion,
  snap,
  hasCurrentTrack,
  selectedCode,
  onDone,
}: TourRunnerProps) {
  const [state, dispatch] = useReducer(
    tourReducer,
    reducedMotion,
    initialTourState,
  );
  const ghostFlingActive = useStore(tourBridge, (s) => s.ghostFlingActive);

  // Kick the scripted demo once on mount. Under reduced motion the machine
  // already opens in "try" with nothing to watch, so we skip the fling.
  const kickedRef = useRef(false);
  useEffect(() => {
    if (kickedRef.current) return;
    kickedRef.current = true;
    if (!reducedMotion) tourBridge.getState().requestGhostFling();
  }, [reducedMotion]);

  // Hand control from the scripted demo to the user when the ghost fling
  // settles (ghostFlingActive goes true → false). Ref-gated on the previous
  // value, like prevEndedRef in chart-screen.tsx, so only the real transition
  // fires it, not a dependency-only re-run.
  const prevGhostActiveRef = useRef(ghostFlingActive);
  useEffect(() => {
    const justSettled = prevGhostActiveRef.current && !ghostFlingActive;
    prevGhostActiveRef.current = ghostFlingActive;
    if (!justSettled) return;
    // The demo fling settling hands over to the user only during the gesture
    // beat's "watch" phase. A settle in any later beat, or once we're already in
    // "try" (the user's own fling landing), is noise — ignore it.
    if (state.beat === "gesture" && state.gesturePhase === "watch") {
      dispatch({ type: "GHOST_DONE" });
    }
  }, [ghostFlingActive, state.beat, state.gesturePhase]);

  // A real selection advances beat 1, but only after control is handed over.
  // On the first render in "try" we snapshot the baseline so the demo fling's
  // own landing isn't mistaken for the user's selection.
  const prevCodeRef = useRef(selectedCode);
  const tryArmedRef = useRef(false);
  useEffect(() => {
    if (state.beat !== "gesture" || state.gesturePhase !== "try") return;
    if (!tryArmedRef.current) {
      tryArmedRef.current = true;
      prevCodeRef.current = selectedCode;
      return;
    }
    if (selectedCode !== prevCodeRef.current) {
      prevCodeRef.current = selectedCode;
      dispatch({ type: "USER_SELECTED" });
    }
  }, [selectedCode, state.beat, state.gesturePhase]);

  // Beat 2 advances when the user pulls the sheet to full; beat 3 when a track
  // starts. Both observe, never drive — show, don't tell.
  useEffect(() => {
    if (state.beat === "sheet" && snap === "full") {
      dispatch({ type: "SHEET_OPENED" });
    }
  }, [snap, state.beat]);

  useEffect(() => {
    if (state.beat === "audio" && hasCurrentTrack) {
      dispatch({ type: "TRACK_PREVIEWED" });
    }
  }, [hasCurrentTrack, state.beat]);

  // ESC dismisses from any beat (counts as seen). Window-level, like the Space
  // play/pause handler in chart-screen.tsx.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") dispatch({ type: "SKIP" });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (state.beat === "done") onDone();
  }, [state.beat, onDone]);

  const beat = state.beat;
  const targetId =
    beat === "sheet"
      ? "chart-sheet"
      : beat === "audio" && hasCurrentTrack
        ? "mini-player"
        : null;
  // `snap` as the watch value: the sheet slides between snaps via transform,
  // which moves the spotlight target without resizing it.
  const spotlight = useTourAnchor(targetId, snap);

  if (beat === "done") return null;
  return (
    <TourOverlay
      beat={beat}
      gesturePhase={state.gesturePhase}
      spotlight={spotlight}
      passThrough={beat === "gesture"}
      isLastBeat={beat === "audio"}
      onNext={() => dispatch({ type: "NEXT" })}
      onSkip={() => dispatch({ type: "SKIP" })}
    />
  );
}
