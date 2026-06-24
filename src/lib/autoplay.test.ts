import { describe, expect, test } from "vitest";

import type { Country, Track } from "@/lib/chart-schema";

import { pickAutoplayTrack } from "./autoplay";

function track(rank: number, previewUrl: string | null): Track {
  return {
    rank,
    name: `Track ${rank}`,
    artist: `Artist ${rank}`,
    previewUrl,
    artworkUrl: "https://example.com/art.jpg",
    appleUrl: "https://example.com/apple",
    spotifySearchUrl: "https://example.com/spotify",
  };
}

function country(tracks: Track[]): Country {
  return { name: "Testland", valid: true, tracks };
}

describe("pickAutoplayTrack", () => {
  test("returns the rank-1 track when its preview is present", () => {
    const top = track(1, "https://cdn.example.com/1.m4a");

    expect(
      pickAutoplayTrack(
        country([top, track(2, "https://cdn.example.com/2.m4a")]),
      ),
    ).toBe(top);
  });

  test("skips leading tracks whose preview is null", () => {
    const playable = track(3, "https://cdn.example.com/3.m4a");

    expect(
      pickAutoplayTrack(country([track(1, null), track(2, null), playable])),
    ).toBe(playable);
  });

  test("returns null when no track has a preview", () => {
    expect(
      pickAutoplayTrack(country([track(1, null), track(2, null)])),
    ).toBeNull();
  });

  test("returns null for a country with no tracks", () => {
    expect(pickAutoplayTrack(country([]))).toBeNull();
  });
});
