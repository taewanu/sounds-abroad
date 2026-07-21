import { describe, expect, test } from "vitest";

import { isPlaylistRef, SONGS_CHART } from "./chart-ref";

describe("chart-ref", () => {
  test("reads the songs sentinel as the songs chart", () => {
    expect(isPlaylistRef(SONGS_CHART)).toBe(false);
  });

  test("reads a playlist id as a playlist chart", () => {
    expect(isPlaylistRef("pl.0f11015342a9473c849f0af4ab5f509c")).toBe(true);
  });

  test("keeps the sentinel outside the namespace playlist ids are drawn from", () => {
    expect(SONGS_CHART.startsWith("pl.")).toBe(false);
  });
});
