"use client";

import { type CSSProperties } from "react";

import type { Beat, GesturePhase } from "./tour-step";

// "done" never renders an overlay; the host unmounts at that point.
export type VisibleBeat = Exclude<Beat, "done">;

export interface TourOverlayProps {
  beat: VisibleBeat;
  gesturePhase: GesturePhase;
  // Screen box to spotlight, or null for a full-screen beat (the gesture beat
  // has no cutout — the whole globe is the target) or before the box is read.
  spotlight: DOMRect | null;
  // The gesture beat lets flings reach the globe, so its scrim must not capture
  // pointer events; the sheet/audio beats dim and block everything but the hole.
  passThrough: boolean;
  isLastBeat: boolean;
  onNext: () => void;
  onSkip: () => void;
}

// Working copy. Final wording is a polish pass (design-skill + step-back-as-user
// gate); the intent per beat is fixed, the phrasing is not. The "try" line names
// the non-gesture path so a keyboard/SR user is never told to do only a fling.
function calloutCopy(
  beat: VisibleBeat,
  phase: GesturePhase,
): { eyebrow: string; body: string } {
  switch (beat) {
    case "gesture":
      return phase === "watch"
        ? { eyebrow: "Watch", body: "The globe flings to a new country." }
        : {
            eyebrow: "Now you try",
            body: "Fling the globe to travel — or pick a country from the list.",
          };
    case "sheet":
      return {
        eyebrow: "The full chart",
        body: "Pull the panel up to see every track.",
      };
    case "audio":
      return {
        eyebrow: "Preview",
        body: "Tap a track to hear it — playback follows you as you explore.",
      };
  }
}

const SPOTLIGHT_PAD = 8;

// Frame the spotlight with four opaque strips instead of an SVG mask: cheaper,
// and the hole between them is genuinely empty, so pointer-events pass straight
// through to the target with no masking tricks.
function scrimStrips(hole: Rect): { key: string; style: CSSProperties }[] {
  return [
    { key: "top", style: { top: 0, left: 0, right: 0, height: hole.top } },
    {
      key: "bottom",
      style: { top: hole.bottom, left: 0, right: 0, bottom: 0 },
    },
    {
      key: "left",
      style: { top: hole.top, left: 0, width: hole.left, height: hole.height },
    },
    {
      key: "right",
      style: { top: hole.top, left: hole.right, right: 0, height: hole.height },
    },
  ];
}

interface Rect {
  top: number;
  left: number;
  right: number;
  bottom: number;
  height: number;
}

function padHole(rect: DOMRect): Rect {
  return {
    top: rect.top - SPOTLIGHT_PAD,
    left: rect.left - SPOTLIGHT_PAD,
    right: rect.right + SPOTLIGHT_PAD,
    bottom: rect.bottom + SPOTLIGHT_PAD,
    height: rect.height + SPOTLIGHT_PAD * 2,
  };
}

export function TourOverlay({
  beat,
  gesturePhase,
  spotlight,
  passThrough,
  isLastBeat,
  onNext,
  onSkip,
}: TourOverlayProps) {
  const { eyebrow, body } = calloutCopy(beat, gesturePhase);
  const hole = spotlight ? padHole(spotlight) : null;
  const scrimPointer = passThrough
    ? "pointer-events-none"
    : "pointer-events-auto";

  return (
    <div
      data-testid="tour-overlay"
      data-beat={beat}
      className="fixed inset-0 z-[60]"
      style={{ pointerEvents: "none" }}
    >
      {hole ? (
        <div data-testid="tour-scrim">
          {scrimStrips(hole).map(({ key, style }) => (
            <div
              key={key}
              className={`tour-fade fixed bg-[var(--scrim-deep)] ${scrimPointer}`}
              style={style}
            />
          ))}
          <div
            aria-hidden
            className="ring-aurora/60 fixed rounded-[var(--radius-lg)] shadow-[var(--shadow-glow-aurora)] ring-2"
            style={{
              top: hole.top,
              left: hole.left,
              width: hole.right - hole.left,
              height: hole.height,
              pointerEvents: "none",
            }}
          />
        </div>
      ) : null}

      <div
        role="dialog"
        aria-modal={false}
        aria-label="App tour"
        data-testid="tour-callout"
        className="tour-rise border-fg-1/10 bg-dusk/95 pointer-events-auto fixed inset-x-4 bottom-[max(env(safe-area-inset-bottom),20px)] mx-auto max-w-sm rounded-[var(--radius-lg)] border p-5 shadow-[var(--shadow-lg)] backdrop-blur-md"
      >
        <p className="text-small text-sunrise font-medium tracking-wide uppercase">
          {eyebrow}
        </p>
        <p className="text-body text-fg-1 mt-1">{body}</p>
        <div className="mt-4 flex items-center justify-between">
          <button
            type="button"
            onClick={onSkip}
            className="text-small text-fg-3 hover:text-fg-2 focus-visible:outline-aurora transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Skip tour
          </button>
          <button
            type="button"
            onClick={onNext}
            className="text-small bg-sunrise text-void focus-visible:outline-aurora rounded-[var(--radius-pill)] px-4 py-2 font-medium transition-transform duration-150 ease-[var(--ease-spring)] focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.97]"
          >
            {isLastBeat ? "Done" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
