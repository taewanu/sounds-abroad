import { describe, expect, test } from "vitest";

import type { ChartTrack } from "@/lib/chart-schema";

import { onlyHere, songsChartRows, withPlaying } from "./chart-mode";

function track(rank: number, spread?: number): ChartTrack {
  return {
    rank,
    name: `Track ${rank}`,
    artist: `Artist ${rank}`,
    previewUrl: "https://example.com/preview.m4a",
    artworkUrl: "https://example.com/art.jpg",
    appleUrl: "https://example.com/apple",
    spotifyUrl: "https://example.com/spotify",
    ...(spread === undefined ? {} : { spread }),
  };
}

describe("onlyHere", () => {
  test("returns nothing for an empty chart", () => {
    expect(onlyHere([])).toEqual([]);
  });

  test("keeps the tracks no other chart carries", () => {
    const exclusive = track(2, 1);
    const alsoExclusive = track(7, 1);

    expect(
      onlyHere([track(1, 12), exclusive, track(3, 2), alsoExclusive]),
    ).toEqual([exclusive, alsoExclusive]);
  });

  test("drops a track any other chart carries, however few", () => {
    expect(onlyHere([track(1, 2)])).toEqual([]);
  });

  test("drops a track whose spread was never counted", () => {
    expect(onlyHere([track(1), track(2, 1)])).toEqual([track(2, 1)]);
  });

  test("keeps the order it was given", () => {
    const chart = [track(9, 1), track(4, 1), track(6, 1)];

    expect(onlyHere(chart).map((t) => t.rank)).toEqual([9, 4, 6]);
  });

  test("leaves the chart it was given untouched", () => {
    const chart = [track(1, 3), track(2, 1)];

    onlyHere(chart);

    expect(chart).toHaveLength(2);
  });
});

describe("songsChartRows", () => {
  test("lists only what travelled until the rest is read", () => {
    expect(
      songsChartRows("most_played", [track(1, 4), track(2, 1)], null).map(
        (t) => t.rank,
      ),
    ).toEqual([1, 2]);
  });

  test("continues into the rest once it is in hand", () => {
    const rows = songsChartRows(
      "most_played",
      [track(1, 4)],
      [track(2, 1), track(3, 8)],
    );

    expect(rows.map((t) => t.rank)).toEqual([1, 2, 3]);
  });

  test("narrows the whole chart, not the travelled rows alone", () => {
    const rows = songsChartRows(
      "only_here",
      [track(1, 4), track(2, 1)],
      [track(3, 1), track(4, 9)],
    );

    expect(rows.map((t) => t.rank)).toEqual([2, 3]);
  });
});

describe("withPlaying", () => {
  test("leaves a chart that already holds the track", () => {
    const rows = [track(1, 1), track(2, 1)];

    expect(withPlaying(rows, rows[1])).toEqual(rows);
  });

  test("leaves a chart alone when nothing is playing", () => {
    const rows = [track(1, 1)];

    expect(withPlaying(rows, null)).toEqual(rows);
  });

  test("puts a filtered-out track back at its own rank", () => {
    const playing = track(5, 9);

    expect(
      withPlaying([track(2, 1), track(9, 1)], playing).map((t) => t.rank),
    ).toEqual([2, 5, 9]);
  });

  test("puts a track ranked past every row at the end", () => {
    const playing = track(40, 9);

    expect(withPlaying([track(2, 1)], playing).map((t) => t.rank)).toEqual([
      2, 40,
    ]);
  });

  test("puts a track ranked before every row at the front", () => {
    const playing = track(1, 9);

    expect(withPlaying([track(6, 1)], playing).map((t) => t.rank)).toEqual([
      1, 6,
    ]);
  });

  test("leaves the chart it was given untouched", () => {
    const rows = [track(2, 1)];

    withPlaying(rows, track(5, 9));

    expect(rows).toHaveLength(1);
  });
});
