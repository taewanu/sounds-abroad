import { expect, test } from "vitest";

import { SONGS_CHART } from "./chart-ref";
import type { Country } from "./chart-schema";
import {
  chartFromUrl,
  chartPath,
  countryCodeFromPath,
  countryPath,
} from "./chart-url";

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
  expect(chartPath("br", SONGS_CHART)).toBe("/c/br");
});

test("names the chart open beside the country", () => {
  expect(chartPath("br", "pl.a")).toBe("/c/br?chart=pl.a");
});

test("escapes a chart id so it cannot reshape the query", () => {
  expect(chartPath("br", "pl.a&cc=us")).toBe("/c/br?chart=pl.a%26cc%3Dus");
});

test("the bare country path is the chart path of the songs chart", () => {
  expect(countryPath("br")).toBe(chartPath("br", SONGS_CHART));
});

test("reads back the country a path names", () => {
  expect(countryCodeFromPath("/c/br")).toBe("br");
});

test("tolerates a trailing slash on a country path", () => {
  expect(countryCodeFromPath("/c/br/")).toBe("br");
});

test("names no country for a path outside the country segment", () => {
  expect(countryCodeFromPath("/")).toBeNull();
  expect(countryCodeFromPath("/c/")).toBeNull();
  expect(countryCodeFromPath("/c/br/deeper")).toBeNull();
  expect(countryCodeFromPath("/about")).toBeNull();
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
