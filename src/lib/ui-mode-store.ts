import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

// Couples the two independent client trees that the URL can't: the globe
// (a fixed backdrop in the layout) and the chart sheet (page children). Read
// mode and "a landing happened" aren't shareable state, so they don't belong
// in ?cc=. A module singleton, not a provider store, because this is app-global
// client-only UI state with no request scope — and the globe lives outside the
// audio provider anyway.
export interface UiModeState {
  // The sheet is at full, covering the globe: the controller suspends its spin
  // so a leftover fling can't settle a new country out from under the reader.
  readMode: boolean;
  // Monotonic counter the globe bumps on every settle. The chart diffs it to
  // raise a dismissed sheet, so re-landing on the same country still raises
  // (a plain ?cc= diff would miss that).
  settleSignal: number;
  setReadMode: (readMode: boolean) => void;
  signalSettle: () => void;
}

export const uiModeStore = createStore<UiModeState>()((set) => ({
  readMode: false,
  settleSignal: 0,
  setReadMode: (readMode) => set({ readMode }),
  signalSettle: () =>
    set((state) => ({ settleSignal: state.settleSignal + 1 })),
}));

export function useUiMode<T>(selector: (state: UiModeState) => T): T {
  return useStore(uiModeStore, selector);
}
