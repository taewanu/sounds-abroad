import { expect, test } from "vitest";

import { SONGS_CHART } from "./chart-ref";
import type { Country } from "./chart-schema";
import { chartFromUrl, chartQuery } from "./chart-url";

function country(playlistIds: string[]): Country {
  return {
    name: "A country",
    valid: true,
    tracks: [],
    playlists: playlistIds.map((id) => ({
      id,
      name: id,
      appleUrl: `https://music.apple.com/xx/playlist/${id}`,
      artworkUrl: "https://art.test/p.jpg",
      genres: [],
      trackCount: 1,
    })),
    playlistsValid: true,
  };
}

test("names only the country while its songs chart is open", () => {
  expect(chartQuery("br", SONGS_CHART)).toBe("?cc=br");
});

test("names the chart open beside the country", () => {
  expect(chartQuery("br", "pl.a")).toBe("?cc=br&chart=pl.a");
});

test("escapes a chart id so it cannot reshape the query", () => {
  expect(chartQuery("br", "pl.a&cc=us")).toBe("?cc=br&chart=pl.a%26cc%3Dus");
});

test("reads back the chart a query names", () => {
  expect(chartFromUrl("pl.a", country(["pl.a"]))).toBe("pl.a");
});

test("falls back to the songs chart when the query names none", () => {
  expect(chartFromUrl(null, country(["pl.a"]))).toBe(SONGS_CHART);
});

test("falls back when the named chart is not one this country carries", () => {
  expect(chartFromUrl("pl.elsewhere", country(["pl.a"]))).toBe(SONGS_CHART);
});

test("falls back for a country carrying no playlists at all", () => {
  expect(chartFromUrl("pl.a", { name: "A", valid: true, tracks: [] })).toBe(
    SONGS_CHART,
  );
});
