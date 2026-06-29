import { describe, expect, test } from "vitest";

import type { Track } from "@/lib/chart-schema";

import { firstCommentaryRank } from "./first-commentary-rank";

function track(rank: number, hasCommentary: boolean): Track {
  return {
    rank,
    name: `Track ${rank}`,
    artist: `Artist ${rank}`,
    previewUrl: "https://example.com/preview.m4a",
    artworkUrl: "https://example.com/art.jpg",
    appleUrl: "https://example.com/apple",
    spotifyUrl: "https://example.com/spotify",
    commentary: hasCommentary
      ? {
          lead: "lead",
          tag: "tag",
          claim: "what-it-is",
          sources: ["https://example.com/source"],
          generatedAt: "2026-01-01T00:00:00Z",
        }
      : null,
  };
}

describe("firstCommentaryRank", () => {
  test("returns null when the list is empty", () => {
    expect(firstCommentaryRank([])).toBeNull();
  });

  test("returns null when no track carries commentary", () => {
    const tracks = [track(1, false), track(2, false), track(3, false)];

    expect(firstCommentaryRank(tracks)).toBeNull();
  });

  test("returns the rank of the first commentary-bearing track, not rank 1", () => {
    const tracks = [
      track(1, false),
      track(2, false),
      track(3, true),
      track(4, true),
    ];

    expect(firstCommentaryRank(tracks)).toBe(3);
  });

  test("treats a missing commentary field as no commentary", () => {
    const withoutField = track(1, false);
    delete withoutField.commentary;
    const tracks = [withoutField, track(2, true)];

    expect(firstCommentaryRank(tracks)).toBe(2);
  });
});
