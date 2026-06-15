import { expect, test } from "vitest";

import fixture from "./__fixtures__/charts.json";
import { ChartFileSchema } from "./chart-schema";

test("ChartFileSchema parses the hand-crafted fixture", () => {
  expect(() => ChartFileSchema.parse(fixture)).not.toThrow();
});

test("ChartFileSchema accepts null previewUrl (placeholder for lookup-failed tracks)", () => {
  const withNullPreview = {
    lastUpdated: "2026-05-16T00:00:00.000Z",
    countries: {
      kr: {
        name: "South Korea",
        valid: true,
        tracks: [
          {
            rank: 1,
            name: "Test",
            artist: "Test Artist",
            previewUrl: null,
            artworkUrl: "https://art/600x600bb.jpg",
            appleUrl: "https://music.apple.com/kr/1",
            spotifySearchUrl: "https://open.spotify.com/search/Test",
          },
        ],
      },
    },
  };

  expect(() => ChartFileSchema.parse(withNullPreview)).not.toThrow();
});

test("ChartFileSchema accepts null commentary (track skipped or failed generation)", () => {
  const withNullCommentary = {
    lastUpdated: "2026-05-16T00:00:00.000Z",
    countries: {
      kr: {
        name: "South Korea",
        valid: true,
        tracks: [
          {
            rank: 1,
            name: "Test",
            artist: "Test Artist",
            previewUrl: null,
            artworkUrl: "https://art/600x600bb.jpg",
            appleUrl: "https://music.apple.com/kr/1",
            spotifySearchUrl: "https://open.spotify.com/search/Test",
            commentary: null,
          },
        ],
      },
    },
  };

  expect(() => ChartFileSchema.parse(withNullCommentary)).not.toThrow();
});

test("ChartFileSchema rejects commentary missing the required lead", () => {
  const withBadCommentary = {
    lastUpdated: "2026-05-16T00:00:00.000Z",
    countries: {
      kr: {
        name: "South Korea",
        valid: true,
        tracks: [
          {
            rank: 1,
            name: "Test",
            artist: "Test Artist",
            previewUrl: null,
            artworkUrl: "https://art/600x600bb.jpg",
            appleUrl: "https://music.apple.com/kr/1",
            spotifySearchUrl: "https://open.spotify.com/search/Test",
            commentary: {
              detail: "Has detail but no lead.",
              sources: ["https://example.com/a"],
              generatedAt: "2026-05-16T00:00:00.000Z",
            },
          },
        ],
      },
    },
  };

  expect(() => ChartFileSchema.parse(withBadCommentary)).toThrow();
});

test("ChartFileSchema rejects commentary with an empty sources array", () => {
  const withEmptySources = {
    lastUpdated: "2026-05-16T00:00:00.000Z",
    countries: {
      kr: {
        name: "South Korea",
        valid: true,
        tracks: [
          {
            rank: 1,
            name: "Test",
            artist: "Test Artist",
            previewUrl: null,
            artworkUrl: "https://art/600x600bb.jpg",
            appleUrl: "https://music.apple.com/kr/1",
            spotifySearchUrl: "https://open.spotify.com/search/Test",
            commentary: {
              lead: "Has a lead but no sources.",
              sources: [],
              generatedAt: "2026-05-16T00:00:00.000Z",
            },
          },
        ],
      },
    },
  };

  expect(() => ChartFileSchema.parse(withEmptySources)).toThrow();
});

test("ChartFileSchema rejects an empty countries record", () => {
  const empty = {
    lastUpdated: "2026-05-16T00:00:00.000Z",
    countries: {},
  };

  expect(() => ChartFileSchema.parse(empty)).toThrow();
});
