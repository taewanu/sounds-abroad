"use client";

import {
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";

import { type SwipeCommitConfig, decideSwipeCommit } from "./swipe-commit";

// Horizontal travel (px) past which a press is a drag, not a tap: suppresses the
// reopen-chart click and lets the rail follow the finger.
const DRAG_ENGAGE_PX = 8;
// Swipe feel, tuned by eye. Left = next; a release commits past a third of the
// width or on a fast flick, else springs back.
const SWIPE_CFG: SwipeCommitConfig = {
  commitThresholdPct: 33,
  flickToCommit: true,
  flickVelPxPerMs: 0.5,
};
// Commit slide (ease-out, no overshoot) and the spring-back on a release that
// didn't commit (a light overshoot gives it life without wobbling).
const COMMIT_MS = 260;
const COMMIT_EASE = "cubic-bezier(0.22, 0.61, 0.36, 1)";
const RETURN_MS = 232;
const RETURN_EASE = "cubic-bezier(0.34, 1.3, 0.64, 1)";
// The rail lays out prev | current | next, each the strip's full width, and
// rests shifted one card left so the current sits in the window. A commit slides
// the committed neighbour into the window as the current slides out.
export const RAIL_REST = "translateX(-100%)";
const RAIL_NEXT = "translateX(-200%)";
const RAIL_PREV = "translateX(0%)";

export interface SwipeRailOptions {
  // The stable song id of the current track; a change means the store swapped.
  contentKey: string | null;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  // Fired the instant a release commits (before the slide finishes), so the
  // caller can suppress the directional cue the coming swap would otherwise play.
  onCommitStart: () => void;
}

// Owns the mini-player's track-skip swipe: follows the finger by writing the
// rail transform straight to the DOM (never re-rendering per move), judges the
// release with the pure `decideSwipeCommit`, then slides + defers the skip. The
// gesture is a self-contained unit, kept out of the component so the render body
// stays about layout, not pointer bookkeeping.
export function useSwipeRail({
  contentKey,
  canPrev,
  canNext,
  onPrev,
  onNext,
  onCommitStart,
}: SwipeRailOptions) {
  const railRef = useRef<HTMLDivElement | null>(null);

  // Transient swipe state in refs so following the pointer never re-renders.
  // touch-pan-y (on the surface) hands horizontal drags to JS and lets vertical
  // scrolls through.
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const lastXRef = useRef(0);
  const lastTRef = useRef(0);
  const velRef = useRef(0);
  const trackingRef = useRef(false);
  const engagedRef = useRef(false);
  const swipedRef = useRef(false);
  const commitTimerRef = useRef<number | null>(null);
  // The deferred skip of an in-flight commit, held so a fresh press can decide
  // its fate (see resolvePendingCommit) instead of silently dropping it.
  const pendingCommitRef = useRef<(() => void) | null>(null);

  // A committed skip fires after the slide; drop it if the player unmounts first.
  useEffect(
    () => () => {
      if (commitTimerRef.current !== null)
        window.clearTimeout(commitTimerRef.current);
    },
    [],
  );

  // Snap the rail back to rest the moment the committed neighbour becomes the
  // current card. Runs before paint, so the reset from the commit's end position
  // is seamless and there's no flash of an off-centre rail on mount.
  useLayoutEffect(() => {
    const rail = railRef.current;
    if (rail) {
      rail.style.transition = "none";
      rail.style.transform = RAIL_REST;
    }
  }, [contentKey]);

  const settleRail = (transform: string, ms: number, ease: string) => {
    const rail = railRef.current;
    if (!rail) return;
    rail.style.transition = `transform ${ms}ms ${ease}`;
    rail.style.transform = transform;
  };

  // Run the deferred skip exactly once: the ref is nulled before the call, so
  // whichever of the timer or a re-grab fires second finds nothing and no-ops.
  const flushPendingCommit = () => {
    const skip = pendingCommitRef.current;
    pendingCommitRef.current = null;
    skip?.();
  };

  // A fresh press landed while a committed slide was still animating. Clear the
  // stale timer, then flush the interrupted commit now so it still lands: the
  // user already pushed that track off, and firing the skip swaps the store
  // before the new drag begins, which snaps the rail to rest and consumes the
  // latched cue suppression. Dropping it would leave the pushed-off track
  // showing and strand the flag.
  const resolvePendingCommit = () => {
    if (commitTimerRef.current !== null) {
      window.clearTimeout(commitTimerRef.current);
      commitTimerRef.current = null;
    }
    flushPendingCommit();
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    resolvePendingCommit();
    startXRef.current = lastXRef.current = e.clientX;
    startYRef.current = e.clientY;
    lastTRef.current = e.timeStamp;
    velRef.current = 0;
    trackingRef.current = true;
    engagedRef.current = false;
    swipedRef.current = false;
    // Drag is 1:1: drop any leftover settle transition before following.
    if (railRef.current) railRef.current.style.transition = "none";
    // Capture so a swipe that drifts off the bar still delivers its pointerup
    // here; the browser releases the capture on pointerup/cancel.
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* setPointerCapture is unsupported under jsdom; capture is best-effort */
    }
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!trackingRef.current) return;
    const dx = e.clientX - startXRef.current;
    const dy = e.clientY - startYRef.current;
    // Engage once the travel is decisively horizontal; from then on the rail
    // follows the finger and the trailing click is a swipe, not a reopen tap.
    if (!engagedRef.current) {
      if (Math.abs(dx) <= DRAG_ENGAGE_PX || Math.abs(dx) <= Math.abs(dy))
        return;
      engagedRef.current = true;
      swipedRef.current = true;
    }
    if (railRef.current)
      railRef.current.style.transform = `translateX(calc(-100% + ${dx}px))`;
    const dt = Math.max(1, e.timeStamp - lastTRef.current);
    velRef.current = (e.clientX - lastXRef.current) / dt;
    lastXRef.current = e.clientX;
    lastTRef.current = e.timeStamp;
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!trackingRef.current) return;
    trackingRef.current = false;
    if (!engagedRef.current) return;

    const outcome = decideSwipeCommit(
      {
        dx: e.clientX - startXRef.current,
        vx: velRef.current,
        // The whole bar is the swipe surface, so the threshold is a fraction of
        // the bar, not of the narrower card that visibly travels. Deliberate:
        // the bar's width is stable, while the card's flex-1 width shifts per
        // track as the commentary badge and controls come and go, which would
        // otherwise make the commit distance jitter track to track.
        width: e.currentTarget.clientWidth,
        canPrev,
        canNext,
      },
      SWIPE_CFG,
    );

    if (outcome === "cancel") {
      settleRail(RAIL_REST, RETURN_MS, RETURN_EASE);
      return;
    }

    // Slide the committed neighbour into the window as the current leaves, then
    // skip: onNext/onPrev swaps the store, the neighbour becomes the current
    // card, and the layout effect snaps the rail back to rest seamlessly. The
    // cue is suppressed so the swap doesn't re-animate what the rail just did.
    settleRail(
      outcome === "next" ? RAIL_NEXT : RAIL_PREV,
      COMMIT_MS,
      COMMIT_EASE,
    );
    onCommitStart();
    pendingCommitRef.current = outcome === "next" ? onNext : onPrev;
    commitTimerRef.current = window.setTimeout(() => {
      commitTimerRef.current = null;
      flushPendingCommit();
    }, COMMIT_MS);
  };

  const onPointerCancel = () => {
    if (!trackingRef.current) return;
    trackingRef.current = false;
    if (engagedRef.current) settleRail(RAIL_REST, RETURN_MS, RETURN_EASE);
  };

  // The swipe surface is the whole bar, so a completed swipe must swallow the
  // trailing click no matter which control it lands on (strip reopen, skip, play,
  // volume). Caught on the row in the capture phase, it never reaches the target.
  const onClickCapture = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (swipedRef.current) {
      swipedRef.current = false;
      e.stopPropagation();
      e.preventDefault();
    }
  };

  return {
    railRef,
    swipeHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      onClickCapture,
    },
  };
}
