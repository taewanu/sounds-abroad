import { createStore } from "zustand/vanilla";

export interface TourBridgeState {
  // The globe canvas is live. Gates the first-run tour so it appears only once
  // the globe is on screen.
  globeReady: boolean;
  setGlobeReady: (ready: boolean) => void;
  // The tour is on screen right now. The commentary hint waits on this as well as
  // the record: a capped final appearance marks the record concluded while the
  // tour is still up, and the hint must not arm under it.
  tourActive: boolean;
  setTourActive: (active: boolean) => void;
}

export function createTourBridge() {
  return createStore<TourBridgeState>()((set) => ({
    globeReady: false,
    setGlobeReady: (ready) => set({ globeReady: ready }),
    tourActive: false,
    setTourActive: (active) => set({ tourActive: active }),
  }));
}

// Module singleton: the globe canvas and the UI are sibling React subtrees with
// no shared provider, so a process-wide store is the only object both can
// import. The audio store is provider-scoped and cannot bridge them.
export const tourBridge = createTourBridge();
