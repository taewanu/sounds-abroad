import { beforeEach, describe, expect, test, vi } from "vitest";

import { ChartPickStore } from "./chart-pick-store";

const ALL = ["us", "kr", "jp"] as const;

describe("ChartPickStore", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test("initIfNeeded picks a country and writes it to visited-storage", () => {
    const store = new ChartPickStore();

    store.initIfNeeded(ALL, () => 0);

    const snap = store.getSnapshot();
    expect(snap.code).toBe("us");
    expect(snap.didReset).toBe(false);
    expect(localStorage.getItem("sa:visited")).toContain("us");
  });

  test("initIfNeeded is idempotent — second call does not re-pick", () => {
    const store = new ChartPickStore();
    const rng = vi.fn(() => 0);

    store.initIfNeeded(ALL, rng);
    store.initIfNeeded(ALL, rng);

    expect(rng).toHaveBeenCalledTimes(1);
  });

  test("subscribe receives notification when initIfNeeded picks", () => {
    const store = new ChartPickStore();
    const listener = vi.fn();

    store.subscribe(listener);
    store.initIfNeeded(ALL, () => 0);

    expect(listener).toHaveBeenCalledTimes(1);
  });

  test("subscribe returns unsubscribe function that stops notifications", () => {
    const store = new ChartPickStore();
    const listener = vi.fn();

    const unsubscribe = store.subscribe(listener);
    unsubscribe();
    store.initIfNeeded(ALL, () => 0);

    expect(listener).not.toHaveBeenCalled();
  });

  test("getServerSnapshot returns the empty initial value", () => {
    const store = new ChartPickStore();

    expect(store.getServerSnapshot()).toEqual({
      code: null,
      didReset: false,
    });
  });

  test("signals didReset and clears prior visited when visited contains all codes", () => {
    localStorage.setItem("sa:visited", JSON.stringify([...ALL]));

    const store = new ChartPickStore();
    store.initIfNeeded(ALL, () => 0);

    const snap = store.getSnapshot();
    const storedVisited: unknown = JSON.parse(
      localStorage.getItem("sa:visited") ?? "[]",
    );
    expect(snap.didReset).toBe(true);
    expect(storedVisited).toEqual(["us"]);
  });
});
