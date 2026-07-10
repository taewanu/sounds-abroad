"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useStore } from "zustand";

import type { SnapState } from "@/components/chart-sheet/sheet";
import { globeChartStore, useGlobeChart } from "@/lib/globe-chart-store";
import { tourBridge } from "@/lib/tour-bridge";
import { useSeenFlag } from "@/lib/use-seen-flag";

import { tourSeen } from "./seen-tour";
import { TourOverlay } from "./tour-overlay";
import { initialTourState, tourReducer } from "./tour-step";
import { useTourAnchor } from "./use-tour-anchor";

export interface TourHostProps {
  // Observed from ChartScreenInner. The sheet snap and the previewing track's
  // identity drive beats 2 and 3; the resolved country code marks a real
  // selection in beat 1. Wired when the host is mounted (the chart-screen
  // edit), not by this file.
  snap: SnapState;
  // The previewing track's id, or null when nothing plays. An id (not a
  // boolean) so the audio beat can baseline what was already playing on entry
  // and complete only on a fresh preview, never on a track from before the beat.
  currentTrackId: string | null;
  selectedCode: string | null;
}

// Gate only. Runs once the user is known to be first-run and the globe is live,
// then hands off to the runner, which owns the step machine.
export function TourHost({
  snap,
  currentTrackId,
  selectedCode,
}: TourHostProps) {
  const { seen, markSeen } = useSeenFlag(tourSeen);
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
      snap={snap}
      currentTrackId={currentTrackId}
      selectedCode={selectedCode}
      onDone={handleDone}
    />
  );
}

interface TourRunnerProps extends TourHostProps {
  onDone: () => void;
}

function TourRunner({
  snap,
  currentTrackId,
  selectedCode,
  onDone,
}: TourRunnerProps) {
  const [state, dispatch] = useReducer(tourReducer, initialTourState());

  // Beat 1: hide the demo hand the instant the user grabs the globe (a flick is
  // starting), not when it settles seconds later. The hand is a "do this" cue;
  // once they're doing it, it's in the way. A grab that settles back without
  // travelling brings the hand back (the settle reset below), so a stray tap
  // doesn't strand them with no hint and no Next.
  const [engaged, setEngaged] = useState(false);
  useEffect(() => {
    if (state.beat !== "gesture") return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      // Engage on a globe grab, not on the other interactive surfaces in view:
      // a tap on the badge, the X, or the peek sheet isn't the user flicking.
      if (
        target?.closest(
          '[data-testid="tour-badge"], [data-testid="chart-sheet"]',
        )
      )
        return;
      setEngaged(true);
    };
    window.addEventListener("pointerdown", onDown, {
      capture: true,
      passive: true,
    });
    return () =>
      window.removeEventListener("pointerdown", onDown, { capture: true });
  }, [state.beat]);

  // A settle ends the spin: if it changed the country the gesture beat advances
  // (the hand is already gone); if not, re-arm the hand. Ref-gated so the mount
  // value and dep-only re-runs don't reset it.
  const settleSignal = useGlobeChart((s) => s.settleSignal);
  const prevSettleRef = useRef(settleSignal);
  useEffect(() => {
    if (settleSignal === prevSettleRef.current) return;
    prevSettleRef.current = settleSignal;
    setEngaged(false);
  }, [settleSignal]);

  // Beat 3: hold the track glow until the sheet finishes rising. The sheet
  // slides to full via a transform transition; anchoring the spotlight to a row
  // mid-slide drags the glow up with it. Gate on the sheet's transform
  // transitionend (with a timeout fallback if it never fires) so the glow only
  // appears once the row is at rest.
  // Starts false and only ever flips true (below); the tour is linear, so audio
  // is entered exactly once and never needs resetting back to false.
  const [sheetSettled, setSheetSettled] = useState(false);
  useEffect(() => {
    if (state.beat !== "audio") return;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      setSheetSettled(true);
    };
    const onEnd = (e: TransitionEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        e.propertyName === "transform" &&
        target?.getAttribute("data-testid") === "chart-sheet"
      ) {
        finish();
      }
    };
    window.addEventListener("transitionend", onEnd, true);
    const fallback = window.setTimeout(finish, 420);
    return () => {
      window.removeEventListener("transitionend", onEnd, true);
      window.clearTimeout(fallback);
    };
  }, [state.beat]);

  // The user's first selection (a flick, or a pick from the a11y list) advances
  // the gesture beat: doing the gesture is the advance. On the first render we
  // snapshot the baseline so the country the globe loaded on isn't mistaken for
  // that selection.
  const prevCodeRef = useRef(selectedCode);
  const tryArmedRef = useRef(false);
  useEffect(() => {
    if (state.beat !== "gesture") return;
    if (!tryArmedRef.current) {
      tryArmedRef.current = true;
      prevCodeRef.current = selectedCode;
      return;
    }
    if (selectedCode !== prevCodeRef.current) {
      prevCodeRef.current = selectedCode;
      // A bare globe tap-select changes the country but is not the flick this
      // beat teaches, so an accidental tap must not skip it. A real fling or a
      // deliberate list pick (both leave lastSettleViaTap false) still advances.
      if (globeChartStore.getState().lastSettleViaTap) return;
      dispatch({ type: "USER_SELECTED" });
    }
  }, [selectedCode, state.beat]);

  // Beat 2 advances when the user pulls the sheet to full; beat 3 when a track
  // starts. Both observe, never drive. Show, don't tell.
  useEffect(() => {
    if (state.beat === "sheet" && snap === "full") {
      dispatch({ type: "SHEET_OPENED" });
    }
  }, [snap, state.beat]);

  // Beat 3 baselines whatever is already previewing when it opens, so a track
  // played earlier (even an accidental tap during beats 1-2) never auto-skips
  // the "tap a track" teaching. Only a fresh preview started during the beat
  // advances. Mirrors the gesture beat's baseline snapshot above.
  const audioBaselineRef = useRef<string | null>(null);
  const audioArmedRef = useRef(false);
  useEffect(() => {
    if (state.beat !== "audio") return;
    if (!audioArmedRef.current) {
      audioArmedRef.current = true;
      audioBaselineRef.current = currentTrackId;
      return;
    }
    if (
      currentTrackId !== null &&
      currentTrackId !== audioBaselineRef.current
    ) {
      dispatch({ type: "TRACK_PREVIEWED" });
    }
  }, [currentTrackId, state.beat]);

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
  // Beat 2 frames the whole sheet; beat 3 frames the first track row (the thing
  // to tap), selected by its rank attribute so it needs no id of its own.
  const targetSelector =
    beat === "sheet"
      ? '[data-testid="chart-sheet"]'
      : beat === "audio"
        ? '[data-testid="chart-sheet"] li[data-rank="1"]'
        : null;
  // `snap` as the watch value: the sheet slides between snaps via transform,
  // which moves the spotlight target without resizing it.
  const anchor = useTourAnchor(targetSelector, snap);

  // The audio beat withholds its spotlight until the sheet has settled (above);
  // every other beat shows it as soon as it's measured.
  const spotlightReady = beat !== "audio" || sheetSettled;

  if (beat === "done") return null;
  return (
    <TourOverlay
      beat={beat}
      spotlight={spotlightReady ? (anchor?.rect ?? null) : null}
      spotlightRadius={anchor?.radius ?? 0}
      hideFlickHint={engaged}
      onSkip={() => dispatch({ type: "SKIP" })}
    />
  );
}
