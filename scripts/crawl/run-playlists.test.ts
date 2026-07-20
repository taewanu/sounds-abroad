import { expect, test, vi } from "vitest";

import type {
  ChartFile,
  Country,
  Playlist,
  PlaylistFile,
} from "../../src/lib/chart-schema";
import type { CountryEntry } from "../../src/lib/countries";

import type { ApplePlaylist } from "./apple-playlists";
import type { AppleRssTrack } from "./apple-rss";
import type { CountryPlaylistsResult } from "./crawl-playlists";
import type { LookupResult } from "./itunes-lookup";
import type { BatchLookup } from "./lookup-retry";
import type { PlaylistTrack } from "./playlist-page";
import {
  crawlAll,
  PlaylistContractError,
  resolvePlaylistAxis,
  type CrawlAllDeps,
  type PlaylistAxisWiring,
} from "./run";

const KR: CountryEntry = {
  code: "kr",
  name: "South Korea",
  region: "Asia",
  lat: 37.5683,
  lon: 126.9978,
  isoNum: 410,
};
const NG: CountryEntry = {
  code: "ng",
  name: "Nigeria",
  region: "Africa",
  lat: 9.0853,
  lon: 7.5314,
  isoNum: 566,
};

function axisResult(
  overrides: Partial<CountryPlaylistsResult> = {},
): CountryPlaylistsResult {
  return {
    playlists: [],
    files: [],
    valid: false,
    pagesAttempted: 0,
    pageFailures: 0,
    lookups: { requested: 0, resolved: 0 },
    ...overrides,
  };
}

function playlistMeta(id: string): Playlist {
  return {
    id,
    name: `${id} name`,
    appleUrl: `https://music.apple.com/kr/playlist/${id}`,
    artworkUrl: `https://art/${id}/600x600bb.jpg`,
    genres: [],
    trackCount: 2,
  };
}

function priorCountry(overrides: Partial<Country> = {}): Country {
  return {
    name: "South Korea",
    valid: true,
    tracks: [],
    ...overrides,
  };
}

test("publishes this run's playlists when the axis succeeded", () => {
  const fresh = [playlistMeta("pl.a")];

  const outcome = resolvePlaylistAxis(
    "kr",
    axisResult({ valid: true, playlists: fresh }),
    priorCountry({ playlists: [playlistMeta("pl.old")] }),
  );

  expect(outcome).toEqual({
    playlists: fresh,
    playlistsValid: true,
    carried: false,
  });
});

test("carries the previous playlists when this run's axis failed", () => {
  const stale = [playlistMeta("pl.old")];

  const outcome = resolvePlaylistAxis(
    "kr",
    axisResult({ valid: false }),
    priorCountry({ playlists: stale, playlistsValid: true }),
  );

  expect(outcome).toEqual({
    playlists: stale,
    playlistsValid: true,
    carried: true,
  });
});

test("carries when the feed itself failed and nothing was attempted", () => {
  const stale = [playlistMeta("pl.old")];

  const outcome = resolvePlaylistAxis(
    "kr",
    null,
    priorCountry({ playlists: stale, playlistsValid: true }),
  );

  expect(outcome.carried).toBe(true);
  expect(outcome.playlists).toEqual(stale);
});

test("carries again after a run that was itself a carry", () => {
  const stale = [playlistMeta("pl.old")];

  // A carried entry keeps playlistsValid: true, mirroring the songs axis, so
  // repeated failures keep republishing rather than dropping the axis.
  const outcome = resolvePlaylistAxis(
    "kr",
    null,
    priorCountry({ playlists: stale, playlistsValid: true }),
  );

  expect(outcome.carried).toBe(true);
});

test("does not carry from an entry the previous run published as failed", () => {
  const outcome = resolvePlaylistAxis(
    "kr",
    null,
    priorCountry({
      playlists: [playlistMeta("pl.old")],
      playlistsValid: false,
    }),
  );

  expect(outcome).toEqual({ playlistsValid: false, carried: false });
});

test("publishes no playlists when the axis failed with nothing to carry", () => {
  const outcome = resolvePlaylistAxis("kr", null, priorCountry());

  expect(outcome).toEqual({ playlistsValid: false, carried: false });
});

test("treats an empty prior playlist set as nothing to carry", () => {
  const outcome = resolvePlaylistAxis(
    "kr",
    null,
    priorCountry({ playlists: [], playlistsValid: true }),
  );

  expect(outcome.carried).toBe(false);
});

