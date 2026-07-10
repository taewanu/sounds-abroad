"use client";

import type { CSSProperties } from "react";

import { PointerIcon } from "@/components/icons/pointer";

import type { Beat } from "./tour-step";

// "done" never renders an overlay; the host unmounts at that point.
export type VisibleBeat = Exclude<Beat, "done">;

export interface TourOverlayProps {
  beat: VisibleBeat;
  // Screen box to spotlight, or null for a full-screen beat (the gesture beat
  // has no cutout: the whole globe is the target) or before the box is read.
  spotlight: DOMRect | null;
  // Corner radius of the spotlit element, so the glow frame matches it. Defaults
  // to 0 (square) when unset.
  spotlightRadius?: number;
  // Drop the gesture demo hand once the user has grabbed the globe; they're
  // already flicking, so the "do this" cue is in the way.
  hideFlickHint?: boolean;
  onSkip: () => void;
}

// One imperative naming the gesture, per beat. This text is the accessibility
// fallback for the wordless visual, so it lives in the a11y tree (see the badge
// role below), not as a separate sr-only string.
function badgeLabel(beat: VisibleBeat): string {
  switch (beat) {
    case "gesture":
      return "Flick to spin";
    case "sheet":
      return "Pull up the chart";
    case "audio":
      return "Tap a track";
  }
}

// The nudge badge is announced politely on appear and carries the per-beat
// breathe rhythm (matched to that beat's hand hint) plus the aurora glow. It is
// not aria-hidden: its text is the tour's a11y fallback for the wordless look.
function NudgeBadge({
  beat,
  spotlight,
}: {
  beat: VisibleBeat;
  spotlight: DOMRect | null;
}) {
  // Gesture and sheet badges sit at a fixed screen fraction (globe centre, and
  // above the sheet handle); the tap badge tracks the spotlit row, below it.
  const style: CSSProperties =
    beat === "audio" && spotlight
      ? {
          left: spotlight.left + spotlight.width / 2,
          top: spotlight.bottom + 24,
        }
      : beat === "gesture"
        ? { left: "50%", top: "53%" }
        : { left: "50%", top: "38%" };
  const rhythm =
    beat === "gesture"
      ? "tour-badge-flick"
      : beat === "sheet"
        ? "tour-badge-sheet"
        : "tour-badge-tap";

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="tour-badge"
      className={`tour-badge tour-badge-breathe tour-badge-glow ${rhythm}`}
      style={style}
    >
      {badgeLabel(beat)}
    </div>
  );
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
  spotlight,
  spotlightRadius = 0,
  hideFlickHint = false,
  onSkip,
}: TourOverlayProps) {
  const hole = spotlight ? padHole(spotlight) : null;

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
              // Visual only: the whole overlay is pointer-events:none, so the
              // dim never blocks. Every gesture reaches the live target beneath
              // it, which is what advances the beat.
              className="tour-dim fixed bg-[var(--scrim-tour)]"
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
          className="tour-dim pointer-events-none fixed inset-0"
          style={{
            // Prototype's soft vignette: peak 0.82 at the edges through a
            // half-strength midpoint, settling to the shared 0.5 residual.
            background:
              "radial-gradient(ellipse 46% 26% at 50% 44%, transparent 40%, rgba(5, 6, 8, 0.41) 70%, rgba(5, 6, 8, 0.82) 100%)",
          }}
        />
      ) : null}

      {beat === "gesture" && !hideFlickHint ? <FlickHint /> : null}

      {beat === "sheet" && spotlight ? (
        <SheetPullHint spotlight={spotlight} />
      ) : null}

      {beat === "audio" && spotlight ? <TapHint spotlight={spotlight} /> : null}

      <NudgeBadge beat={beat} spotlight={spotlight} />

      <button
        type="button"
        onClick={onSkip}
        aria-label="Dismiss tour"
        className="text-fg-1 focus-visible:outline-aurora pointer-events-auto fixed top-[56px] right-4 grid h-[42px] w-[42px] place-items-center rounded-full bg-[rgba(10,11,16,0.62)] shadow-[inset_0_0_0_1px_rgba(245,242,236,0.14)] backdrop-blur-md focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className="h-5 w-5"
        >
          <line x1="6" y1="6" x2="18" y2="18" />
          <line x1="18" y1="6" x2="6" y2="18" />
        </svg>
      </button>
    </div>
  );
}
