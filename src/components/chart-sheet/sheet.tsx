"use client";

import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import * as Dialog from "@radix-ui/react-dialog";

import type { Country } from "@/lib/chart-schema";

import { TrackRow } from "./track-row";

export type SnapState = "hidden" | "closed" | "peek" | "full";

export interface ChartSheetProps {
  country: Country;
  countryCode: string;
  snap: SnapState;
  onSnapChange: (snap: SnapState) => void;
  currentTrackRank?: number | null;
  hasMiniPlayer?: boolean;
  scrollSignal?: number;
}

// translateY as a fraction of the sheet's own height at each snap: full shows
// all of it, hidden pushes it fully below the viewport, peek leaves ~35% (the
// height the <ol> max-height clamp is tuned to).
const SNAP_Y_PCT: Record<SnapState, number> = {
  full: 0,
  peek: 65,
  closed: 90,
  hidden: 100,
};

const SNAP_Y: Record<SnapState, string> = {
  full: `${SNAP_Y_PCT.full}%`,
  peek: `${SNAP_Y_PCT.peek}%`,
  closed: `${SNAP_Y_PCT.closed}%`,
  hidden: `${SNAP_Y_PCT.hidden}%`,
};

const SNAP_ORDER: SnapState[] = ["full", "peek", "closed", "hidden"];

// Pointer travel (px) before a press becomes a drag, so a tap on the handle
// toggles cleanly instead of flickering the list clamp.
const DRAG_THRESHOLD_PX = 4;
// Release velocity (px/ms) projected this many ms ahead to pick the settle
// target, so a fast flick carries past the nearest stop.
const VELOCITY_PROJECTION_MS = 120;
const SETTLE_TRANSITION = "transform 0.34s cubic-bezier(0.22, 1, 0.36, 1)";

// Mirror MiniPlayer's rendered height: pt-3 (12px) + h-12 artwork (48px)
// + pb-[max(env(safe-area-inset-bottom), 12px)]. Tracks the iOS safe-area
// inset so the sheet doesn't sit under the mini on notched devices.
const MINI_PLAYER_GAP = "calc(60px + max(env(safe-area-inset-bottom), 12px))";

const SHEET_STYLE_WITH_MINI = {
  bottom: MINI_PLAYER_GAP,
  height: `calc(100dvh - ${MINI_PLAYER_GAP})`,
} as const;
const SHEET_STYLE_NO_MINI = { bottom: 0, height: "100dvh" } as const;

// Nearest snap to a projected position, restricted to one step from the current
// snap so every stop is a required waypoint (a drag can't skip peek).
function nextSnap(
  current: SnapState,
  projectedPx: number,
  height: number,
): SnapState {
  const projectedPct = (projectedPx / height) * 100;
  const idx = SNAP_ORDER.indexOf(current);
  const candidates: SnapState[] = [current];
  if (idx > 0) candidates.push(SNAP_ORDER[idx - 1]);
  if (idx < SNAP_ORDER.length - 1) candidates.push(SNAP_ORDER[idx + 1]);

  let nearest: SnapState = current;
  let minDist = Infinity;
  for (const s of candidates) {
    const dist = Math.abs(SNAP_Y_PCT[s] - projectedPct);
    if (dist < minDist) {
      minDist = dist;
      nearest = s;
    }
  }
  return nearest;
}

