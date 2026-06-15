import { expect, test } from "vitest";

import type { ChartFile, Country, Track } from "../../src/lib/chart-schema";
import {
  commentaryKey,
  type CommentaryStore,
} from "../../src/lib/commentary-store";

import { computeWorklist } from "./worklist";

function track(rank: number, artist: string, name: string): Track {
  return {
    rank,
    name,
    artist,
    previewUrl: null,
    artworkUrl: "https://art/x/600x600bb.jpg",
    appleUrl: "https://music.apple.com/x/1",
    spotifySearchUrl: "https://open.spotify.com/search/x",
  };
}

function country(name: string, tracks: Track[]): Country {
  return { name, valid: true, tracks };
}

function chart(countries: ChartFile["countries"]): ChartFile {
  return { lastUpdated: "2026-05-16T00:00:00.000Z", countries };
}

function storeWith(...keys: string[]): CommentaryStore {
  const store: CommentaryStore = {};
  for (const key of keys) {
    store[key] = {
      lead: "Already written.",
      sources: ["https://example.com/a"],
      generatedAt: "2026-05-16T00:00:00.000Z",
    };
  }
  return store;
}

test("dedups a track that charts in several countries into one item", () => {
  const current = chart({
    kr: country("South Korea", [track(5, "Artist A", "Song A")]),
    us: country("United States", [track(3, "Artist A", "Song A")]),
  });

  const items = computeWorklist({ current, previous: null, commentary: {} });

  expect(items).toHaveLength(1);
  expect(items[0].bestRank).toBe(3);
  expect(items[0].countries).toEqual([
    { cc: "us", rank: 3 },
    { cc: "kr", rank: 5 },
  ]);
});

test("excludes a track that already has commentary (cache hit)", () => {
  const current = chart({
    us: country("United States", [track(1, "Artist A", "Song A")]),
  });
  const commentary = storeWith(commentaryKey("en", "Artist A", "Song A"));

  const items = computeWorklist({ current, previous: null, commentary });

  expect(items).toEqual([]);
});

test("includes a significant track with no commentary yet (cache miss)", () => {
  const current = chart({
    us: country("United States", [track(1, "Artist A", "Song A")]),
  });

  const items = computeWorklist({ current, previous: null, commentary: {} });

  expect(items.map((i) => i.name)).toEqual(["Song A"]);
});

test("without history, keeps only prominently-ranked tracks", () => {
  const current = chart({
    us: country("United States", [
      track(2, "Artist A", "Top Song"),
      track(18, "Artist B", "Deep Cut"),
    ]),
  });

  const items = computeWorklist({ current, previous: null, commentary: {} });

  expect(items.map((i) => i.name)).toEqual(["Top Song"]);
  expect(items[0].reason).toBe("top-debut");
});

test("flags a track absent from the previous snapshot as a new entry", () => {
  const previous = chart({
    us: country("United States", [track(1, "Artist A", "Song A")]),
  });
  const current = chart({
    us: country("United States", [
      track(1, "Artist A", "Song A"),
      track(2, "Artist B", "Song B"),
    ]),
  });
  const commentary = storeWith(commentaryKey("en", "Artist A", "Song A"));

  const items = computeWorklist({ current, previous, commentary });

  expect(items.map((i) => i.name)).toEqual(["Song B"]);
  expect(items[0].reason).toBe("new-entry");
});

test("flags a large climb as a rank jump", () => {
  const previous = chart({
    us: country("United States", [track(20, "Artist A", "Climber")]),
  });
  const current = chart({
    us: country("United States", [track(5, "Artist A", "Climber")]),
  });

  const items = computeWorklist({ current, previous, commentary: {} });

  expect(items).toHaveLength(1);
  expect(items[0].reason).toBe("rank-jump");
});

test("flags entering the top band from outside it as a top debut", () => {
  const previous = chart({
    us: country("United States", [track(14, "Artist A", "Riser")]),
  });
  const current = chart({
    us: country("United States", [track(8, "Artist A", "Riser")]),
  });

  const items = computeWorklist({ current, previous, commentary: {} });

  expect(items).toHaveLength(1);
  expect(items[0].reason).toBe("top-debut");
});

test("skips a track that holds a stable rank", () => {
  const previous = chart({
    us: country("United States", [track(5, "Artist A", "Steady")]),
  });
  const current = chart({
    us: country("United States", [track(6, "Artist A", "Steady")]),
  });

  const items = computeWorklist({ current, previous, commentary: {} });

  expect(items).toEqual([]);
});

test("ignores tracks from invalid (failed) countries", () => {
  const current = chart({
    us: {
      name: "United States",
      valid: false,
      tracks: [track(1, "Artist A", "Song A")],
    },
  });

  const items = computeWorklist({ current, previous: null, commentary: {} });

  expect(items).toEqual([]);
});

test("sorts the worklist by best rank ascending", () => {
  const current = chart({
    us: country("United States", [
      track(9, "Artist A", "Third"),
      track(1, "Artist B", "First"),
      track(4, "Artist C", "Second"),
    ]),
  });

  const items = computeWorklist({ current, previous: null, commentary: {} });

  expect(items.map((i) => i.name)).toEqual(["First", "Second", "Third"]);
});
