import { resolveCountry } from "./country-resolution";
import { markVisited, readVisited, resetVisited } from "./visited-storage";

export interface ChartPick {
  code: string | null;
  didReset: boolean;
}

const INITIAL: ChartPick = { code: null, didReset: false };

export class ChartPickStore {
  private snapshot: ChartPick = INITIAL;
  private listeners = new Set<() => void>();

  initIfNeeded(allCodes: readonly string[], rng: () => number): void {
    if (this.snapshot.code !== null) return;

    const visited = readVisited();
    const result = resolveCountry({
      urlParam: null,
      allCodes,
      visited,
      rng,
    });

    if (result.didReset) resetVisited();
    markVisited(result.code);

    this.snapshot = { code: result.code, didReset: result.didReset };
    this.notify();
  }

  subscribe = (callback: () => void): (() => void) => {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  };

  getSnapshot = (): ChartPick => this.snapshot;

  getServerSnapshot = (): ChartPick => INITIAL;

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}
