import { resolveCountry } from "./country-resolution";
import { markVisited, readVisited, resetVisited } from "./visited-storage";

export interface ChartPick {
  code: string | null;
  didReset: boolean;
}

export const INITIAL_PICK: ChartPick = { code: null, didReset: false };

export class ChartPickStore {
  private snapshot: ChartPick = INITIAL_PICK;
  private listeners = new Set<() => void>();

  pickUnvisitedCountryCode(allCodes: readonly string[]): string {
    const visited = readVisited();
    const result = resolveCountry({
      urlParam: null,
      allCodes,
      visited,
      rng: Math.random,
    });

    if (result.didReset) resetVisited();
    markVisited(result.code);

    this.snapshot = { code: result.code, didReset: result.didReset };
    this.notify();
    return result.code;
  }

  subscribe = (callback: () => void): (() => void) => {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  };

  getSnapshot = (): ChartPick => this.snapshot;

  getServerSnapshot = (): ChartPick => INITIAL_PICK;

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}
