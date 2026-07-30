import { describe, expect, test } from "vitest";

import type { Country, Track } from "./chart-schema";
import { selectGem } from "./select-gem";
import { shuffleSeat } from "./shuffle-seat";

const PREVIEW = "https://audio-ssl.itunes.apple.com/preview.m4a";

function makeTrack(
  rank: number,
  previewUrl: string | null,
  spread?: number,
): Track {
  return {
    rank,
    name: `Track ${rank}`,
    artist: `Artist ${rank}`,
    previewUrl,
    artworkUrl: "https://example.com/art.jpg",
    appleUrl: "https://music.apple.com/x",
    spotifyUrl: "https://open.spotify.com/search/x",
    spread,
  };
}

function makeCountry(tracks: Track[]): Country {
  return { name: "Chart under test", valid: true, tracks };
}

describe("shuffleSeat", () => {
  test("a landing takes the seat the country's gem holds", () => {
    const country = makeCountry([
      makeTrack(1, PREVIEW, 9),
      makeTrack(2, PREVIEW, 1),
      makeTrack(3, PREVIEW, 4),
    ]);

    expect(shuffleSeat(country)).toEqual(selectGem(country.tracks)?.gem);
  });

  test("a gem that carries no preview leaves the landing silent", () => {
    const country = makeCountry([
      makeTrack(1, null, 1),
      makeTrack(2, PREVIEW, 6),
    ]);

    expect(shuffleSeat(country)).toBeNull();
  });

  test("a country whose chart is empty offers no seat", () => {
    expect(shuffleSeat(makeCountry([]))).toBeNull();
  });

  test("a country the payload does not carry offers no seat", () => {
    expect(shuffleSeat(undefined)).toBeNull();
  });
});
