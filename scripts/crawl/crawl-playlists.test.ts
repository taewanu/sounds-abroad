import { expect, test, vi } from "vitest";

import type { Playlist } from "../../src/lib/chart-schema";

import type { ApplePlaylist } from "./apple-playlists";
import {
  bakePlaylistSpread,
  crawlCountryPlaylists,
  isContractBroken,
  type PlaylistAxisDeps,
} from "./crawl-playlists";
import type { LookupResult } from "./itunes-lookup";
import type { BatchLookup } from "./lookup-retry";
import { PlaylistPageError, type PlaylistTrack } from "./playlist-page";

const NOW = new Date("2026-07-20T00:00:00.000Z");
const now = () => NOW;

function applePlaylist(id: string): ApplePlaylist {
  return {
    id,
    name: `${id} name`,
    appleUrl: `https://music.apple.com/kr/playlist/${id}`,
    artworkUrl: `https://art/${id}/600x600bb.jpg`,
  };
}

function scrapedTrack(id: string, rank: number): PlaylistTrack {
  return {
    rank,
    id,
    name: `track ${id}`,
    artist: `artist ${id}`,
    appleUrl: `https://music.apple.com/kr/album/x?i=${id}`,
    artworkUrl: `https://art/track/${id}/600x600bb.jpg`,
  };
}

function lookupReturning(
  genreById: Record<string, string | null>,
): BatchLookup {
  return vi.fn<BatchLookup>(async (ids) => {
    const resolved = new Map<string, LookupResult>();
    for (const id of ids) {
      resolved.set(id, {
        id,
        previewUrl: `https://preview/${id}.m4a`,
        genre: genreById[id] ?? null,
      });
    }
    return resolved;
  });
}

function makeDeps(overrides: Partial<PlaylistAxisDeps> = {}): PlaylistAxisDeps {
  return {
    fetchPlaylistPage: vi.fn(async () => [
      scrapedTrack("t1", 1),
      scrapedTrack("t2", 2),
    ]),
    lookupTracks: lookupReturning({ t1: "K-Pop", t2: "K-Pop" }),
    ...overrides,
  };
}

test("returns metadata and a track file for each scraped playlist", async () => {
  const selected = [applePlaylist("pl.a"), applePlaylist("pl.b")];

  const result = await crawlCountryPlaylists("kr", selected, makeDeps(), now);

  expect(result.playlists.map((p) => p.id)).toEqual(["pl.a", "pl.b"]);
  expect(result.files.map((f) => f.id)).toEqual(["pl.a", "pl.b"]);
  expect(result.valid).toBe(true);
});

test("carries the feed's name and artwork onto the metadata", async () => {
  const playlist = applePlaylist("pl.a");

  const result = await crawlCountryPlaylists("kr", [playlist], makeDeps(), now);

  expect(result.playlists[0]).toMatchObject({
    id: playlist.id,
    name: playlist.name,
    appleUrl: playlist.appleUrl,
    artworkUrl: playlist.artworkUrl,
    trackCount: 2,
  });
});

test("tallies the genre histogram from the resolved member tracks", async () => {
  const deps = makeDeps({
    lookupTracks: lookupReturning({ t1: "K-Pop", t2: "Rock" }),
  });

  const result = await crawlCountryPlaylists(
    "kr",
    [applePlaylist("pl.a")],
    deps,
    now,
  );

  expect(result.playlists[0].genres).toEqual([
    { name: "K-Pop", count: 1 },
    { name: "Rock", count: 1 },
  ]);
});

test("stamps each track file with the run's timestamp", async () => {
  const result = await crawlCountryPlaylists(
    "kr",
    [applePlaylist("pl.a")],
    makeDeps(),
    now,
  );

  expect(result.files[0].lastUpdated).toBe(NOW.toISOString());
});

test("keeps a track whose preview did not resolve", async () => {
  const deps = makeDeps({
    lookupTracks: vi.fn<BatchLookup>(async () => new Map()),
  });

  const result = await crawlCountryPlaylists(
    "kr",
    [applePlaylist("pl.a")],
    deps,
    now,
  );

  expect(result.files[0].tracks.every((t) => t.previewUrl === null)).toBe(true);
  expect(result.files[0].tracks).toHaveLength(2);
});

test("skips a playlist whose page failed, keeping the others", async () => {
  const failingId = "pl.a";
  const deps = makeDeps({
    fetchPlaylistPage: vi.fn(async (playlistId: string) => {
      if (playlistId === failingId)
        throw new PlaylistPageError(playlistId, "http", "404 Not Found");
      return [scrapedTrack("t1", 1)];
    }),
  });

  const result = await crawlCountryPlaylists(
    "kr",
    [applePlaylist(failingId), applePlaylist("pl.b")],
    deps,
    now,
  );

  expect(result.playlists.map((p) => p.id)).toEqual(["pl.b"]);
  expect(result.pageFailures).toBe(1);
  expect(result.pagesAttempted).toBe(2);
});

test("reports the axis invalid when every page failed", async () => {
  const deps = makeDeps({
    fetchPlaylistPage: vi.fn(async (playlistId: string) => {
      throw new PlaylistPageError(playlistId, "shape", "block gone");
    }),
  });

  const result = await crawlCountryPlaylists(
    "kr",
    [applePlaylist("pl.a")],
    deps,
    now,
  );

  expect(result.valid).toBe(false);
  expect(result.files).toHaveLength(0);
});

test("rethrows an error that is not a page failure", async () => {
  const deps = makeDeps({
    fetchPlaylistPage: vi.fn(async () => {
      throw new TypeError("unexpected");
    }),
  });

  await expect(
    crawlCountryPlaylists("kr", [applePlaylist("pl.a")], deps, now),
  ).rejects.toThrow("unexpected");
});

test("reads ordinary churn as intact", () => {
  expect(isContractBroken(10, 2)).toBe(false);
});

test("reads most pages failing together as a broken contract", () => {
  expect(isContractBroken(10, 9)).toBe(true);
});

test("reads no attempts as intact rather than broken", () => {
  expect(isContractBroken(0, 0)).toBe(false);
});

test("bakes each playlist's storefront count onto its metadata", () => {
  const kr: Playlist[] = [
    {
      id: "pl.a",
      name: "a",
      appleUrl: "https://music.apple.com/kr/playlist/pl.a",
      artworkUrl: "https://art/a/600x600bb.jpg",
      genres: [],
      trackCount: 1,
    },
  ];

  bakePlaylistSpread(new Map([["kr", kr]]), new Map([["pl.a", 4]]));

  expect(kr[0].spread).toBe(4);
});
