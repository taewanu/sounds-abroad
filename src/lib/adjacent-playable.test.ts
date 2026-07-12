import { describe, expect, test } from "vitest";

import { findAdjacentPlayable } from "./adjacent-playable";
import type { Track } from "./chart-schema";

function makeTrack(
  rank: number,
  previewUrl: string | null,
  appleUrl = `https://music.apple.com/x?i=${rank}`,
): Track {
  return {
    rank,
    name: `Track ${rank}`,
    artist: `Artist ${rank}`,
    previewUrl,
    artworkUrl: "https://example.com/art.jpg",
    appleUrl,
    spotifyUrl: "https://open.spotify.com/search/x",
  };
}

describe("findAdjacentPlayable", () => {
  test("next skips a track with no preview", () => {
    const current = makeTrack(1, "https://example.com/1.m4a");
    const gap = makeTrack(2, null);
    const target = makeTrack(3, "https://example.com/3.m4a");
    const tracks = [current, gap, target];

    expect(findAdjacentPlayable(tracks, current, 1)).toBe(target);
  });

  test("prev skips a track with no preview", () => {
    const target = makeTrack(1, "https://example.com/1.m4a");
    const gap = makeTrack(2, null);
    const current = makeTrack(3, "https://example.com/3.m4a");
    const tracks = [target, gap, current];

    expect(findAdjacentPlayable(tracks, current, -1)).toBe(target);
  });

  test("next at the last playable returns null", () => {
    const first = makeTrack(1, "https://example.com/1.m4a");
    const last = makeTrack(2, "https://example.com/2.m4a");
    const trailingGap = makeTrack(3, null);
    const tracks = [first, last, trailingGap];

    expect(findAdjacentPlayable(tracks, last, 1)).toBeNull();
  });

  test("prev at the first playable returns null", () => {
    const leadingGap = makeTrack(1, null);
    const first = makeTrack(2, "https://example.com/2.m4a");
    const second = makeTrack(3, "https://example.com/3.m4a");
    const tracks = [leadingGap, first, second];

    expect(findAdjacentPlayable(tracks, first, -1)).toBeNull();
  });

  test("returns null when the current track is not in the list", () => {
    const tracks = [
      makeTrack(1, "https://example.com/1.m4a"),
      makeTrack(2, "https://example.com/2.m4a"),
    ];
    const absent = makeTrack(9, "https://example.com/absent.m4a");

    expect(findAdjacentPlayable(tracks, absent, 1)).toBeNull();
  });

  test("returns null when the current track is null", () => {
    const tracks = [makeTrack(1, "https://example.com/1.m4a")];

    expect(findAdjacentPlayable(tracks, null, 1)).toBeNull();
  });

  test("a list with one playable returns null in both directions", () => {
    const leadingGap = makeTrack(1, null);
    const only = makeTrack(2, "https://example.com/2.m4a");
    const trailingGap = makeTrack(3, null);
    const tracks = [leadingGap, only, trailingGap];

    expect(findAdjacentPlayable(tracks, only, 1)).toBeNull();
    expect(findAdjacentPlayable(tracks, only, -1)).toBeNull();
  });

  test("locates the current track by identity, not its shared preview asset", () => {
    // The head and tail share one preview asset but are distinct songs. Keying
    // on previewUrl would find the head's index for the tail and step forward
    // from the wrong row; identity anchors on the tail, whose next is null.
    const shared = "https://example.com/shared.m4a";
    const head = makeTrack(1, shared);
    const middle = makeTrack(2, "https://example.com/2.m4a");
    const tail = makeTrack(3, shared);
    const tracks = [head, middle, tail];

    expect(findAdjacentPlayable(tracks, tail, 1)).toBeNull();
    expect(findAdjacentPlayable(tracks, tail, -1)).toBe(middle);
  });
});
