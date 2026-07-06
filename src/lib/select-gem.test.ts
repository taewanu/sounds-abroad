import { describe, expect, test } from "vitest";

import type { Track } from "./chart-schema";
import { selectGem } from "./select-gem";

function makeTrack(rank: number, spread?: number): Track {
  return {
    rank,
    name: `Track ${rank}`,
    artist: `Artist ${rank}`,
    previewUrl: null,
    artworkUrl: "https://example.com/art.jpg",
    appleUrl: "https://music.apple.com/x",
    spotifyUrl: "https://open.spotify.com/search/x",
    spread,
  };
}

describe("selectGem", () => {
  test("the rank-1 track with spread 1 is entirely their own", () => {
    const gem = makeTrack(1, 1);
    const tracks = [gem, makeTrack(2, 5), makeTrack(3, 12)];

    expect(selectGem(tracks)).toEqual({ gem, tier: "entirely their own" });
  });

  test("a spread-1 track that isn't rank 1 is a local favorite", () => {
    const topTrack = makeTrack(1, 8);
    const gem = makeTrack(3, 1);
    const tracks = [topTrack, makeTrack(2, 6), gem];

    expect(selectGem(tracks)).toEqual({ gem, tier: "a local favorite" });
  });

  test("a top-ranked track with spread 2 or 3 is a local favorite", () => {
    const gem = makeTrack(1, 3);
    const tracks = [gem, makeTrack(2, 8), makeTrack(3, 15)];

    expect(selectGem(tracks)).toEqual({ gem, tier: "a local favorite" });
  });

  test("a homogenized market with no low-spread track falls back to the lowest-spread, best-ranked track", () => {
    const gem = makeTrack(2, 20);
    const tracks = [makeTrack(1, 25), gem, makeTrack(3, 20)];

    expect(selectGem(tracks)).toEqual({
      gem,
      tier: "their most local pick today",
    });
  });

  test("in a homogenized market, picks the exact lowest-spread track even among close values", () => {
    const gem = makeTrack(2, 38);
    const tracks = [makeTrack(1, 40), gem, makeTrack(3, 40)];

    expect(selectGem(tracks)).toEqual({
      gem,
      tier: "their most local pick today",
    });
  });

  test("treats a missing spread as lower priority than any known spread in the fallback tie-break", () => {
    const gem = makeTrack(2, 20);
    const tracks = [makeTrack(1, undefined), gem, makeTrack(3, undefined)];

    expect(selectGem(tracks)).toEqual({
      gem,
      tier: "their most local pick today",
    });
  });

  test("returns null for an empty track list", () => {
    expect(selectGem([])).toBeNull();
  });
});
