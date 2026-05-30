"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  motion,
  type PanInfo,
  useAnimationControls,
  useDragControls,
} from "motion/react";

import type { Country } from "@/lib/chart-schema";

import { TrackRow } from "./track-row";

export type SnapState = "closed" | "peek" | "full";

export interface ChartSheetProps {
  country: Country;
  countryCode: string;
  snap: SnapState;
  onSnapChange: (snap: SnapState) => void;
  currentTrackRank?: number | null;
  canClose?: boolean;
}

const SNAP_Y_PCT: Record<SnapState, number> = {
  full: 0,
  peek: 65,
  closed: 100,
};

const SNAP_Y: Record<SnapState, string> = {
  full: `${SNAP_Y_PCT.full}%`,
  peek: `${SNAP_Y_PCT.peek}%`,
  closed: `${SNAP_Y_PCT.closed}%`,
};

const SNAP_ORDER: SnapState[] = ["full", "peek", "closed"];
const VELOCITY_PROJECTION = 0.15;

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

  let nearest: SnapState = current;
  let minDist = Infinity;
  for (const s of SNAP_ORDER) {
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
  canClose = true,
}: ChartSheetProps) {
  const open = snap !== "closed";
  const animationControls = useAnimationControls();
  const dragControls = useDragControls();
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    void animationControls.start({ y: SNAP_Y[snap] });
  }, [snap, animationControls]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next && !canClose) {
        void animationControls.start({ y: SNAP_Y[snap] });
        return;
      }
      onSnapChange(next ? "peek" : "closed");
    },
    [onSnapChange, canClose, snap, animationControls],
  );

  const handleDragStart = useCallback(() => setIsDragging(true), []);

  const handleDragEnd = useCallback(
    (_event: unknown, info: PanInfo) => {
      setIsDragging(false);
      const next = nextSnap(snap, info.offset.y, info.velocity.y);
      if (next === "closed" && !canClose) {
        void animationControls.start({ y: SNAP_Y[snap] });
        return;
      }
      if (next === snap) {
        void animationControls.start({ y: SNAP_Y[snap] });
        return;
      }
      onSnapChange(next);
    },
    [snap, onSnapChange, canClose, animationControls],
  );

  const handleToggle = useCallback(() => {
    onSnapChange(snap === "peek" ? "full" : "peek");
  }, [snap, onSnapChange]);

  const olRef = useRef<HTMLOListElement | null>(null);
  const prevSnapRef = useRef(snap);

  useEffect(() => {
    const wasClosed = prevSnapRef.current === "closed";
    prevSnapRef.current = snap;
    if (!wasClosed || snap === "closed" || currentTrackRank === null) return;
    // Defer to next frame so Radix Dialog.Portal has fully mounted its content
    // and refs inside the portal are populated before we query/scroll.
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
  }, [snap, currentTrackRank]);

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange} modal={false}>
      <Dialog.Portal>
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
            className="bg-void text-fg-1 border-fg-1/10 shadow-sheet fixed inset-x-0 bottom-0 flex h-[100dvh] flex-col rounded-t-2xl border-t"
          >
            <div
              onPointerDown={(e) => dragControls.start(e)}
              className="shrink-0 touch-none"
            >
              <button
                type="button"
                onClick={handleToggle}
                aria-label={snap === "peek" ? "Expand chart" : "Collapse chart"}
                className="bg-fg-1/15 rounded-pill mx-auto mt-3 mb-2 block h-1.5 w-12"
              />
              <Dialog.Title className="text-h3 px-6 pb-3 font-semibold">
                {country.name}
              </Dialog.Title>
            </div>
            <ol
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
      </Dialog.Portal>
    </Dialog.Root>
  );
}
