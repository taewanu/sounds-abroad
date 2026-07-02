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
  // place that owns the adjacency logic. Returns whether a track actually
  // changed (false when it clamps at the first/last playable track) so the cue
  // only flashes on a real skip. Default no-op until the chart publishes it.
  skip: (dir: 1 | -1) => boolean;
  // One-shot cue for the directional skip flash: `dir` is the skip direction and
  // `nonce` bumps on each skip so the overlay replays even on a repeat direction
  // (a plain `dir` diff would miss next-after-next). The globe edge-tap is the
  // only producer, so the flash lands on the tapped edge, not on a button skip.
  skipSignal: { dir: 1 | -1; nonce: number };
  setSelectedCountry: (code: string | null) => void;
  setReadMode: (readMode: boolean) => void;
  signalSettle: () => void;
  setListening: (listening: boolean) => void;
  setSkip: (skip: (dir: 1 | -1) => boolean) => void;
  signalSkip: (dir: 1 | -1) => void;
}

export const globeChartStore = createStore<GlobeChartState>()((set) => ({
  selectedCountry: null,
  readMode: false,
  settleSignal: 0,
  listening: false,
  skip: () => false,
  skipSignal: { dir: 1, nonce: 0 },
  setSelectedCountry: (selectedCountry) => set({ selectedCountry }),
  setReadMode: (readMode) => set({ readMode }),
  signalSettle: () =>
    set((state) => ({ settleSignal: state.settleSignal + 1 })),
  setListening: (listening) => set({ listening }),
  setSkip: (skip) => set({ skip }),
  signalSkip: (dir) =>
    set((state) => ({
      skipSignal: { dir, nonce: state.skipSignal.nonce + 1 },
    })),
}));

export function useGlobeChart<T>(selector: (state: GlobeChartState) => T): T {
  return useStore(globeChartStore, selector);
}
