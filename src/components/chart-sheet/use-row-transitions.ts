"use client";

import { useEffect, useRef, useState } from "react";

import type { ChartTrack } from "@/lib/chart-schema";

/** How a row is moving through a mode switch, for the collapse/expand motion. */
export type RowTransition = "stable" | "entering" | "leaving";

export interface DisplayRow {
  track: ChartTrack;
  transition: RowTransition;
}

/**
 * How long a leaving row is held in the list while it collapses. Mirrors the
 * collapse animation, after which the row is dropped from the rendered set.
 */
export const ROW_COLLAPSE_MS = 300;

function stable(rows: readonly ChartTrack[]): DisplayRow[] {
  return rows.map((track) => ({ track, transition: "stable" }));
}

function byRank(a: DisplayRow, b: DisplayRow): number {
  return a.track.rank - b.track.rank;
}

/**
 * Turns each mode switch into a collapse/expand: the rows a mode drops fall away
 * where they sit, the rows it adds open into place, and the rows both share hold
 * still. The direction reads without a count, which one entrance for every row
 * could not show.
 *
 * Animates only a mode switch. A new mount (a country or chart change) and a
 * tail arriving on the same chart both snap, the first being a different list
 * and the second a wait already announced.
 *
 * A leaving row is kept in the returned set through its collapse, React having
 * no motion for a removed node, then dropped once the collapse has run.
 */
export function useRowTransitions(
  rows: readonly ChartTrack[],
  /** Identifies the country and chart; a change to it is a new list, not a switch. */
  mountKey: string,
  mode: string,
): DisplayRow[] {
  const [display, setDisplay] = useState<DisplayRow[]>(() => stable(rows));
  const prevMountKey = useRef(mountKey);
  const prevMode = useRef(mode);
  const prevRows = useRef(rows);
  const dropTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const clearDrop = () => {
      if (dropTimer.current !== null) clearTimeout(dropTimer.current);
      dropTimer.current = null;
    };

    // A new list, or a tail arriving under the same mode: neither is a switch,
    // so show the rows as they are.
    if (prevMountKey.current !== mountKey || prevMode.current === mode) {
      clearDrop();
      setDisplay(stable(rows));
    } else {
      const wasByRank = new Set(prevRows.current.map((t) => t.rank));
      const nowByRank = new Set(rows.map((t) => t.rank));
      const leaving = prevRows.current.flatMap((track): DisplayRow[] =>
        nowByRank.has(track.rank) ? [] : [{ track, transition: "leaving" }],
      );
      const arriving = rows.map((track): DisplayRow => ({
        track,
        transition: wasByRank.has(track.rank) ? "stable" : "entering",
      }));
      setDisplay([...arriving, ...leaving].sort(byRank));
      clearDrop();
      dropTimer.current = setTimeout(
        () => setDisplay(stable(rows)),
        ROW_COLLAPSE_MS,
      );
    }

    prevMountKey.current = mountKey;
    prevMode.current = mode;
    prevRows.current = rows;
    return clearDrop;
  }, [rows, mountKey, mode]);

  return display;
}
