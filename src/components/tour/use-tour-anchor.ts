"use client";

import { useEffect, useState } from "react";

// The spotlight needs the live screen box of the beat's target. Re-measure on
// every way the box can move: the element resizing (ResizeObserver), the
// viewport resizing, the page or a scroll container scrolling, and an explicit
// `watch` change. The sheet slides between snaps via transform, which moves the
// box without changing its size or firing scroll, so the host passes the snap
// (or any positional signal) as `watch` to force a fresh read.
export function useTourAnchor(
  testId: string | null,
  watch?: unknown,
): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    const find = () =>
      testId
        ? document.querySelector<HTMLElement>(`[data-testid="${testId}"]`)
        : null;

    // The single write path; reused as the observer/listener callback. Routing
    // every update (including the "no target" reset to null) through here keeps
    // setState out of the effect's synchronous body.
    const measure = () => {
      const next = find()?.getBoundingClientRect() ?? null;
      setRect((prev) => (sameRect(prev, next) ? prev : next));
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

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, { capture: true });
    };
  }, [testId, watch]);

  return rect;
}

// getBoundingClientRect returns a fresh object each call; bail on no-op updates
// so high-frequency scroll/resize events don't churn renders.
function sameRect(a: DOMRect | null, b: DOMRect | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.top === b.top &&
    a.left === b.left &&
    a.width === b.width &&
    a.height === b.height
  );
}