export function ChartSheet({
  country,
  countryCode,
  snap,
  onSnapChange,
  currentTrackRank = null,
  hasMiniPlayer = false,
  scrollSignal = 0,
}: ChartSheetProps) {
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const olRef = useRef<HTMLOListElement | null>(null);

  // Lifts the peek max-height clamp so the list fills the sheet while it's
  // dragged; only toggled at gesture start/end, never per frame.
  const [isDragging, setIsDragging] = useState(false);

  // Mount-time snap, captured once. React writes this transform for SSR/first
  // paint and never reconciles it (it never changes across renders), so the
  // gesture and settle code own the transform imperatively from then on. Do not
  // change this to SNAP_Y[snap]: a per-render value would make React rewrite the
  // transform every render and fight the imperative writes.
  const [initialSnap] = useState(snap);

  // Transient gesture state — refs so per-frame updates never re-render.
  const curYRef = useRef(0); // current translateY (px)
  const heightRef = useRef(0); // sheet height (px), cached at drag start
  const pressedRef = useRef(false); // pointer down, drag not yet committed
  const draggingRef = useRef(false); // committed to driving the sheet
  const canHandoffRef = useRef(false); // gesture began in the scrolled list at full
  const startYRef = useRef(0); // pointer Y at press (threshold reference)
  const baseYRef = useRef(0); // pointer Y at the drag baseline
  const baseTransRef = useRef(0); // translateY at the drag baseline
  const lastYRef = useRef(0);
  const lastTRef = useRef(0);
  const velRef = useRef(0);

  // Kept in refs so the long-lived touch listeners read the latest value
  // without re-attaching when the prop or snap changes.
  const snapRef = useRef(snap);
  useEffect(() => {
    snapRef.current = snap;
  }, [snap]);
  const onSnapChangeRef = useRef(onSnapChange);
  useEffect(() => {
    onSnapChangeRef.current = onSnapChange;
  }, [onSnapChange]);

  const sheetHeight = useCallback(
    () => sheetRef.current?.offsetHeight || window.innerHeight,
    [],
  );

  const snapPx = useCallback(
    (s: SnapState) => (SNAP_Y_PCT[s] / 100) * sheetHeight(),
    [sheetHeight],
  );

  // Drive the transform directly on the node. A MotionValue binding did not
  // apply reliably mid-gesture on iOS; direct writes also keep per-frame
  // updates off the React render path.
  const setY = useCallback((px: number) => {
    curYRef.current = px;
    const el = sheetRef.current;
    if (el) el.style.transform = `translateY(${px}px)`;
  }, []);

  const applySnap = useCallback(
    (s: SnapState, animate: boolean) => {
      const el = sheetRef.current;
      if (el) el.style.transition = animate ? SETTLE_TRANSITION : "none";
      setY(snapPx(s));
    },
    [setY, snapPx],
  );

  // Rubber-band past the top (full) and bottom (hidden) edges.
  const withResistance = useCallback((px: number) => {
    const max = heightRef.current;
    if (px < 0) return px * 0.25;
    if (px > max) return max + (px - max) * 0.25;
    return px;
  }, []);

  const trackVelocity = useCallback((y: number, t: number) => {
    const dt = t - lastTRef.current;
    if (dt > 0) velRef.current = (y - lastYRef.current) / dt;
    lastYRef.current = y;
    lastTRef.current = t;
  }, []);

  // Live translateY in px, read from the rendered matrix so grabbing the sheet
  // mid-settle picks up its actual position instead of the snap target.
  const readCurrentY = useCallback((): number => {
    const el = sheetRef.current;
    if (!el || typeof DOMMatrixReadOnly === "undefined") return curYRef.current;
    const transform = getComputedStyle(el).transform;
    if (!transform || transform === "none") return curYRef.current;
    try {
      return new DOMMatrixReadOnly(transform).m42;
    } catch {
      return curYRef.current;
    }
  }, []);

  const moveDrag = useCallback(
    (pointerY: number) => {
      setY(
        withResistance(baseTransRef.current + (pointerY - baseYRef.current)),
      );
    },
    [setY, withResistance],
  );

  // Commit a press to a drag: freeze the sheet at its current position and
  // baseline the gesture there so it tracks the finger without jumping.
  const commitDrag = useCallback(
    (pointerY: number) => {
      const el = sheetRef.current;
      const currentY = readCurrentY();
      if (el) el.style.transition = "none";
      heightRef.current = el?.offsetHeight || window.innerHeight;
      baseYRef.current = pointerY;
      baseTransRef.current = currentY;
      setY(currentY);
      pressedRef.current = false;
      draggingRef.current = true;
      document.body.style.userSelect = "none";
      setIsDragging(true);
    },
    [readCurrentY, setY],
  );

  const endDrag = useCallback(() => {
    const projected = curYRef.current + velRef.current * VELOCITY_PROJECTION_MS;
    const next = nextSnap(snapRef.current, projected, heightRef.current);
    draggingRef.current = false;
    canHandoffRef.current = false;
    setIsDragging(false);
    if (next === snapRef.current) {
      // Same snap: no prop change to drive the settle effect, so settle here.
      applySnap(next, true);
    } else {
      onSnapChangeRef.current(next);
    }
  }, [applySnap]);

  // Per-move handler shared by touch and pointer. Returns true once the gesture
  // owns the move so the caller can preventDefault.
  const dragMove = useCallback(
    (pointerY: number, t: number): boolean => {
      trackVelocity(pointerY, t);
      if (draggingRef.current) {
        moveDrag(pointerY);
        return true;
      }
      if (
        pressedRef.current &&
        Math.abs(pointerY - startYRef.current) > DRAG_THRESHOLD_PX
      ) {
        commitDrag(pointerY);
        moveDrag(pointerY);
        return true;
      }
      return false;
    },
    [trackVelocity, moveDrag, commitDrag],
  );

  // Arm a press as a drag candidate (threshold decides if it becomes a drag).
  const armPress = useCallback((pointerY: number, t: number) => {
    startYRef.current = pointerY;
    lastYRef.current = pointerY;
    lastTRef.current = t;
    velRef.current = 0;
    pressedRef.current = true;
    draggingRef.current = false;
  }, []);

  const endGesture = useCallback(() => {
    document.body.style.userSelect = "";
    pressedRef.current = false;
    if (draggingRef.current) endDrag();
    else canHandoffRef.current = false;
  }, [endDrag]);

  // Settle to the current snap on prop change, and re-place when the mini-player
  // toggles the sheet height. The first run jumps without a transition so the
  // server-rendered position isn't animated on mount.
  const didMountRef = useRef(false);
  useEffect(() => {
    applySnap(snap, didMountRef.current);
    didMountRef.current = true;
  }, [snap, hasMiniPlayer, applySnap]);

  // Touch controller. Attached imperatively so touchmove is non-passive and can
  // preventDefault to interrupt native scroll at the hand-off boundary.
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;

    const onTouchStart = (e: TouchEvent) => {
      // Ignore secondary touches while a gesture is already active so a stray
      // second finger can't reset an in-progress drag.
      if (pressedRef.current || draggingRef.current || canHandoffRef.current) {
        return;
      }
      const t = e.touches[0];
      if (
        snapRef.current === "full" &&
        olRef.current?.contains(e.target as Node)
      ) {
        // Full + list: let it scroll natively and watch for the hand-off, so a
        // downward pull past the top continues into a sheet collapse.
        lastYRef.current = t.clientY;
        lastTRef.current = e.timeStamp;
        velRef.current = 0;
        canHandoffRef.current = true;
        pressedRef.current = false;
        draggingRef.current = false;
      } else {
        armPress(t.clientY, e.timeStamp);
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      const cy = e.touches[0].clientY;
      // Native scroll phase: take the gesture over once the list is at the top
      // and the finger is still pulling down. The baseline reset in commitDrag
      // keeps the sheet from jumping.
      if (canHandoffRef.current && !draggingRef.current) {
        const pullingDown = cy - lastYRef.current > 0;
        trackVelocity(cy, e.timeStamp);
        const list = olRef.current;
        if ((!list || list.scrollTop <= 0) && pullingDown) {
          commitDrag(cy);
          e.preventDefault();
          moveDrag(cy);
        }
        return;
      }
      if (dragMove(cy, e.timeStamp)) e.preventDefault();
    };

    const onTouchEnd = () => endGesture();

    sheet.addEventListener("touchstart", onTouchStart, { passive: true });
    sheet.addEventListener("touchmove", onTouchMove, { passive: false });
    sheet.addEventListener("touchend", onTouchEnd, { passive: true });
    sheet.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      sheet.removeEventListener("touchstart", onTouchStart);
      sheet.removeEventListener("touchmove", onTouchMove);
      sheet.removeEventListener("touchend", onTouchEnd);
      sheet.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [armPress, commitDrag, dragMove, moveDrag, trackVelocity, endGesture]);

  // Pointer (mouse/pen) drag for desktop, where there's no native touch scroll
  // to hand off from. Touch goes through the listeners above. Window listeners
  // with no pointer capture so a tap still fires the handle button's click.
  const handlePointerDown = useCallback(
    (e: ReactPointerEvent) => {
      if (e.pointerType === "touch") return;
      const list = olRef.current;
      if (list && list.contains(e.target as Node) && list.scrollTop > 0) return;
      armPress(e.clientY, e.timeStamp);
      const onMove = (ev: PointerEvent) => {
        dragMove(ev.clientY, ev.timeStamp);
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        endGesture();
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [armPress, dragMove, endGesture],
  );

  const handleToggle = useCallback(() => {
    onSnapChange(snap === "peek" ? "full" : "peek");
  }, [snap, onSnapChange]);

  // open is pinned true to keep the sheet mounted for hidden<->visible
  // animation; Escape collapses to closed instead of unmounting.
  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) onSnapChange("closed");
    },
    [onSnapChange],
  );

  const prevSnapRef = useRef(snap);
  const prevSignalRef = useRef(scrollSignal);

  useEffect(() => {
    const wasMin =
      prevSnapRef.current === "closed" || prevSnapRef.current === "hidden";
    const signalChanged = prevSignalRef.current !== scrollSignal;
    prevSnapRef.current = snap;
    prevSignalRef.current = scrollSignal;
    if (snap === "closed" || snap === "hidden") return;
    if (currentTrackRank === null) return;
    if (!wasMin && !signalChanged) return;
    // Defer one frame so the new snap/country is in the DOM before query.
    const id = requestAnimationFrame(() => {
      const el = olRef.current?.querySelector<HTMLElement>(
        `[data-rank="${currentTrackRank}"]`,
      );
      el?.scrollIntoView({
        block: snap === "peek" ? "start" : "center",
        behavior: "smooth",
      });
    });
    return () => cancelAnimationFrame(id);
  }, [snap, currentTrackRank, scrollSignal]);

  return (
    // Not wrapped in Dialog.Portal: the sheet must be in the server-rendered
    // HTML so it (not the client-only globe) is the LCP element. Rendering in
    // place is safe because it is a fixed overlay declared after the globe layer
    // with no clipping or transformed ancestor (modal={false}, so no focus trap
    // either). If an ancestor ever gains overflow/transform, restore the portal.
    <Dialog.Root open onOpenChange={handleOpenChange} modal={false}>
      <Dialog.Content
        asChild
        aria-describedby={undefined}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <div
          ref={sheetRef}
          data-snap={snap}
          data-testid="chart-sheet"
          onPointerDown={handlePointerDown}
          style={{
            ...(hasMiniPlayer ? SHEET_STYLE_WITH_MINI : SHEET_STYLE_NO_MINI),
            transform: `translateY(${SNAP_Y[initialSnap]})`,
            willChange: "transform",
          }}
          className="group bg-void text-fg-1 border-fg-1/10 shadow-sheet fixed inset-x-0 flex flex-col rounded-t-2xl border-t"
        >
          <div className="shrink-0 touch-none">
            <button
              type="button"
              onClick={handleToggle}
              aria-label={snap === "full" ? "Collapse chart" : "Expand chart"}
              className="bg-fg-1/15 rounded-pill mx-auto mt-3 mb-2 block h-1.5 w-12"
            />
            <Dialog.Title className="text-h3 px-6 pb-3 font-semibold">
              {country.name}
            </Dialog.Title>
          </div>
          {/* Native list scroll is enabled only at full (touch-pan-y); at the
              partial snaps a vertical drag drives the sheet instead, so the list
              is touch-none there. */}
          <ol
            key={countryCode}
            ref={olRef}
            data-peek={(snap === "peek" && !isDragging) || undefined}
            className="min-h-0 flex-1 touch-none overflow-y-auto overscroll-y-contain px-4 pb-12 transition-[max-height] duration-300 ease-out [-ms-overflow-style:none] [scrollbar-width:none] group-data-[snap=full]:touch-pan-y data-[peek]:max-h-[calc(35dvh-62px)] [&::-webkit-scrollbar]:hidden"
          >
            {country.tracks.map((track) => (
              <TrackRow
                key={track.rank}
                track={track}
                countryCode={countryCode}
              />
            ))}
          </ol>
        </div>
      </Dialog.Content>
    </Dialog.Root>
  );
}
