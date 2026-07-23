import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { ChartTrack } from "@/lib/chart-schema";

import { ROW_COLLAPSE_MS, useRowTransitions } from "./use-row-transitions";

function track(rank: number): ChartTrack {
  return {
    rank,
    name: `Track ${rank}`,
    artist: `Artist ${rank}`,
    previewUrl: null,
    artworkUrl: "https://art.test/a.jpg",
    appleUrl: `https://music.apple.com/xx/song/${rank}`,
    spotifyUrl: `https://open.spotify.com/track/${rank}`,
  };
}

/** The rank→transition pairs the hook returns, for compact assertions. */
function tags(display: { track: ChartTrack; transition: string }[]) {
  return display.map((row) => [row.track.rank, row.transition] as const);
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const WHOLE = [track(1), track(2), track(3)];
const NARROWED = [track(2)];

describe("useRowTransitions", () => {
  test("opens on the given rows, all still", () => {
    const { result } = renderHook(() =>
      useRowTransitions(WHOLE, "kr:songs", "most_played"),
    );

    expect(tags(result.current)).toEqual([
      [1, "stable"],
      [2, "stable"],
      [3, "stable"],
    ]);
  });

  test("narrowing marks the dropped rows leaving, in rank order", () => {
    const { result, rerender } = renderHook(
      ({ rows, mode }) => useRowTransitions(rows, "kr:songs", mode),
      { initialProps: { rows: WHOLE, mode: "most_played" } },
    );

    rerender({ rows: NARROWED, mode: "only_here" });

    expect(tags(result.current)).toEqual([
      [1, "leaving"],
      [2, "stable"],
      [3, "leaving"],
    ]);
  });

  test("widening marks the added rows entering", () => {
    const { result, rerender } = renderHook(
      ({ rows, mode }) => useRowTransitions(rows, "kr:songs", mode),
      { initialProps: { rows: NARROWED, mode: "only_here" } },
    );

    rerender({ rows: WHOLE, mode: "most_played" });

    expect(tags(result.current)).toEqual([
      [1, "entering"],
      [2, "stable"],
      [3, "entering"],
    ]);
  });

  test("drops the leaving rows once the collapse has run", () => {
    const { result, rerender } = renderHook(
      ({ rows, mode }) => useRowTransitions(rows, "kr:songs", mode),
      { initialProps: { rows: WHOLE, mode: "most_played" } },
    );

    rerender({ rows: NARROWED, mode: "only_here" });
    act(() => {
      vi.advanceTimersByTime(ROW_COLLAPSE_MS);
    });

    expect(tags(result.current)).toEqual([[2, "stable"]]);
  });

  test("a new mount snaps rather than animating", () => {
    const { result, rerender } = renderHook(
      ({ rows, key }) => useRowTransitions(rows, key, "most_played"),
      { initialProps: { rows: WHOLE, key: "kr:songs" } },
    );

    // A different chart is a different list, not a narrowing of this one.
    rerender({ rows: NARROWED, key: "kr:pl.one" });

    expect(tags(result.current)).toEqual([[2, "stable"]]);
  });

  test("a tail arriving under the same mode snaps rather than opening", () => {
    const { result, rerender } = renderHook(
      ({ rows }) => useRowTransitions(rows, "kr:songs", "most_played"),
      { initialProps: { rows: WHOLE } },
    );

    // The listener waited for these, so they are shown, not animated in.
    rerender({ rows: [...WHOLE, track(4)] });

    expect(tags(result.current)).toEqual([
      [1, "stable"],
      [2, "stable"],
      [3, "stable"],
      [4, "stable"],
    ]);
  });
});
