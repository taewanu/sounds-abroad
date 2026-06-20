import { createStore } from "zustand/vanilla";

export interface TourBridgeState {
  // Bumped to request one scripted demo fling. A monotonic counter, not a
  // boolean, so a re-opened tour re-fires even after the controller consumed
  // the previous request (mirrors audio-store's endedSignal).
  ghostFlingNonce: number;
  // True from a request until the next settle resolves it, so the landing of a
  // demo fling can be told apart from a real user fling.
  ghostFlingActive: boolean;
  // The globe canvas is live. Gates the first-run trigger so the ghost fling
  // has something to animate.
  globeReady: boolean;
  requestGhostFling: () => void;
  resolveGhostFling: () => void;
  setGlobeReady: (ready: boolean) => void;
}

export function createTourBridge() {
  return createStore<TourBridgeState>()((set) => ({
    ghostFlingNonce: 0,
    ghostFlingActive: false,
    globeReady: false,
    requestGhostFling: () =>
      set((s) => ({
        ghostFlingNonce: s.ghostFlingNonce + 1,
        ghostFlingActive: true,
      })),
    resolveGhostFling: () => set({ ghostFlingActive: false }),
    setGlobeReady: (ready) => set({ globeReady: ready }),
  }));
}

// Module singleton: the globe canvas and the UI are sibling React subtrees with
// no shared provider, so a process-wide store is the only object both can
// import. The audio store is provider-scoped and cannot bridge them.
export const tourBridge = createTourBridge();
