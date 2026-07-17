"use client";

import { useState } from "react";

import { ExpandIcon } from "@/components/icons/expand";
import { PauseIcon } from "@/components/icons/pause";
import { PlayIcon } from "@/components/icons/play";
import { SkipBackIcon } from "@/components/icons/skip-back";
import { SkipForwardIcon } from "@/components/icons/skip-forward";
import { useOverflowMarquee } from "@/components/use-overflow-marquee";
import { VolumeControl } from "@/components/volume-control";
import type { Track } from "@/lib/chart-schema";
import { trackKey } from "@/lib/track-identity";
import { useAudioStore } from "@/providers/audio-store-provider";

import { RAIL_REST, useSwipeRail } from "./use-swipe-rail";

export interface MiniPlayerProps {
  onTap: () => void;
  onCommentary: () => void;
  onPrev: () => void;
  onNext: () => void;
  canPrev: boolean;
  canNext: boolean;
  // The adjacent playable tracks, previewed in the swipe rail so a drag shows
  // where it's heading. Null at a chart end, where the skip rolls to another
  // country instead of a plain neighbour.
  prevTrack: Track | null;
  nextTrack: Track | null;
}

const SKIP_BUTTON_CLASS =
  "text-fg-2 hover:bg-orbit hover:text-fg-1 focus-visible:outline-aurora flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all duration-150 ease-[var(--ease-spring)] focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-30";

// The 48px cover thumbnail, shared by the current card and the rail's preview
// cards so a style change stays in one place. Decorative (the a11y track text
// lives on the current card's title), so always aria-hidden.
function TrackArtwork({ url }: { url: string }) {
  return (
    <div
      aria-hidden="true"
      style={{ backgroundImage: `url(${url})` }}
      className="bg-fg-1/5 h-12 w-12 shrink-0 rounded-lg bg-cover bg-center shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
    />
  );
}

// A non-interactive preview of an adjacent track for the rail: only the current
// card carries the marquee, EQ, and a11y text, so the neighbours stay plain and
// hidden from assistive tech. Null (a chart end) renders an empty slot.
function PreviewCard({ track }: { track: Track | null }) {
  if (track === null)
    return <div className="w-full shrink-0" aria-hidden="true" />;
  return (
    <div
      aria-hidden="true"
      className="flex w-full shrink-0 items-center gap-[14px]"
    >
      <TrackArtwork url={track.artworkUrl} />
      <div className="min-w-0 flex-1">
        <p className="text-sunrise text-body truncate font-medium">
          {track.name}
        </p>
        <p className="text-fg-2 text-small truncate">{track.artist}</p>
      </div>
    </div>
  );
}

export function MiniPlayer({
  onTap,
  onCommentary,
  onPrev,
  onNext,
  canPrev,
  canNext,
  prevTrack,
  nextTrack,
}: MiniPlayerProps) {
  const currentTrack = useAudioStore((s) => s.currentTrack);
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const toggle = useAudioStore((s) => s.toggle);
  const lastStep = useAudioStore((s) => s.lastStep);

  const contentKey = currentTrack === null ? null : trackKey(currentTrack);

  // A swipe already slid the rail, so it suppresses the one-shot directional cue
  // the swap would otherwise fire, to avoid a double motion. State, not a ref, so
  // the render-time cue derivation can read it without touching a ref.
  const [suppressCue, setSuppressCue] = useState(false);

  // The 14px directional cue is for changes the rail does NOT animate itself: a
  // skip button, media keys, auto-advance. A change with a fresh step nonce that
  // wasn't a swipe slides the incoming content in from that side; a direct tap,
  // or a swipe (which already animated), stays cue-free. Derived by adjusting
  // state during render, the same idiom as the sheet's country reset.
  const [stepCue, setStepCue] = useState<{
    key: string | null;
    nonce: number;
    dir: "next" | "prev" | null;
  }>({ key: contentKey, nonce: lastStep?.nonce ?? 0, dir: null });
  if (
    stepCue.key !== contentKey ||
    (lastStep !== null && lastStep.nonce !== stepCue.nonce)
  ) {
    const fromStep = lastStep !== null && lastStep.nonce !== stepCue.nonce;
    if (suppressCue) setSuppressCue(false);
    setStepCue({
      key: contentKey,
      nonce: lastStep?.nonce ?? 0,
      dir:
        fromStep && !suppressCue
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

  const { railRef, swipeHandlers } = useSwipeRail({
    contentKey,
    canPrev,
    canNext,
    onPrev,
    onNext,
    onCommitStart: () => setSuppressCue(true),
  });

  if (currentTrack === null) return null;

  return (
    <div className="bg-void border-fg-1/10 shadow-sheet fixed inset-x-0 bottom-0 z-50 border-t">
      {/* The whole bar is the swipe surface (grab anywhere to skip); only the
          now-playing strip translates, since the controls don't change per
          track. touch-pan-y hands horizontal drags to JS and lets vertical
          scrolls through; the capture-phase click guard swallows the click a
          swipe leaves behind before it reaches any control. */}
      <div
        {...swipeHandlers}
        className="flex touch-pan-y items-center gap-[14px] px-4 pt-3 pb-[max(env(safe-area-inset-bottom),12px)]"
      >
        <button
          type="button"
          onClick={onTap}
          aria-label="Reopen chart"
          className="focus-visible:outline-aurora min-w-0 flex-1 overflow-hidden text-left focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {/* The rail: prev | current | next, each the strip's full width, so a
              drag reveals the neighbours and a commit slides one into place. The
              current card is keyed on the stable song id so a track change
              remounts it (marquee re-measures; the cue restarts from zero). */}
          <div ref={railRef} style={{ transform: RAIL_REST }} className="flex">
            <PreviewCard track={prevTrack} />
            <div
              key={contentKey}
              data-track-change={stepCue.dir ?? undefined}
              className="flex w-full shrink-0 items-center gap-[14px]"
            >
              <TrackArtwork url={currentTrack.artworkUrl} />
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
            <PreviewCard track={nextTrack} />
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
