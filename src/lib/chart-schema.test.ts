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
            spotifyUrl: "https://open.spotify.com/search/Test",
          },
        ],
      },
    },
  };

  expect(() => ChartFileSchema.parse(withNullPreview)).not.toThrow();
});

test("ChartFileSchema accepts a legacy spotifySearchUrl blob and maps it to spotifyUrl", () => {
  const legacy = {
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

  const parsed = ChartFileSchema.parse(legacy);

  expect(parsed.countries.kr.tracks[0].spotifyUrl).toBe(
    "https://open.spotify.com/search/Test",
  );
  expect(parsed.countries.kr.tracks[0]).not.toHaveProperty("spotifySearchUrl");
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
            spotifyUrl: "https://open.spotify.com/search/Test",
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
            spotifyUrl: "https://open.spotify.com/search/Test",
            commentary: {
              detail: "Has detail but no lead.",
              tag: "new entry",
              claim: "why-charting",
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
            spotifyUrl: "https://open.spotify.com/search/Test",
            commentary: {
              lead: "Has a lead but no sources.",
              tag: "new entry",
              claim: "why-charting",
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

test("ChartFileSchema rejects commentary missing the required tag", () => {
  const withNoTag = {
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
            spotifyUrl: "https://open.spotify.com/search/Test",
            commentary: {
              lead: "Has a lead but no tag.",
              claim: "why-charting",
              sources: ["https://example.com/a"],
              generatedAt: "2026-05-16T00:00:00.000Z",
            },
          },
        ],
      },
    },
  };

  expect(() => ChartFileSchema.parse(withNoTag)).toThrow();
});

test("ChartFileSchema rejects commentary missing the required claim", () => {
  const withNoClaim = {
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
            spotifyUrl: "https://open.spotify.com/search/Test",
            commentary: {
              lead: "Has a lead but no claim.",
              tag: "new entry",
              sources: ["https://example.com/a"],
              generatedAt: "2026-05-16T00:00:00.000Z",
            },
          },
        ],
      },
    },
  };

  expect(() => ChartFileSchema.parse(withNoClaim)).toThrow();
});

test("ChartFileSchema rejects a claim outside the allowed set", () => {
  const withUnknownClaim = {
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
            spotifyUrl: "https://open.spotify.com/search/Test",
            commentary: {
              lead: "Has a lead and a bogus claim.",
              tag: "new entry",
              claim: "rank-jump",
              sources: ["https://example.com/a"],
              generatedAt: "2026-05-16T00:00:00.000Z",
            },
          },
        ],
      },
    },
  };

  expect(() => ChartFileSchema.parse(withUnknownClaim)).toThrow();
});

test("ChartFileSchema accepts both allowed claim values", () => {
  const withBothClaims = {
    lastUpdated: "2026-05-16T00:00:00.000Z",
    countries: {
      kr: {
        name: "South Korea",
        valid: true,
        tracks: [
          {
            rank: 1,
            name: "What It Is",
            artist: "Test Artist",
            previewUrl: null,
            artworkUrl: "https://art/600x600bb.jpg",
            appleUrl: "https://music.apple.com/kr/1",
            spotifyUrl: "https://open.spotify.com/search/WhatItIs",
            commentary: {
              lead: "A stable note about the song itself.",
              tag: "mainstay",
              claim: "what-it-is",
              sources: ["https://example.com/a"],
              generatedAt: "2026-05-16T00:00:00.000Z",
            },
          },
          {
            rank: 2,
            name: "Why Charting",
            artist: "Test Artist",
            previewUrl: null,
            artworkUrl: "https://art/600x600bb.jpg",
            appleUrl: "https://music.apple.com/kr/2",
            spotifyUrl: "https://open.spotify.com/search/WhyCharting",
            commentary: {
              lead: "A time-sensitive note about the climb.",
              tag: "new entry",
              claim: "why-charting",
              sources: ["https://example.com/b"],
              generatedAt: "2026-05-16T00:00:00.000Z",
            },
          },
        ],
      },
    },
  };

  expect(() => ChartFileSchema.parse(withBothClaims)).not.toThrow();
});

test("ChartFileSchema rejects an empty countries record", () => {
  const empty = {
    lastUpdated: "2026-05-16T00:00:00.000Z",
    countries: {},
  };

  expect(() => ChartFileSchema.parse(empty)).toThrow();
});
