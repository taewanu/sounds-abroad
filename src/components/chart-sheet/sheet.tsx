"use client";

import { useCallback } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { motion, type PanInfo } from "motion/react";

import type { Country } from "@/lib/chart-schema";

import { TrackRow } from "./track-row";

export type SnapState = "closed" | "peek" | "full";

export interface ChartSheetProps {
  country: Country;
  snap: SnapState;
  onSnapChange: (snap: SnapState) => void;
}

const SNAP_Y: Record<SnapState, string> = {
  closed: "100%",
  peek: "65%",
  full: "0%",
};

const SNAP_ORDER: SnapState[] = ["full", "peek", "closed"];
const VELOCITY_THRESHOLD = 500;
const OFFSET_THRESHOLD = 80;

function nextSnap(
  current: SnapState,
  offsetY: number,
  velocityY: number,
): SnapState {
  const idx = SNAP_ORDER.indexOf(current);
  if (velocityY > VELOCITY_THRESHOLD || offsetY > OFFSET_THRESHOLD) {
    return SNAP_ORDER[Math.min(idx + 1, SNAP_ORDER.length - 1)];
  }
  if (velocityY < -VELOCITY_THRESHOLD || offsetY < -OFFSET_THRESHOLD) {
    return SNAP_ORDER[Math.max(idx - 1, 0)];
  }
  return current;
}

export function ChartSheet({ country, snap, onSnapChange }: ChartSheetProps) {
  const open = snap !== "closed";

  const handleOpenChange = useCallback(
    (next: boolean) => {
      onSnapChange(next ? "peek" : "closed");
    },
    [onSnapChange],
  );

  const handleDragEnd = useCallback(
    (_event: unknown, info: PanInfo) => {
      onSnapChange(nextSnap(snap, info.offset.y, info.velocity.y));
    },
    [snap, onSnapChange],
  );

  const handleToggle = useCallback(() => {
    onSnapChange(snap === "peek" ? "full" : "peek");
  }, [snap, onSnapChange]);

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange} modal={false}>
      <Dialog.Portal>
        <Dialog.Content asChild aria-describedby={undefined}>
          <motion.div
            data-snap={snap}
            data-testid="chart-sheet"
            drag="y"
            dragMomentum={false}
            dragElastic={0.2}
            animate={{ y: SNAP_Y[snap] }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            onDragEnd={handleDragEnd}
            className="bg-void text-fg-1 border-fg-1/10 shadow-sheet fixed inset-x-0 bottom-0 flex h-[100dvh] flex-col rounded-t-2xl border-t"
          >
            <button
              type="button"
              onClick={handleToggle}
              aria-label={snap === "peek" ? "Expand chart" : "Collapse chart"}
              className="bg-fg-1/15 rounded-pill mx-auto mt-3 mb-2 h-1.5 w-12 shrink-0"
            />
            <Dialog.Title className="text-h3 px-6 pb-3 font-semibold">
              {country.name}
            </Dialog.Title>
            <ol className="min-h-0 flex-1 overflow-y-auto px-4 pb-12 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {country.tracks.map((track) => (
                <TrackRow key={track.rank} track={track} />
              ))}
            </ol>
          </motion.div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
