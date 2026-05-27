import { beforeEach, describe, expect, test, vi } from "vitest";

import { ChartPickStore, INITIAL_PICK } from "./chart-pick-store";

const ALL = ["us", "kr", "jp"] as const;

describe("ChartPickStore", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test("pickUnvisitedCountryCode picks an unvisited country and marks it visited", () => {
    const store = new ChartPickStore();

    store.pickUnvisitedCountryCode(ALL);

    const snap = store.getSnapshot();
    expect(ALL).toContain(snap.code);
    expect(snap.didReset).toBe(false);
    expect(localStorage.getItem("sa:visited")).toContain(snap.code);
  });

  test("pickUnvisitedCountryCode returns the picked code", () => {
    const store = new ChartPickStore();

    const picked = store.pickUnvisitedCountryCode(ALL);

    expect(picked).toBe(store.getSnapshot().code);
    expect(ALL).toContain(picked);
  });

  test("pickUnvisitedCountryCode picks fresh on each call, skipping visited", () => {
    const store = new ChartPickStore();

    const first = store.pickUnvisitedCountryCode(ALL);
    const second = store.pickUnvisitedCountryCode(ALL);

    expect(first).not.toBe(second);
    expect(ALL).toContain(first);
    expect(ALL).toContain(second);
  });

  test("subscribe receives notification on each pickUnvisitedCountryCode call", () => {
    const store = new ChartPickStore();
    const listener = vi.fn();

    store.subscribe(listener);
    store.pickUnvisitedCountryCode(ALL);
    store.pickUnvisitedCountryCode(ALL);

    expect(listener).toHaveBeenCalledTimes(2);
  });

  test("subscribe returns unsubscribe function that stops notifications", () => {
    const store = new ChartPickStore();
    const listener = vi.fn();

    const unsubscribe = store.subscribe(listener);
    unsubscribe();
    store.pickUnvisitedCountryCode(ALL);

    expect(listener).not.toHaveBeenCalled();
  });

  test("getServerSnapshot returns the stable INITIAL_PICK reference", () => {
    const store = new ChartPickStore();

    expect(store.getServerSnapshot()).toBe(INITIAL_PICK);
  });

  test("signals didReset and clears prior visited when visited contains all codes", () => {
    localStorage.setItem("sa:visited", JSON.stringify([...ALL]));
    const store = new ChartPickStore();

    store.pickUnvisitedCountryCode(ALL);

    const snap = store.getSnapshot();
    const storedVisited = JSON.parse(
      localStorage.getItem("sa:visited") ?? "[]",
    ) as string[];
    expect(snap.didReset).toBe(true);
    expect(storedVisited).toHaveLength(1);
    expect(ALL).toContain(storedVisited[0]);
  });
});
