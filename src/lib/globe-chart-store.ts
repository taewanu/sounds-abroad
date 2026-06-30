import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

// Couples the two independent client trees that the URL can't: the globe
// (a fixed backdrop in the layout) and the chart sheet (page children). Read
// mode and "a landing happened" aren't shareable state, so they don't belong
// in ?cc=. A module singleton, not a provider store, because this is app-global
// client-only UI state with no request scope — and the globe lives outside the
// audio provider anyway.
export interface GlobeChartState {
  // The resolved country the globe centers on. The URL ?cc= is the shareable
  // mirror, but a layout component's useSearchParams is frozen to its first
  // value (it never re-renders on a client-side replaceState), so the globe
  // can't read the URL back. The chart, a page child, resolves cc (?cc= or the
  // default) and publishes it here; the globe reads it across the layout seam.
  selectedCountry: string | null;
  // The sheet is at full, covering the globe: the controller suspends its spin
  // so a leftover fling can't settle a new country out from under the reader.
  readMode: boolean;
  // Monotonic counter the globe bumps on every settle. The chart diffs it to
  // raise a dismissed sheet, so re-landing on the same country still raises
  // (a plain ?cc= diff would miss that).
  settleSignal: number;
  // A track is loaded (the "listening" state), so a no-movement tap on the globe
  // edge skips a track instead of selecting a country. The audio store lives in
  // the page's provider, which the layout-backdrop globe can't read, so the
  // chart mirrors the gate here alongside selectedCountry.
  listening: boolean;
  // Routes a globe edge-tap to the chart's shared prev/next (dir -1/+1), the one
  // place that owns the adjacency logic. Default no-op until the chart publishes
  // it, so calling before a track plays is safe.
  skip: (dir: 1 | -1) => void;
  setSelectedCountry: (code: string | null) => void;
  setReadMode: (readMode: boolean) => void;
  signalSettle: () => void;
  setListening: (listening: boolean) => void;
  setSkip: (skip: (dir: 1 | -1) => void) => void;
}

export const globeChartStore = createStore<GlobeChartState>()((set) => ({
  selectedCountry: null,
  readMode: false,
  settleSignal: 0,
  listening: false,
  skip: () => {},
  setSelectedCountry: (selectedCountry) => set({ selectedCountry }),
  setReadMode: (readMode) => set({ readMode }),
  signalSettle: () =>
    set((state) => ({ settleSignal: state.settleSignal + 1 })),
  setListening: (listening) => set({ listening }),
  setSkip: (skip) => set({ skip }),
}));

export function useGlobeChart<T>(selector: (state: GlobeChartState) => T): T {
  return useStore(globeChartStore, selector);
}
