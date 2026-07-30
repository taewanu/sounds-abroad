import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

import { DEFAULT_CHART_MODE, type ChartMode } from "./chart-mode";

// Couples the two independent client trees that the URL can't: the globe
// (a fixed backdrop in the layout) and the chart sheet (page children). Read
// mode and "a landing happened" aren't shareable state, so they don't belong
// in the URL. A module singleton, not a provider store, because this is app-global
// client-only UI state with no request scope — and the globe lives outside the
// audio provider anyway.
export interface GlobeChartState {
  // The resolved country the globe centers on. The country URL is the shareable
  // mirror, but a layout component's useSearchParams is frozen to its first
  // value (it never re-renders on a client-side replaceState), so the globe
  // can't read the URL back. The chart, a page child, resolves the country (URL or the
  // landing roll) and publishes it here; the globe reads it across the layout seam.
  selectedCountry: string | null;
  // The sheet is at full, covering the globe: the controller suspends its spin
  // so a leftover fling can't settle a new country out from under the reader.
  readMode: boolean;
  // Monotonic counter the globe bumps on every settle. The chart diffs it to
  // raise a dismissed sheet, so re-landing on the same country still raises
  // (a plain country diff would miss that).
  settleSignal: number;
  // Whether the most recent settle came from a bare globe tap (vs a fling, an
  // external URL/list pick, or a snap). The onboarding tour's gesture beat
  // reads this so an accidental tap-select does not count as performing the
  // flick it teaches; a real fling or a deliberate list pick still advances.
  lastSettleViaTap: boolean;
  // A track is loaded (the "listening" state), so a no-movement tap on the globe
  // edge skips a track instead of selecting a country. The audio store lives in
  // the page's provider, which the layout-backdrop globe can't read, so the
  // chart mirrors the gate here alongside selectedCountry.
  listening: boolean;
  // The songs-chart mode (most played / only here) the chart is reading in. The
  // URL is its shareable mirror, but the globe writes that URL on every settle
  // and a layout backdrop can't read the query back, so the chart publishes the
  // mode here for the globe to carry through a landing rather than drop it.
  chartMode: ChartMode;
  // The globe's edge-tap skip-intent, a plain data signal: `dir` is the
  // direction (prev -1 / next +1) and `nonce` bumps on each tap so a repeat
  // direction still fires (a plain `dir` diff would miss next-after-next). The
  // chart subscribes, runs its shared step (the one owner of adjacency), and
  // drives the skip flash from step's result. The globe carries no callback and
  // learns no outcome, so the whole seam is data, not behavior.
  skipIntent: { dir: 1 | -1; nonce: number };
  // Monotonic counter a "surprise me" button bumps to fling the globe to a
  // random country. The pick lives in the globe (where the anti-repeat `visited`
  // set does), so the button can't run it directly; it signals across this seam
  // and the globe draws and settles like any other landing.
  shuffleSignal: number;
  // Per-session anti-repeat memory behind every fairness draw (fling snap,
  // shuffle, end-of-chart roll); resets on reload. The globe writes it on each
  // landing. It lives here rather than in the globe tree because the chart
  // draws from it too: an end-of-chart roll picks its country with the same
  // visited-weighting a shuffle uses.
  visited: ReadonlySet<string>;
  // The country a shuffle just drew, set by the globe when it lands one. The
  // screen-reader announcement and the landing's playback both key on this
  // rather than on the next selectedCountry change, so a selection from another
  // source (a fling settling, a list pick) can't be mistaken for this shuffle's
  // result and no other route sounds. `nonce` re-fires both even if a later
  // shuffle repeats the country.
  shuffleLanded: { code: string; nonce: number } | null;
  setSelectedCountry: (code: string | null) => void;
  setVisited: (visited: ReadonlySet<string>) => void;
  setReadMode: (readMode: boolean) => void;
  setChartMode: (mode: ChartMode) => void;
  signalSettle: (viaTap?: boolean) => void;
  setListening: (listening: boolean) => void;
  signalSkip: (dir: 1 | -1) => void;
  requestShuffle: () => void;
  // Land a shuffle draw: move the globe and record the landing to announce.
  shuffleTo: (code: string) => void;
}

export const globeChartStore = createStore<GlobeChartState>()((set) => ({
  selectedCountry: null,
  readMode: false,
  settleSignal: 0,
  lastSettleViaTap: false,
  listening: false,
  chartMode: DEFAULT_CHART_MODE,
  skipIntent: { dir: 1, nonce: 0 },
  visited: new Set<string>(),
  shuffleSignal: 0,
  shuffleLanded: null,
  setSelectedCountry: (selectedCountry) => set({ selectedCountry }),
  setVisited: (visited) => set({ visited }),
  setReadMode: (readMode) => set({ readMode }),
  setChartMode: (chartMode) => set({ chartMode }),
  signalSettle: (viaTap = false) =>
    set((state) => ({
      settleSignal: state.settleSignal + 1,
      lastSettleViaTap: viaTap,
    })),
  setListening: (listening) => set({ listening }),
  signalSkip: (dir) =>
    set((state) => ({
      skipIntent: { dir, nonce: state.skipIntent.nonce + 1 },
    })),
  requestShuffle: () =>
    set((state) => ({ shuffleSignal: state.shuffleSignal + 1 })),
  shuffleTo: (code) =>
    set((state) => ({
      selectedCountry: code,
      shuffleLanded: { code, nonce: (state.shuffleLanded?.nonce ?? 0) + 1 },
    })),
}));

export function useGlobeChart<T>(selector: (state: GlobeChartState) => T): T {
  return useStore(globeChartStore, selector);
}
