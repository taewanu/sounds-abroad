"use client";

import { useSyncExternalStore } from "react";
import { useStore } from "zustand";

import { tourBridge } from "@/lib/tour-bridge";

import { tourConcluded } from "./tour-concluded";

// Reactive read of the tour-done gate. Unlike useSeenFlag's no-op subscribe, the
// cues that wait on this outlive the tour, so they must re-render when the flag
// flips mid-session, not just read it once at mount.
//
// The server can't read the record, and a closed gate is the honest answer for
// an unknown one, so it renders the same markup the client hydrates to. False,
// not null: the pair only re-renders when the snapshots differ, and a null the
// client never returns would spend that render on every visit.
const serverSnapshot = (): boolean => false;

// Whether a cue that must not compete with the tour may show: the tour will
// never run again, and it isn't on screen right now. Both terms are needed,
// because a capped final appearance marks the record concluded while the tour is
// still up, so the record alone would let a cue fire under the tour dim.
// Collapsed to one boolean, so callers re-render when the gate flips rather than
// on every write to the underlying record.
export function useTourGateOpen(): boolean {
  const tourDone = useSyncExternalStore(
    tourConcluded.subscribe,
    tourConcluded.isConcluded,
    serverSnapshot,
  );
  const tourActive = useStore(tourBridge, (s) => s.tourActive);
  return tourDone && !tourActive;
}
