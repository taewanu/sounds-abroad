import { createStore } from "zustand/vanilla";

export interface TourBridgeState {
  // The globe canvas is live. Gates the first-run tour so it appears only once
  // the globe is on screen.
  globeReady: boolean;
  setGlobeReady: (ready: boolean) => void;
}

export function createTourBridge() {
  return createStore<TourBridgeState>()((set) => ({
    globeReady: false,
    setGlobeReady: (ready) => set({ globeReady: ready }),
  }));
}

// Module singleton: the globe canvas and the UI are sibling React subtrees with
// no shared provider, so a process-wide store is the only object both can
// import. The audio store is provider-scoped and cannot bridge them.
export const tourBridge = createTourBridge();
