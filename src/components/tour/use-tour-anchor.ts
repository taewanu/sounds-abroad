"use client";

import { useEffect, useState } from "react";

// The screen box of the beat's target, plus its corner radius so the spotlight
// glow matches whatever it frames (a 32px sheet, a 14px track row).
export interface TourAnchor {
  rect: DOMRect;
  radius: number;
}

// The spotlight needs the live box of the beat's target. Re-measure on every way
// it can move: the element resizing (ResizeObserver), the viewport resizing, the
// page or a scroll container scrolling, and an explicit `watch` change. The sheet
// slides between snaps via transform, which moves the box without changing its
// size or firing scroll, so the host passes the snap (or any positional signal)
// as `watch` to force a fresh read. `selector` is any CSS selector, letting a
// beat target a nested element (e.g. the first track row) without its own id.
export function useTourAnchor(
  selector: string | null,
  watch?: unknown,
): TourAnchor | null {
  const [anchor, setAnchor] = useState<TourAnchor | null>(null);

  useEffect(() => {
    const find = () =>
      selector ? document.querySelector<HTMLElement>(selector) : null;

    // The single write path; reused as the observer/listener callback. Routing
    // every update (including the "no target" reset to null) through here keeps
    // setState out of the effect's synchronous body.
    const measure = () => {
      const el = find();
      const next: TourAnchor | null = el
        ? {
            rect: el.getBoundingClientRect(),
            radius: parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0,
          }
        : null;
      setAnchor((prev) => (sameAnchor(prev, next) ? prev : next));
    };
    measure();

    const el = find();
    if (!el) return;

    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener("resize", measure);
    // Capture phase so a scroll inside any ancestor (the sheet body) is caught,
    // not only scrolls on window; passive since we never preventDefault.
    window.addEventListener("scroll", measure, {
      capture: true,
      passive: true,
    });
    // A transform move fires no scroll/resize, so the two ways the sheet travels
    // both need their own trigger: a finger drag writes the transform on every
    // pointermove, and a release settles it via a transform transition. Track
    // both so the spotlight follows the sheet live and lands with it.
    window.addEventListener("pointermove", measure, {
      capture: true,
      passive: true,
    });
    window.addEventListener("transitionend", measure, true);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, { capture: true });
      window.removeEventListener("pointermove", measure, { capture: true });
      window.removeEventListener("transitionend", measure, true);
    };
  }, [selector, watch]);

  return anchor;
}

// getBoundingClientRect returns a fresh object each call; bail on no-op updates
// so high-frequency scroll/resize events don't churn renders.
function sameAnchor(a: TourAnchor | null, b: TourAnchor | null): boolean {
  if (a === null || b === null) return a === b;
  return a.radius === b.radius && sameRect(a.rect, b.rect);
}

function sameRect(a: DOMRect, b: DOMRect): boolean {
  return (
    a.top === b.top &&
    a.left === b.left &&
    a.width === b.width &&
    a.height === b.height
  );
}
