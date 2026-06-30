"use client";

import { type PointerEvent as ReactPointerEvent, useRef } from "react";

import { PauseIcon } from "@/components/icons/pause";
import { PlayIcon } from "@/components/icons/play";
import { SkipBackIcon } from "@/components/icons/skip-back";
import { SkipForwardIcon } from "@/components/icons/skip-forward";
import { useOverflowMarquee } from "@/components/use-overflow-marquee";
import { VolumeControl } from "@/components/volume-control";
import { useAudioStore } from "@/providers/audio-store-provider";

export interface MiniPlayerProps {
  onTap: () => void;
  onPrev: () => void;
  onNext: () => void;
  canPrev: boolean;
  canNext: boolean;
}

// Horizontal pointer travel (px) that turns a press on the now-playing area into
// a skip swipe instead of a tap that reopens the chart.
const SWIPE_THRESHOLD_PX = 40;

const SKIP_BUTTON_CLASS =
  "text-fg-2 hover:bg-orbit hover:text-fg-1 focus-visible:outline-aurora flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all duration-150 ease-[var(--ease-spring)] focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-30";

export function MiniPlayer({
  onTap,
  onPrev,
  onNext,
  canPrev,
  canNext,
}: MiniPlayerProps) {
  const currentTrack = useAudioStore((s) => s.currentTrack);
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const toggle = useAudioStore((s) => s.toggle);

  // The now-playing title is always the current track, so it always scrolls.
  const {
    ref: titleRef,
    active: titleScrolling,
    style: titleStyle,
  } = useOverflowMarquee<HTMLSpanElement>({
    enabled: currentTrack !== null,
    text: currentTrack?.name,
  });

  // Transient swipe state in refs so tracking the pointer never re-renders.
  // touch-pan-y (below) hands horizontal drags to JS but can't cancel Safari's
  // system edge-swipe, so a prev-swipe begun at the very screen edge may still
  // navigate back.
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const trackingRef = useRef(false);
  const swipedRef = useRef(false);

  const handlePointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    startXRef.current = e.clientX;
    startYRef.current = e.clientY;
    trackingRef.current = true;
    swipedRef.current = false;
    // Capture so a swipe that drifts off the button still delivers its pointerup
    // here; the browser releases the capture on pointerup/cancel.
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* setPointerCapture is unsupported under jsdom; capture is best-effort */
    }
  };

  const handlePointerUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!trackingRef.current) return;
    trackingRef.current = false;
    const dx = e.clientX - startXRef.current;
    const dy = e.clientY - startYRef.current;
    if (Math.abs(dx) <= SWIPE_THRESHOLD_PX || Math.abs(dx) <= Math.abs(dy)) {
      return;
    }
    // A swipe fired: flag it so the click that follows doesn't also reopen.
    swipedRef.current = true;
    if (dx < 0) onNext();
    else onPrev();
  };

  const handlePointerCancel = () => {
    trackingRef.current = false;
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
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          aria-label="Reopen chart"
          className="focus-visible:outline-aurora flex min-w-0 flex-1 touch-pan-y items-center gap-[14px] text-left transition-transform duration-150 ease-[var(--ease-spring)] focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.98]"
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
        </button>
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
