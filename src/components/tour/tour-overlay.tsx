"use client";

import type { CSSProperties } from "react";

import { PointerIcon } from "@/components/icons/pointer";

import type { Beat, GesturePhase } from "./tour-step";

// "done" never renders an overlay; the host unmounts at that point.
export type VisibleBeat = Exclude<Beat, "done">;

export interface TourOverlayProps {
  beat: VisibleBeat;
  gesturePhase: GesturePhase;
  // Screen box to spotlight, or null for a full-screen beat (the gesture beat
  // has no cutout: the whole globe is the target) or before the box is read.
  spotlight: DOMRect | null;
  // Corner radius of the spotlit element, so the glow frame matches it. Defaults
  // to 0 (square) when unset.
  spotlightRadius?: number;
  // Drop the gesture demo hand once the user has grabbed the globe; they're
  // already flicking, so the "do this" cue is in the way. The callout copy and
  // Next stay driven by the actual selection, not by this.
  hideFlickHint?: boolean;
  // The gesture beat lets flings reach the globe, so its scrim must not capture
  // pointer events; the sheet/audio beats dim and block everything but the hole.
  passThrough: boolean;
  isLastBeat: boolean;
  onNext: () => void;
  onSkip: () => void;
}

// Per beat: a verb-first eyebrow (the gesture) over a body that states the
// payoff. The gesture body also names the non-gesture path so a keyboard or SR
// user is never told to only fling.
function calloutCopy(
  beat: VisibleBeat,
  phase: GesturePhase,
): { eyebrow: string; body: string } {
  switch (beat) {
    case "gesture":
      return phase === "try"
        ? {
            eyebrow: "Flick the globe",
            body: "Spin to a new country, or pick one from the list.",
          }
        : {
            eyebrow: "Nice, you've got it",
            body: "Spin as much as you like, then continue.",
          };
    case "sheet":
      return {
        eyebrow: "Pull up the chart",
        body: "See every track, not just the top few.",
      };
    case "audio":
      return {
        eyebrow: "Tap a track",
        body: "Hear a preview; it follows you as you explore.",
      };
  }
}

// A ghost hand that presses onto the globe and flings it (windup, whip,
// overshoot, settle), trailing a motion blur, then lifts and repeats: the literal
// "drag to spin" gesture. Pure CSS so the loop is self-driving; the hand and the
// (decoupled, horizontal) trail stack centred on the globe so the hint tracks it
// across phone sizes.
// Solid at the hand end, a long fade to the left: a rounded tail, not a point.
const trailLine = (alpha: number) =>
  `linear-gradient(to left, rgba(107, 229, 197, ${alpha}), rgba(107, 229, 197, ${alpha}) 22%, transparent 96%)`;

function FlickHint() {
  return (
    <div
      aria-hidden
      data-testid="tour-flick-hint"
      className="pointer-events-none fixed top-[46%] left-1/2 -translate-x-1/2 -translate-y-1/2"
    >
      <div className="tour-swipe-stage">
        <div className="tour-swipe-trail">
          <div className="tour-swipe-smear" />
          <div className="tour-swipe-streak-lines">
            <div className="tour-swipe-line" style={{ top: "40%" }}>
              <i
                style={{
                  width: "calc(var(--swipe-travel) * 0.8)",
                  background: trailLine(0.5),
                }}
              />
            </div>
            <div className="tour-swipe-line" style={{ top: "60%" }}>
              <i
                style={{
                  width: "calc(var(--swipe-travel) * 0.72)",
                  background: trailLine(0.46),
                }}
              />
            </div>
          </div>
        </div>
        <div className="tour-swipe">
          <PointerIcon className="tour-swipe-hand" />
        </div>
      </div>
    </div>
  );
}

// Beat 2 shows the same hand pressing the sheet handle and dragging upward: the
// "pull up" gesture, so this beat demonstrates the motion instead of only naming
// it. Anchored to the spotlight's top-centre (the handle) so it tracks the sheet.
function SheetPullHint({ spotlight }: { spotlight: DOMRect }) {
  return (
    <div
      aria-hidden
      data-testid="tour-pull-hint"
      className="pointer-events-none fixed -translate-x-1/2"
      style={{ left: spotlight.left + spotlight.width / 2, top: spotlight.top }}
    >
      <div className="tour-pull">
        <PointerIcon className="tour-swipe-hand" />
      </div>
    </div>
  );
}

// Beat 3 shows the hand pressing a track row: the "tap to preview" gesture, in
// place over the row it points at, so this beat demonstrates the tap too.
function TapHint({ spotlight }: { spotlight: DOMRect }) {
  return (
    <div
      aria-hidden
      data-testid="tour-tap-hint"
      className="pointer-events-none fixed -translate-x-1/2 -translate-y-1/2"
      style={{
        left: spotlight.left + spotlight.width / 2,
        top: spotlight.top + spotlight.height / 2,
      }}
    >
      <div className="tour-tap">
        <PointerIcon className="tour-swipe-hand" />
      </div>
    </div>
  );
}

// No gap between the dim and the target: the soft glow feathers the boundary, so
// padding would only expose an undimmed strip around the element.
const SPOTLIGHT_PAD = 0;

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
  spotlightRadius = 0,
  hideFlickHint = false,
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
  // The flick hint invites the first gesture; once the user has flicked (phase
  // "ready") it gives way to Next, so they aren't rushed past beat one.
  const inviting = beat === "gesture" && gesturePhase === "try";

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
            className="fixed"
            style={{
              top: hole.top,
              left: hole.left,
              width: hole.right - hole.left,
              height: hole.height,
              borderRadius: spotlightRadius,
              pointerEvents: "none",
              // Soft aurora halo instead of a hard ring: a full-width bottom sheet
              // only shows a hard ring's top edge, which reads as a stray line. The
              // outer glow feathers the dim→bright boundary; for the tall sheet an
              // inset glow bleeds down from the top, filling its rounded corners.
              boxShadow:
                beat === "sheet"
                  ? "0 0 30px 6px rgba(107, 229, 197, 0.2), inset 0 16px 28px -12px rgba(107, 229, 197, 0.32)"
                  : "0 0 20px 4px rgba(107, 229, 197, 0.28)",
            }}
          />
        </div>
      ) : null}

      {beat === "gesture" ? (
        <div
          aria-hidden
          data-testid="tour-vignette"
          className="tour-fade pointer-events-none fixed inset-0"
          style={{
            background:
              "radial-gradient(circle at 50% 44%, transparent 14%, rgba(5, 6, 8, 0.88) 82%)",
          }}
        />
      ) : null}

      {inviting && !hideFlickHint ? <FlickHint /> : null}

      {beat === "sheet" && spotlight ? (
        <SheetPullHint spotlight={spotlight} />
      ) : null}

      {beat === "audio" && spotlight ? <TapHint spotlight={spotlight} /> : null}

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
          {inviting ? null : (
            <button
              type="button"
              onClick={onNext}
              className="text-small bg-sunrise text-void focus-visible:outline-aurora rounded-[var(--radius-pill)] px-4 py-2 font-medium transition-transform duration-150 ease-[var(--ease-spring)] focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.97]"
            >
              {isLastBeat ? "Done" : "Next"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
