"use client";

import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import { ExpandIcon } from "@/components/icons/expand";
import { PauseIcon } from "@/components/icons/pause";
import { PlayIcon } from "@/components/icons/play";
import { SkipBackIcon } from "@/components/icons/skip-back";
import { SkipForwardIcon } from "@/components/icons/skip-forward";
import { useOverflowMarquee } from "@/components/use-overflow-marquee";
import { VolumeControl } from "@/components/volume-control";
import { trackKey } from "@/lib/track-identity";
import { useAudioStore } from "@/providers/audio-store-provider";

import { type SwipeCommitConfig, decideSwipeCommit } from "./swipe-commit";

export interface MiniPlayerProps {
  onTap: () => void;
  onCommentary: () => void;
  onPrev: () => void;
  onNext: () => void;
  canPrev: boolean;
  canNext: boolean;
}

// Horizontal travel (px) past which a press is a drag, not a tap: suppresses the
// reopen-chart click and lets the now-playing content follow the finger.
const DRAG_ENGAGE_PX = 8;
// Swipe feel, tuned by eye. Left = next; a release commits past a third of the
// width or on a fast flick, else springs back.
const SWIPE_CFG: SwipeCommitConfig = {
  commitThresholdPct: 33,
  flickToCommit: true,
  flickVelPxPerMs: 0.5,
};
// Commit slide: the content leaves in the swipe direction (ease-out, no
// overshoot). The incoming track slides in via the existing data-track-change
// cue, so the audio skip is deferred one commit so the two read as one motion.
const COMMIT_MS = 260;
const COMMIT_EASE = "cubic-bezier(0.22, 0.61, 0.36, 1)";
// Spring-back on a release that didn't commit: a light overshoot gives it life
// without wobbling a small element.
const RETURN_MS = 232;
const RETURN_EASE = "cubic-bezier(0.34, 1.3, 0.64, 1)";

const SKIP_BUTTON_CLASS =
  "text-fg-2 hover:bg-orbit hover:text-fg-1 focus-visible:outline-aurora flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all duration-150 ease-[var(--ease-spring)] focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-30";

