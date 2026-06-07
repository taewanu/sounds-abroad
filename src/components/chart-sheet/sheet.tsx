"use client";

import {
  type PointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  motion,
  type PanInfo,
  useAnimationControls,
  useDragControls,
} from "motion/react";

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
const VELOCITY_PROJECTION = 0.15;

// Mirror MiniPlayer's rendered height: pt-3 (12px) + h-12 artwork (48px)
// + pb-[max(env(safe-area-inset-bottom), 12px)]. Tracks the iOS safe-area
// inset so the sheet doesn't sit under the mini on notched devices.
const MINI_PLAYER_GAP = "calc(60px + max(env(safe-area-inset-bottom), 12px))";

const SHEET_STYLE_WITH_MINI = {
  bottom: MINI_PLAYER_GAP,
  height: `calc(100dvh - ${MINI_PLAYER_GAP})`,
} as const;
const SHEET_STYLE_NO_MINI = { bottom: 0, height: "100dvh" } as const;

function nextSnap(
  current: SnapState,
  offsetY: number,
  velocityY: number,
): SnapState {
  const vh = window.innerHeight;
  const offsetPct = (offsetY / vh) * 100;
  const velocityPct = (velocityY / vh) * 100;
  const projected =
    SNAP_Y_PCT[current] + offsetPct + velocityPct * VELOCITY_PROJECTION;

  // One-step transitions only — every snap is a required waypoint.
  const idx = SNAP_ORDER.indexOf(current);
  const candidates: SnapState[] = [current];
  if (idx > 0) candidates.push(SNAP_ORDER[idx - 1]);
  if (idx < SNAP_ORDER.length - 1) candidates.push(SNAP_ORDER[idx + 1]);

  let nearest: SnapState = current;
  let minDist = Infinity;
  for (const s of candidates) {
    const dist = Math.abs(SNAP_Y_PCT[s] - projected);
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
  const animationControls = useAnimationControls();
  const dragControls = useDragControls();
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    void animationControls.start({ y: SNAP_Y[snap] });
  }, [snap, animationControls]);

  // open is pinned true to keep motion.div mounted for hidden↔visible
  // animation; Escape collapses to closed instead of unmounting.
  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) onSnapChange("closed");
    },
    [onSnapChange],
  );

  const handleDragStart = useCallback(() => setIsDragging(true), []);

  const handleDragEnd = useCallback(
    (_event: unknown, info: PanInfo) => {
      setIsDragging(false);
      const next = nextSnap(snap, info.offset.y, info.velocity.y);
      if (next === snap) {
        void animationControls.start({ y: SNAP_Y[snap] });
        return;
      }
      onSnapChange(next);
    },
    [snap, onSnapChange, animationControls],
  );

  const handleToggle = useCallback(() => {
    onSnapChange(snap === "peek" ? "full" : "peek");
  }, [snap, onSnapChange]);

  const olRef = useRef<HTMLOListElement | null>(null);

  // Drag starts from anywhere on the sheet, except yield to the list's
  // native scroll while it's scrolled away from the top.
  const handlePointerDown = useCallback(
    (e: PointerEvent) => {
      const ol = olRef.current;
      if (ol && ol.contains(e.target as Node) && ol.scrollTop > 0) return;
      dragControls.start(e);
    },
    [dragControls],
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
        <motion.div
          data-snap={snap}
          data-testid="chart-sheet"
          drag="y"
          dragListener={false}
          dragControls={dragControls}
          dragMomentum={false}
          dragElastic={0.2}
          initial={{ y: SNAP_Y[snap] }}
          animate={animationControls}
          transition={{ type: "spring", damping: 30, stiffness: 300 }}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onPointerDown={handlePointerDown}
          style={hasMiniPlayer ? SHEET_STYLE_WITH_MINI : SHEET_STYLE_NO_MINI}
          className="bg-void text-fg-1 border-fg-1/10 shadow-sheet fixed inset-x-0 flex flex-col rounded-t-2xl border-t"
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
          <ol
            key={countryCode}
            ref={olRef}
            data-peek={(snap === "peek" && !isDragging) || undefined}
            className="min-h-0 flex-1 overflow-y-auto px-4 pb-12 transition-[max-height] duration-300 ease-out [-ms-overflow-style:none] [scrollbar-width:none] data-[peek]:max-h-[calc(35dvh-62px)] [&::-webkit-scrollbar]:hidden"
          >
            {country.tracks.map((track) => (
              <TrackRow
                key={track.rank}
                track={track}
                countryCode={countryCode}
              />
            ))}
          </ol>
        </motion.div>
      </Dialog.Content>
    </Dialog.Root>
  );
}