function rssFor(cc: string): AppleRssTrack[] {
  return [
    {
      rank: 1,
      id: `${cc}-1`,
      name: `${cc} song`,
      artist: `${cc} artist`,
      appleUrl: `https://music.apple.com/${cc}/album/1`,
      artworkUrl: `https://art/${cc}/1/600x600bb.jpg`,
    },
  ];
}

function applePlaylist(id: string): ApplePlaylist {
  return {
    id,
    name: `${id} name`,
    appleUrl: `https://music.apple.com/x/playlist/${id}`,
    artworkUrl: `https://art/${id}/600x600bb.jpg`,
  };
}

function scrapedTrack(id: string, rank: number): PlaylistTrack {
  return {
    rank,
    id,
    name: `track ${id}`,
    artist: "artist",
    appleUrl: `https://music.apple.com/x/album/y?i=${id}`,
    artworkUrl: `https://art/${id}/600x600bb.jpg`,
  };
}

function scrapedTracks(): PlaylistTrack[] {
  return [scrapedTrack("t1", 1)];
}

interface AxisHarness {
  deps: CrawlAllDeps;
  uploaded: PlaylistFile[];
}

function makeDeps(input: {
  feedsByCc: Record<string, ApplePlaylist[]>;
  fetchPlaylistPage?: PlaylistAxisWiring["fetchPlaylistPage"];
  fetchPrevious?: () => Promise<ChartFile | null>;
  countries?: readonly CountryEntry[];
}): AxisHarness {
  const uploaded: PlaylistFile[] = [];
  const lookupTracks = vi.fn<BatchLookup>(async (ids) => {
    const resolved = new Map<string, LookupResult>();
    for (const id of ids) {
      resolved.set(id, {
        id,
        previewUrl: `https://preview/${id}.m4a`,
        genre: "K-Pop",
      });
    }
    return resolved;
  });

  return {
    uploaded,
    deps: {
      countries: input.countries ?? [KR, NG],
      fetchRss: vi.fn(async (cc: string) => rssFor(cc)),
      lookupTracks,
      uploadCharts: vi.fn(async () => "https://blob/charts.json"),
      triggerRevalidate: vi.fn(async () => {}),
      fetchPrevious: input.fetchPrevious,
      now: () => new Date("2026-07-20T00:00:00.000Z"),
      playlistAxis: {
        fetchPlaylists: vi.fn(async (cc: string) => input.feedsByCc[cc] ?? []),
        fetchPlaylistPage:
          input.fetchPlaylistPage ?? vi.fn(async () => scrapedTracks()),
        uploadPlaylistFile: vi.fn(async (file: PlaylistFile) => {
          uploaded.push(file);
        }),
      },
    },
  };
}

test("attaches playlist metadata to each country", async () => {
  const { deps } = makeDeps({
    feedsByCc: { kr: [applePlaylist("pl.kr")], ng: [applePlaylist("pl.ng")] },
  });

  const result = await crawlAll(deps);

  expect(result.chartFile.countries.kr.playlists?.map((p) => p.id)).toEqual([
    "pl.kr",
  ]);
  expect(result.chartFile.countries.kr.playlistsValid).toBe(true);
});

test("uploads one track file per surviving playlist", async () => {
  const { deps, uploaded } = makeDeps({
    feedsByCc: { kr: [applePlaylist("pl.kr")], ng: [applePlaylist("pl.ng")] },
  });

  await crawlAll(deps);

  expect(uploaded.map((f) => f.id).sort()).toEqual(["pl.kr", "pl.ng"]);
});

test("drops a playlist every storefront carries", async () => {
  const shared = applePlaylist("pl.global");
  const { deps } = makeDeps({
    feedsByCc: { kr: [shared, applePlaylist("pl.kr")], ng: [shared] },
  });

  const result = await crawlAll(deps);

  expect(result.chartFile.countries.kr.playlists?.map((p) => p.id)).toEqual([
    "pl.kr",
  ]);
});

test("bakes each published playlist's storefront count", async () => {
  const { deps } = makeDeps({
    feedsByCc: { kr: [applePlaylist("pl.kr")], ng: [applePlaylist("pl.ng")] },
  });

  const result = await crawlAll(deps);

  expect(result.chartFile.countries.kr.playlists?.[0].spread).toBe(1);
});

