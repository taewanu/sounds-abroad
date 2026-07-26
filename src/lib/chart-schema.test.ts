import { expect, test } from "vitest";

import fixture from "./__fixtures__/charts.json";
import { ChartFileSchema, PlaylistFileSchema } from "./chart-schema";

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
            artworkUrl: "https://is1-ssl.mzstatic.com/600x600bb.jpg",
            appleUrl: "https://music.apple.com/kr/1",
            spotifyUrl: "https://open.spotify.com/search/Test",
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
            artworkUrl: "https://is1-ssl.mzstatic.com/600x600bb.jpg",
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
            artworkUrl: "https://is1-ssl.mzstatic.com/600x600bb.jpg",
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
            artworkUrl: "https://is1-ssl.mzstatic.com/600x600bb.jpg",
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
            artworkUrl: "https://is1-ssl.mzstatic.com/600x600bb.jpg",
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
            artworkUrl: "https://is1-ssl.mzstatic.com/600x600bb.jpg",
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
            artworkUrl: "https://is1-ssl.mzstatic.com/600x600bb.jpg",
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
            artworkUrl: "https://is1-ssl.mzstatic.com/600x600bb.jpg",
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
            artworkUrl: "https://is1-ssl.mzstatic.com/600x600bb.jpg",
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

test("ChartFileSchema accepts a track with a baked spread", () => {
  const withSpread = {
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
            artworkUrl: "https://is1-ssl.mzstatic.com/600x600bb.jpg",
            appleUrl: "https://music.apple.com/kr/1",
            spotifyUrl: "https://open.spotify.com/search/Test",
            spread: 3,
          },
        ],
      },
    },
  };

  expect(() => ChartFileSchema.parse(withSpread)).not.toThrow();
});

test("ChartFileSchema rejects an empty countries record", () => {
  const empty = {
    lastUpdated: "2026-05-16T00:00:00.000Z",
    countries: {},
  };

  expect(() => ChartFileSchema.parse(empty)).toThrow();
});

test("PlaylistFileSchema parses a blob written before spotifyUrl existed", () => {
  // The crawl publishes ~600 playlist blobs and rewrites one only when that
  // playlist crawls successfully, so entries written before an additive field
  // stay live indefinitely. Every additive field here is optional for that
  // reason.
  const published = {
    id: "pl.48229b41bbfc47d7af39dae8e8b5276e",
    lastUpdated: "2026-07-20T08:25:33.368Z",
    tracks: [
      {
        rank: 1,
        name: "Ice Cream",
        artist: "연준",
        previewUrl: "https://audio-ssl.itunes.apple.com/1.m4a",
        artworkUrl: "https://is1-ssl.mzstatic.com/1/600x600bb.jpg",
        appleUrl: "https://music.apple.com/kr/album/x?i=1",
      },
    ],
  };

  expect(PlaylistFileSchema.safeParse(published).success).toBe(true);
});

// The URL and id rules are wired into these schemas, so a payload carrying a
// value they refuse must fail to parse rather than reach a rendered row. The
// store is the only thing between a crawl and the document, which is what makes
// the read side worth fencing as well as the write side.
test.each([
  { field: "artworkUrl", value: "javascript:alert(1)" },
  { field: "artworkUrl", value: "https://evil.test/600x600bb.jpg" },
  { field: "appleUrl", value: "javascript:alert(1)" },
  { field: "appleUrl", value: "https://evil.test/kr/song/1" },
  { field: "previewUrl", value: "javascript:alert(1)" },
  { field: "spotifyUrl", value: "https://evil.test/track/1" },
])(
  "a chart whose track $field is $value fails to parse",
  ({ field, value }) => {
    const chartWith = (overrides: Record<string, unknown>) => ({
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
              previewUrl: "https://audio-ssl.itunes.apple.com/1.m4a",
              artworkUrl: "https://is1-ssl.mzstatic.com/600x600bb.jpg",
              appleUrl: "https://music.apple.com/kr/1",
              spotifyUrl: "https://open.spotify.com/track/1",
              ...overrides,
            },
          ],
        },
      },
    });

    // Without the mutation the same payload has to parse, or the refusal says
    // nothing about the field under test.
    expect(ChartFileSchema.safeParse(chartWith({})).success).toBe(true);
    expect(
      ChartFileSchema.safeParse(chartWith({ [field]: value })).success,
    ).toBe(false);
  },
);

// Traversal is the risk the id rule closes: an id becomes the key a playlist
// chart is written under and read from.
test.each(["../../commentary/v1/commentary", "pl.not-a-playlist-id", "pl."])(
  "a playlist chart whose id is %j fails to parse",
  (id) => {
    const playlistWith = (playlistId: string) => ({
      id: playlistId,
      lastUpdated: "2026-05-16T00:00:00.000Z",
      tracks: [
        {
          rank: 1,
          name: "Test",
          artist: "Test Artist",
          previewUrl: "https://audio-ssl.itunes.apple.com/1.m4a",
          artworkUrl: "https://is1-ssl.mzstatic.com/600x600bb.jpg",
          appleUrl: "https://music.apple.com/kr/1",
        },
      ],
    });

    expect(
      PlaylistFileSchema.safeParse(
        playlistWith("pl.d838905f50af4200a2ebbc614922dee9"),
      ).success,
    ).toBe(true);
    expect(PlaylistFileSchema.safeParse(playlistWith(id)).success).toBe(false);
  },
);