export function MiniPlayer({
  onTap,
  onCommentary,
  onPrev,
  onNext,
  canPrev,
  canNext,
}: MiniPlayerProps) {
  const currentTrack = useAudioStore((s) => s.currentTrack);
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const toggle = useAudioStore((s) => s.toggle);
  const lastStep = useAudioStore((s) => s.lastStep);

  // A track change caused by a skip arrives with a fresh step nonce, and the
  // incoming content should slide in from the skip direction; a change without
  // one (a direct row tap) stays cue-free. Derived by adjusting state during
  // render (the same idiom as the sheet's country reset): an effect would both
  // flag a cascading setState and start the cue one frame after the remount.
  const contentKey = currentTrack === null ? null : trackKey(currentTrack);
  const [stepCue, setStepCue] = useState<{
    key: string | null;
    nonce: number;
    dir: "next" | "prev" | null;
  }>({ key: contentKey, nonce: lastStep?.nonce ?? 0, dir: null });
  if (
    stepCue.key !== contentKey ||
    (lastStep !== null && lastStep.nonce !== stepCue.nonce)
  ) {
    setStepCue({
      key: contentKey,
      nonce: lastStep?.nonce ?? 0,
      dir:
        lastStep !== null && lastStep.nonce !== stepCue.nonce
          ? lastStep.dir === 1
            ? "next"
            : "prev"
          : null,
    });
  }

  // The now-playing title is always the current track, so it always scrolls.
  const {
    ref: titleRef,
    active: titleScrolling,
    style: titleStyle,
  } = useOverflowMarquee<HTMLSpanElement>({
    enabled: currentTrack !== null,
    text: currentTrack?.name,
  });

  // Transient swipe state in refs so following the pointer never re-renders; the
  // content transform is written straight to the DOM node (cardRef). touch-pan-y
  // (below) hands horizontal drags to JS but can't cancel Safari's system
  // edge-swipe, so a prev-swipe begun at the very screen edge may still navigate
  // back.
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const lastXRef = useRef(0);
  const lastTRef = useRef(0);
  const velRef = useRef(0);
  const trackingRef = useRef(false);
  const engagedRef = useRef(false);
  const swipedRef = useRef(false);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const commitTimerRef = useRef<number | null>(null);

  const clearCommitTimer = () => {
    if (commitTimerRef.current !== null) {
      window.clearTimeout(commitTimerRef.current);
      commitTimerRef.current = null;
    }
  };

  // A committed skip fires after the slide; drop it if the player unmounts first.
  useEffect(
    () => () => {
      if (commitTimerRef.current !== null)
        window.clearTimeout(commitTimerRef.current);
    },
    [],
  );

  const handlePointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    clearCommitTimer();
    startXRef.current = lastXRef.current = e.clientX;
    startYRef.current = e.clientY;
    lastTRef.current = e.timeStamp;
    velRef.current = 0;
    trackingRef.current = true;
    engagedRef.current = false;
    swipedRef.current = false;
    // Drag is 1:1, so drop any leftover spring transition before following.
    if (cardRef.current) cardRef.current.style.transition = "none";
    // Capture so a swipe that drifts off the button still delivers its pointerup
    // here; the browser releases the capture on pointerup/cancel.
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* setPointerCapture is unsupported under jsdom; capture is best-effort */
    }
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!trackingRef.current) return;
    const dx = e.clientX - startXRef.current;
    const dy = e.clientY - startYRef.current;
    // Engage once the travel is decisively horizontal; from then on the content
    // follows the finger and the trailing click is a swipe, not a reopen tap.
    if (!engagedRef.current) {
      if (Math.abs(dx) <= DRAG_ENGAGE_PX || Math.abs(dx) <= Math.abs(dy))
        return;
      engagedRef.current = true;
      swipedRef.current = true;
    }
    if (cardRef.current)
      cardRef.current.style.transform = `translateX(${dx}px)`;
    const dt = Math.max(1, e.timeStamp - lastTRef.current);
    velRef.current = (e.clientX - lastXRef.current) / dt;
    lastXRef.current = e.clientX;
    lastTRef.current = e.timeStamp;
  };

  const settleCard = (transform: string, ms: number, ease: string) => {
    const card = cardRef.current;
    if (!card) return;
    card.style.transition = `transform ${ms}ms ${ease}`;
    card.style.transform = transform;
  };

  const handlePointerUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!trackingRef.current) return;
    trackingRef.current = false;
    if (!engagedRef.current) return;

    const outcome = decideSwipeCommit(
      {
        dx: e.clientX - startXRef.current,
        vx: velRef.current,
        width: e.currentTarget.clientWidth,
        canPrev,
        canNext,
      },
      SWIPE_CFG,
    );

    if (outcome === "cancel") {
      settleCard("translateX(0)", RETURN_MS, RETURN_EASE);
      return;
    }

    // Slide the outgoing content off, then skip: the remount's data-track-change
    // cue slides the new track in from the same side, so the two read as one
    // continuous motion.
    settleCard(
      `translateX(${outcome === "next" ? -100 : 100}%)`,
      COMMIT_MS,
      COMMIT_EASE,
    );
    commitTimerRef.current = window.setTimeout(() => {
      commitTimerRef.current = null;
      if (outcome === "next") onNext();
      else onPrev();
    }, COMMIT_MS);
  };

  const handlePointerCancel = () => {
    if (!trackingRef.current) return;
    trackingRef.current = false;
    if (engagedRef.current) settleCard("translateX(0)", RETURN_MS, RETURN_EASE);
  };

  const handleTap = () => {
    if (swipedRef.current) {
      swipedRef.current = false;
      return;
    }
    onTap();
  };

  if (currentTrack === null) return null;

  return (
    <div className="bg-void border-fg-1/10 shadow-sheet fixed inset-x-0 bottom-0 z-50 border-t">
      <div className="flex items-center gap-[14px] px-4 pt-3 pb-[max(env(safe-area-inset-bottom),12px)]">
        <button
          type="button"
          onClick={handleTap}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          aria-label="Reopen chart"
          className="focus-visible:outline-aurora flex min-w-0 flex-1 touch-pan-y overflow-hidden text-left transition-transform duration-150 ease-[var(--ease-spring)] focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.98]"
        >
          {/* Keyed on the stable song id so a track change remounts the content
              and restarts the cue from zero: a rapid skip drops the outgoing
              node instead of queueing, and the marquee re-measures the new
              title. The button's overflow-hidden keeps the slide from pushing
              layout. */}
          <div
            key={contentKey}
            ref={cardRef}
            data-track-change={stepCue.dir ?? undefined}
            className="flex min-w-0 flex-1 items-center gap-[14px]"
          >
            <div
              aria-hidden="true"
              style={{ backgroundImage: `url(${currentTrack.artworkUrl})` }}
              className="bg-fg-1/5 h-12 w-12 shrink-0 rounded-lg bg-cover bg-center shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sunrise text-body flex min-w-0 items-center gap-2 font-medium">
                <span className="block min-w-0 overflow-hidden">
                  <span
                    ref={titleRef}
                    className="marquee-track"
                    data-marquee={titleScrolling || undefined}
                    style={titleStyle}
                  >
                    {currentTrack.name}
                  </span>
                </span>
                <span
                  className="eq shrink-0"
                  data-paused={!isPlaying || undefined}
                  aria-hidden
                >
                  <span />
                  <span />
                  <span />
                </span>
              </p>
              <p className="text-fg-2 text-small truncate">
                {currentTrack.artist}
              </p>
            </div>
          </div>
        </button>
        {/* A sibling of the strip button, never inside it: nested buttons are
            invalid HTML and would tangle the strip's tap/swipe tracking.
            Commentary is gated per track, so the affordance renders only when
            the playing track actually carries it. */}
        {currentTrack.commentary ? (
          <button
            type="button"
            onClick={onCommentary}
            aria-label="Read why this track is trending"
            className={SKIP_BUTTON_CLASS}
          >
            <ExpandIcon className="h-4 w-4" />
          </button>
        ) : null}
        <VolumeControl />
        <button
          type="button"
          onClick={onPrev}
          disabled={!canPrev}
          aria-label="Previous track"
          className={SKIP_BUTTON_CLASS}
        >
          <SkipBackIcon className="h-[18px] w-[18px]" />
        </button>
        <button
          type="button"
          onClick={() => toggle(currentTrack)}
          aria-label={
            isPlaying
              ? `Pause preview of ${currentTrack.name}`
              : `Play preview of ${currentTrack.name}`
          }
          className="text-fg-1 hover:bg-orbit focus-visible:outline-aurora flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all duration-150 ease-[var(--ease-spring)] focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.97]"
        >
          {isPlaying ? (
            <PauseIcon className="h-4 w-4" />
          ) : (
            <PlayIcon className="h-4 w-4" />
          )}
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!canNext}
          aria-label="Next track"
          className={SKIP_BUTTON_CLASS}
        >
          <SkipForwardIcon className="h-[18px] w-[18px]" />
        </button>
      </div>
    </div>
  );
}
