import { expect, test } from "vitest";

import type { ApplePlaylist } from "./apple-playlists";
import {
  countPlaylistSpread,
  genreHistogram,
  selectLocalPlaylists,
} from "./playlist-selection";

function playlist(id: string, name = id): ApplePlaylist {
  return {
    id,
    name,
    appleUrl: `https://music.apple.com/kr/playlist/${id}`,
    artworkUrl: `https://art/${id}/600x600bb.jpg`,
  };
}

function feeds(
  entries: Record<string, string[]>,
): Map<string, ApplePlaylist[]> {
  return new Map(
    Object.entries(entries).map(([cc, ids]) => [
      cc,
      ids.map((id) => playlist(id)),
    ]),
  );
}

test("counts the storefronts carrying each playlist", () => {
  const spread = countPlaylistSpread(
    feeds({ kr: ["a", "b"], jp: ["a", "c"], br: ["a"] }),
  );

  expect(spread.get("a")).toBe(3);
  expect(spread.get("b")).toBe(1);
  expect(spread.get("c")).toBe(1);
});

test("counts a storefront once even when it repeats a playlist", () => {
  const spread = countPlaylistSpread(feeds({ kr: ["a", "a"], jp: ["a"] }));

  expect(spread.get("a")).toBe(2);
});

test("counts by id, not by the name a storefront localizes", () => {
  const shared = "pl.today";
  const localized = new Map([
    ["tr", [playlist(shared, "Today's Hits")]],
    ["kr", [playlist(shared, "오늘의 히트곡")]],
  ]);

  const spread = countPlaylistSpread(localized);

  expect(spread.get(shared)).toBe(2);
});

test("drops a playlist carried by more than the global share of storefronts", () => {
  const storefronts = 8;
  const spread = new Map([
    ["global", 3],
    ["local", 1],
  ]);

  const selected = selectLocalPlaylists(
    [playlist("global"), playlist("local")],
    spread,
    storefronts,
  );

  expect(selected.map((p) => p.id)).toEqual(["local"]);
});

test("keeps a playlist sitting exactly on the threshold", () => {
  const storefronts = 8;
  const spread = new Map([["edge", 2]]);

  const selected = selectLocalPlaylists(
    [playlist("edge")],
    spread,
    storefronts,
  );

  expect(selected.map((p) => p.id)).toEqual(["edge"]);
});

test("treats a playlist absent from the spread map as local to one storefront", () => {
  const selected = selectLocalPlaylists([playlist("a")], new Map(), 63);

  expect(selected.map((p) => p.id)).toEqual(["a"]);
});

test("keeps at most the per-country limit, in feed order", () => {
  const ids = ["a", "b", "c", "d"];
  const spread = new Map(ids.map((id) => [id, 1]));

  const selected = selectLocalPlaylists(
    ids.map((id) => playlist(id)),
    spread,
    63,
    { limit: 2 },
  );

  expect(selected.map((p) => p.id)).toEqual(["a", "b"]);
});

test("applies the limit after dropping global playlists", () => {
  const spread = new Map([
    ["global", 63],
    ["local1", 1],
    ["local2", 1],
  ]);

  const selected = selectLocalPlaylists(
    [playlist("global"), playlist("local1"), playlist("local2")],
    spread,
    63,
    { limit: 2 },
  );

  expect(selected.map((p) => p.id)).toEqual(["local1", "local2"]);
});

test("never drops everything when the storefront count is tiny", () => {
  const selected = selectLocalPlaylists(
    [playlist("a")],
    new Map([["a", 1]]),
    1,
  );

  expect(selected).toHaveLength(1);
});

test("tallies genres most common first", () => {
  const histogram = genreHistogram([
    "Pop",
    "Pagode",
    "Pagode",
    "Pagode",
    "Pop",
  ]);

  expect(histogram).toEqual([
    { name: "Pagode", count: 3 },
    { name: "Pop", count: 2 },
  ]);
});

test("breaks genre ties by name so the order holds across crawls", () => {
  const histogram = genreHistogram(["Rock", "Jazz"]);

  expect(histogram.map((g) => g.name)).toEqual(["Jazz", "Rock"]);
});

test("leaves unresolved genres out rather than bucketing them", () => {
  const histogram = genreHistogram(["Pop", null, null]);

  expect(histogram).toEqual([{ name: "Pop", count: 1 }]);
});

test("returns nothing when no genre resolved", () => {
  expect(genreHistogram([null, null])).toEqual([]);
});