test("reports the countries whose playlist axis was carried", async () => {
  const stale = playlistMeta("pl.stale");
  const previous: ChartFile = {
    lastUpdated: "2026-07-19T00:00:00.000Z",
    countries: {
      kr: {
        name: KR.name,
        valid: true,
        tracks: [],
        playlists: [stale],
        playlistsValid: true,
      },
    },
  };
  const { deps } = makeDeps({
    feedsByCc: { ng: [applePlaylist("pl.ng")] },
    fetchPrevious: vi.fn(async () => previous),
  });

  const result = await crawlAll(deps);

  expect(result.carriedPlaylistCodes).toEqual(["kr"]);
  expect(result.chartFile.countries.kr.playlists).toEqual([stale]);
  expect(result.chartFile.countries.kr.playlistsValid).toBe(true);
});

test("leaves the songs axis untouched when the playlist axis fails", async () => {
  const { deps } = makeDeps({ feedsByCc: {} });

  const result = await crawlAll(deps);

  expect(result.chartFile.countries.kr.valid).toBe(true);
  expect(result.chartFile.countries.kr.tracks).toHaveLength(1);
  expect(result.carriedCodes).toEqual([]);
});

test("throws when playlist pages stop parsing across the run", async () => {
  const { deps } = makeDeps({
    feedsByCc: { kr: [applePlaylist("pl.kr")], ng: [applePlaylist("pl.ng")] },
    fetchPlaylistPage: vi.fn(async (playlistId: string) => {
      const { PlaylistPageError } = await import("./playlist-page");
      throw new PlaylistPageError(playlistId, "shape", "block gone");
    }),
  });

  await expect(crawlAll(deps)).rejects.toBeInstanceOf(PlaylistContractError);
});

test("publishes nothing on the playlist axis when it is not wired", async () => {
  const { deps } = makeDeps({ feedsByCc: {} });
  delete deps.playlistAxis;

  const result = await crawlAll(deps);

  expect(result.chartFile.countries.kr.playlists).toBeUndefined();
  expect(result.chartFile.countries.kr.playlistsValid).toBeUndefined();
  expect(result.carriedPlaylistCodes).toEqual([]);
});

test("publishes no charts when a playlist file fails to upload", async () => {
  const { deps } = makeDeps({
    feedsByCc: { kr: [applePlaylist("pl.kr")], ng: [applePlaylist("pl.ng")] },
  });
  deps.playlistAxis!.uploadPlaylistFile = vi.fn(async () => {
    throw new Error("blob write failed");
  });

  await expect(crawlAll(deps)).rejects.toThrow("blob write failed");
  expect(deps.uploadCharts).not.toHaveBeenCalled();
});

test("reports how many ids the run asked about against how many resolved", async () => {
  const { deps } = makeDeps({
    feedsByCc: { kr: [applePlaylist("pl.kr")], ng: [applePlaylist("pl.ng")] },
  });

  const result = await crawlAll(deps);

  // Two countries: one songs track and one playlist track each.
  expect(result.lookups).toEqual({ requested: 4, resolved: 4 });
});

test("counts an id the lookup omitted as requested but unresolved", async () => {
  const { deps } = makeDeps({ feedsByCc: {} });
  deps.lookupTracks = vi.fn<BatchLookup>(async () => new Map());

  const result = await crawlAll(deps);

  expect(result.lookups).toEqual({ requested: 2, resolved: 0 });
});

test("counts a silently truncated batch as a shortfall", async () => {
  const { deps } = makeDeps({
    feedsByCc: { kr: [applePlaylist("pl.kr")] },
    fetchPlaylistPage: vi.fn(async () => [
      scrapedTrack("t1", 1),
      scrapedTrack("t2", 2),
      scrapedTrack("t3", 3),
    ]),
  });
  // What an over-sized batch looks like from here: HTTP 200, a valid response,
  // and the tail of the requested ids simply absent.
  deps.lookupTracks = vi.fn<BatchLookup>(
    async (ids, cc) =>
      new Map(
        ids
          .slice(0, -1)
          .map((id) => [
            id,
            { id, previewUrl: `https://preview/${cc}/${id}.m4a`, genre: null },
          ]),
      ),
  );

  const result = await crawlAll(deps);

  expect(result.lookups.resolved).toBeLessThan(result.lookups.requested);
});
