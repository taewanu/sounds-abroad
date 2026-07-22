import { expect, test, vi } from "vitest";

import {
  ChartFileSchema,
  EAGER_TRACK_COUNT,
  type ChartFile,
  type Country,
  type SongsTailFile,
} from "../../src/lib/chart-schema";
import {
  commentaryKey,
  type CommentaryStore,
} from "../../src/lib/commentary-store";
import type { CountryEntry } from "../../src/lib/countries";

import { AppleRssError, type AppleRssTrack } from "./apple-rss";
import { ItunesLookupError, type LookupResult } from "./itunes-lookup";
import type { BatchLookup } from "./lookup-retry";
import {
  crawlAll,
  crawlCountry,
  summarizeValidity,
  type CrawlAllDeps,
  type CrawlCountryDeps,
} from "./run";
import { SpotifyResolveError } from "./spotify-resolve";

function sampleRssTracks(): AppleRssTrack[] {
  return [
    {
      rank: 1,
      id: "1",
      name: "REDRED",
      artist: "코르티스",
      appleUrl: "https://music.apple.com/kr/album/1",
      artworkUrl: "https://art/1/600x600bb.jpg",
    },
    {
      rank: 2,
      id: "2",
      name: "It's Me",
      artist: "아일릿",
      appleUrl: "https://music.apple.com/kr/album/2",
      artworkUrl: "https://art/2/600x600bb.jpg",
    },
    {
      rank: 3,
      id: "3",
      name: "TICK TOCK",
      artist: "BLOCKERS",
      appleUrl: "https://music.apple.com/kr/album/3",
      artworkUrl: "https://art/3/600x600bb.jpg",
    },
  ];
}

function previewUrlForId(id: string): string {
  return `https://preview/${id}.m4a`;
}

function resolvedPreviews(ids: readonly string[]): Map<string, LookupResult> {
  return new Map(
    ids.map((id) => [id, { id, previewUrl: previewUrlForId(id), genre: null }]),
  );
}

function makeCrawlCountryDeps(
  overrides: Partial<CrawlCountryDeps> = {},
): CrawlCountryDeps {
  const tracks = sampleRssTracks();
  return {
    cc: "kr",
    name: "South Korea",
    fetchRss: vi.fn(async () => tracks),
    lookupTracks: vi.fn<BatchLookup>(async (ids) => resolvedPreviews(ids)),
    ...overrides,
  };
}

test("crawlCountry returns valid=true with all tracks on full success", async () => {
  const deps = makeCrawlCountryDeps();

  const { cc, country } = await crawlCountry(deps);

  expect(cc).toBe(deps.cc);
  expect(country.name).toBe(deps.name);
  expect(country.valid).toBe(true);
  expect(country.tracks).toHaveLength(sampleRssTracks().length);
});

test("crawlCountry falls back to the search URL when Spotify resolution is unconfigured", async () => {
  const [firstRss] = sampleRssTracks();
  const deps = makeCrawlCountryDeps();

  const { country } = await crawlCountry(deps);

  expect(country.tracks[0]).toEqual({
    rank: firstRss.rank,
    name: firstRss.name,
    artist: firstRss.artist,
    appleUrl: firstRss.appleUrl,
    artworkUrl: firstRss.artworkUrl,
    previewUrl: previewUrlForId(firstRss.id),
    spotifyUrl: `https://open.spotify.com/search/${encodeURIComponent(
      `${firstRss.name} ${firstRss.artist}`,
    )}`,
  });
});

test("crawlCountry stores the resolved track URL when Spotify resolution succeeds", async () => {
  const resolved = "https://open.spotify.com/track/abc123";
  const deps = makeCrawlCountryDeps({
    spotify: {
      resolve: vi.fn(async () => resolved),
      throttle: async (fn) => fn(),
    },
  });

  const { country } = await crawlCountry(deps);

  expect(country.tracks[0].spotifyUrl).toBe(resolved);
});

test("crawlCountry passes each track's name and artist to the resolver", async () => {
  const [firstRss] = sampleRssTracks();
  const resolve = vi.fn(async () => "https://open.spotify.com/track/abc123");
  const deps = makeCrawlCountryDeps({
    spotify: { resolve, throttle: async (fn) => fn() },
  });

  await crawlCountry(deps);

  expect(resolve).toHaveBeenCalledWith(firstRss.name, firstRss.artist);
});

test("crawlCountry falls back to the search URL on SpotifyResolveError", async () => {
  const [firstRss] = sampleRssTracks();
  const deps = makeCrawlCountryDeps({
    spotify: {
      resolve: vi.fn(async () => {
        throw new SpotifyResolveError("miss", "no track");
      }),
      throttle: async (fn) => fn(),
    },
  });

  const { country } = await crawlCountry(deps);

  expect(country.tracks[0].spotifyUrl).toBe(
    `https://open.spotify.com/search/${encodeURIComponent(
      `${firstRss.name} ${firstRss.artist}`,
    )}`,
  );
});

test("crawlCountry rethrows a non-SpotifyResolveError from the resolver", async () => {
  const errorMessage = "unexpected resolve error";
  const deps = makeCrawlCountryDeps({
    spotify: {
      resolve: vi.fn(async () => {
        throw new TypeError(errorMessage);
      }),
      throttle: async (fn) => fn(),
    },
  });

  await expect(crawlCountry(deps)).rejects.toThrow(errorMessage);
});

test("crawlCountry routes resolution through the Spotify throttle", async () => {
  let spotifyCount = 0;
  const deps = makeCrawlCountryDeps({
    spotify: {
      resolve: vi.fn(async () => "https://open.spotify.com/track/abc123"),
      throttle: async (fn) => {
        spotifyCount += 1;
        return fn();
      },
    },
  });

  await crawlCountry(deps);

  expect(spotifyCount).toBe(sampleRssTracks().length);
});

test("crawlCountry inserts a placeholder with previewUrl=null for an id the lookup omits", async () => {
  const failingId = "2";
  const lookupTracks = vi.fn<BatchLookup>(async (ids) =>
    resolvedPreviews(ids.filter((id) => id !== failingId)),
  );
  const deps = makeCrawlCountryDeps({ lookupTracks });
  const allRss = sampleRssTracks();
  const failingRss = allRss.find((t) => t.id === failingId)!;

  const { country } = await crawlCountry(deps);

  expect(country.valid).toBe(true);
  expect(country.tracks).toHaveLength(allRss.length);
  const failingTrack = country.tracks.find((t) => t.rank === failingRss.rank);
  expect(failingTrack?.previewUrl).toBeNull();
  expect(failingTrack?.name).toBe(failingRss.name);
  expect(failingTrack?.artist).toBe(failingRss.artist);
  expect(failingTrack?.appleUrl).toBe(failingRss.appleUrl);
  expect(failingTrack?.artworkUrl).toBe(failingRss.artworkUrl);
});

test("crawlCountry returns valid=false when every lookup fails, keeping the placeholders", async () => {
  // Zero playable previews means a lookup-host outage, not a real chart:
  // the entry must read as failed so carry-forward can prefer prior data.
  const lookupTracks = vi.fn<BatchLookup>(async (ids, cc) => {
    throw new ItunesLookupError(ids, cc, "http", "503 Service Unavailable");
  });
  const deps = makeCrawlCountryDeps({ lookupTracks });

  const { country } = await crawlCountry(deps);

  expect(country.valid).toBe(false);
  expect(country.tracks).toHaveLength(sampleRssTracks().length);
  expect(country.tracks.every((t) => t.previewUrl === null)).toBe(true);
});

test("crawlCountry returns valid=false with empty tracks when RSS throws AppleRssError", async () => {
  const fetchRss = vi.fn(async () => {
    throw new AppleRssError("kr", "503 Service Unavailable");
  });
  const deps = makeCrawlCountryDeps({ fetchRss });

  const { country } = await crawlCountry(deps);

  expect(country.valid).toBe(false);
  expect(country.tracks).toEqual([]);
  expect(country.name).toBe(deps.name);
});

test("crawlCountry rethrows non-AppleRssError from fetchRss", async () => {
  const errorMessage = "unexpected rss error";
  const deps = makeCrawlCountryDeps({
    fetchRss: vi.fn(async () => {
      throw new TypeError(errorMessage);
    }),
  });

  const promise = crawlCountry(deps);

  await expect(promise).rejects.toThrow(errorMessage);
});

test("crawlCountry rethrows non-ItunesLookupError from lookupTracks", async () => {
  const errorMessage = "unexpected lookup error";
  const deps = makeCrawlCountryDeps({
    lookupTracks: vi.fn(async () => {
      throw new TypeError(errorMessage);
    }),
  });

  const promise = crawlCountry(deps);

  await expect(promise).rejects.toThrow(errorMessage);
});

const FROZEN_NOW = new Date("2026-05-15T12:00:00.000Z");
const BLOB_URL = "https://blob/charts/v1/charts.json";

/** A storefront ranking `count` songs, for splitting the eager rows from the tail. */
function deepRssFor(cc: string, count: number): AppleRssTrack[] {
  return Array.from({ length: count }, (_, i) => ({
    rank: i + 1,
    id: `${cc}-${i + 1}`,
    name: `${cc} song ${i + 1}`,
    artist: `${cc} artist`,
    appleUrl: `https://music.apple.com/${cc}/album/${i + 1}`,
    artworkUrl: `https://art/${cc}/${i + 1}/600x600bb.jpg`,
  }));
}

function fakeRssFor(cc: string): AppleRssTrack[] {
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

function countryPreviews(
  ids: readonly string[],
  cc: string,
): Map<string, LookupResult> {
  return new Map(
    ids.map((id) => [
      id,
      { id, previewUrl: `https://preview/${cc}/${id}.m4a`, genre: null },
    ]),
  );
}

function makeCrawlAllDeps(input: {
  countries: readonly CountryEntry[];
  fetchRss?: (cc: string) => Promise<AppleRssTrack[]>;
  lookupTracks?: BatchLookup;
  fetchPrevious?: () => Promise<ChartFile | null>;
  uploadPrevious?: (chartFile: ChartFile) => Promise<unknown>;
  fetchCommentary?: () => Promise<CommentaryStore | null>;
  uploadCharts?: (chartFile: ChartFile) => Promise<string>;
  uploadSongsTail?: (file: SongsTailFile) => Promise<unknown>;
}): CrawlAllDeps {
  return {
    countries: input.countries,
    fetchRss: input.fetchRss ?? vi.fn(async (cc) => fakeRssFor(cc)),
    lookupTracks:
      input.lookupTracks ??
      vi.fn<BatchLookup>(
        async (ids, cc) =>
          new Map(
            ids.map((id) => [
              id,
              {
                id,
                previewUrl: `https://preview/${cc}/${id}.m4a`,
                genre: null,
              },
            ]),
          ),
      ),
    uploadCharts: input.uploadCharts ?? vi.fn(async () => BLOB_URL),
    uploadSongsTail: input.uploadSongsTail ?? vi.fn(async () => {}),
    triggerRevalidate: vi.fn(async () => {}),
    fetchPrevious: input.fetchPrevious,
    uploadPrevious: input.uploadPrevious,
    fetchCommentary: input.fetchCommentary,
    now: () => FROZEN_NOW,
  };
}

function commentaryEntry(lead: string) {
  return {
    lead,
    tag: "new entry",
    claim: "why-charting" as const,
    sources: ["https://example.com/a"],
    generatedAt: "2026-05-15T00:00:00.000Z",
  };
}

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

function priorCountry(name: string, trackCount: number): Country {
  return {
    name,
    valid: true,
    tracks: Array.from({ length: trackCount }, (_, i) => ({
      rank: i + 1,
      name: `prior song ${i + 1}`,
      artist: `prior artist ${i + 1}`,
      previewUrl: `https://prior/preview/${i + 1}.m4a`,
      artworkUrl: `https://prior/art/${i + 1}/600x600bb.jpg`,
      appleUrl: `https://music.apple.com/prior/${i + 1}`,
      spotifyUrl: `https://open.spotify.com/search/prior${i + 1}`,
    })),
  };
}

function previousChartFile(countries: ChartFile["countries"]): ChartFile {
  return { lastUpdated: "2026-05-14T12:00:00.000Z", countries };
}

function failRssFor(
  failingCode: string,
): (cc: string) => Promise<AppleRssTrack[]> {
  return vi.fn(async (cc: string) => {
    if (cc === failingCode)
      throw new AppleRssError(cc, "500 Internal Server Error");
    return fakeRssFor(cc);
  });
}

test("crawlAll assembles a valid ChartFile, uploads once, and revalidates once", async () => {
  const countries: CountryEntry[] = [
    {
      code: "kr",
      name: "South Korea",
      region: "Asia",
      lat: 37.5683,
      lon: 126.9978,
      isoNum: 410,
    },
    {
      code: "us",
      name: "United States",
      region: "Americas",
      lat: 38.9015,
      lon: -77.0114,
      isoNum: 840,
    },
  ];
  const deps = makeCrawlAllDeps({ countries });
  const expectedCodes = countries.map((c) => c.code);

  const result = await crawlAll(deps);
  const parsed = ChartFileSchema.parse(result.chartFile);

  expect(parsed.lastUpdated).toBe(FROZEN_NOW.toISOString());
  expect(Object.keys(parsed.countries)).toEqual(expectedCodes);
  for (const code of expectedCodes) {
    expect(parsed.countries[code].valid).toBe(true);
    expect(parsed.countries[code].tracks).toHaveLength(fakeRssFor(code).length);
  }
  expect(deps.uploadCharts).toHaveBeenCalledTimes(1);
  expect(deps.uploadCharts).toHaveBeenCalledWith(result.chartFile);
  expect(deps.triggerRevalidate).toHaveBeenCalledTimes(1);
  expect(result.carriedCodes).toEqual([]);
});

test("crawlAll publishes whatever succeeded when one country's RSS fails", async () => {
  const failingCode = "ng";
  const successCode = "kr";
  const countries: CountryEntry[] = [
    {
      code: successCode,
      name: "South Korea",
      region: "Asia",
      lat: 37.5683,
      lon: 126.9978,
      isoNum: 410,
    },
    {
      code: failingCode,
      name: "Nigeria",
      region: "Africa",
      lat: 9.0853,
      lon: 7.5314,
      isoNum: 566,
    },
  ];
  const fetchRss = vi.fn(async (cc: string) => {
    if (cc === failingCode) {
      throw new AppleRssError(cc, "503 Service Unavailable");
    }
    return fakeRssFor(cc);
  });
  const deps = makeCrawlAllDeps({ countries, fetchRss });

  const result = await crawlAll(deps);

  expect(result.chartFile.countries[successCode].valid).toBe(true);
  expect(result.chartFile.countries[successCode].tracks).toHaveLength(
    fakeRssFor(successCode).length,
  );
  expect(result.chartFile.countries[failingCode].valid).toBe(false);
  expect(result.chartFile.countries[failingCode].tracks).toEqual([]);
  expect(deps.uploadCharts).toHaveBeenCalledTimes(1);
  expect(deps.triggerRevalidate).toHaveBeenCalledTimes(1);
});

test("crawlAll carries forward the previous entry when a country fails but prior data exists", async () => {
  const priorNg = priorCountry(NG.name, 3);
  const fetchPrevious = vi.fn(async () => previousChartFile({ ng: priorNg }));
  const deps = makeCrawlAllDeps({
    countries: [KR, NG],
    fetchRss: failRssFor(NG.code),
    fetchPrevious,
  });

  const result = await crawlAll(deps);

  expect(result.chartFile.countries.ng).toEqual(priorNg);
  expect(result.chartFile.countries.kr.valid).toBe(true);
  expect(result.carriedCodes).toEqual([NG.code]);
});

test("crawlAll carries forward the previous entry when a country's lookups all fail", async () => {
  const priorNg = priorCountry(NG.name, 3);
  const failNgLookups = vi.fn<BatchLookup>(async (ids, cc) => {
    if (cc === NG.code)
      throw new ItunesLookupError(ids, cc, "http", "503 Service Unavailable");
    return countryPreviews(ids, cc);
  });
  const deps = makeCrawlAllDeps({
    countries: [KR, NG],
    lookupTracks: failNgLookups,
    fetchPrevious: vi.fn(async () => previousChartFile({ ng: priorNg })),
  });

  const result = await crawlAll(deps);

  expect(result.chartFile.countries.ng).toEqual(priorNg);
  expect(result.chartFile.countries.kr.valid).toBe(true);
  expect(result.carriedCodes).toEqual([NG.code]);
});

test("crawlAll publishes a zero-playable country as invalid when no prior data exists", async () => {
  const failNgLookups = vi.fn<BatchLookup>(async (ids, cc) => {
    if (cc === NG.code)
      throw new ItunesLookupError(ids, cc, "http", "503 Service Unavailable");
    return countryPreviews(ids, cc);
  });
  const deps = makeCrawlAllDeps({
    countries: [KR, NG],
    lookupTracks: failNgLookups,
  });

  const result = await crawlAll(deps);

  expect(result.chartFile.countries.ng.valid).toBe(false);
  expect(result.chartFile.countries.ng.tracks).toHaveLength(
    fakeRssFor(NG.code).length,
  );
  expect(result.carriedCodes).toEqual([]);
});

test("crawlAll snapshots the outgoing charts before overwriting them", async () => {
  // Order is the invariant: once the in-place overwrite runs, the outgoing
  // payload is unrecoverable and the movement diff loses a generation.
  const events: string[] = [];
  const previous = previousChartFile({ kr: priorCountry(KR.name, 2) });
  const uploadPrevious = vi.fn(async () => {
    events.push("snapshot");
  });
  const uploadCharts = vi.fn(async () => {
    events.push("publish");
    return BLOB_URL;
  });
  const deps = makeCrawlAllDeps({
    countries: [KR],
    fetchPrevious: vi.fn(async () => previous),
    uploadPrevious,
    uploadCharts,
  });

  await crawlAll(deps);

  expect(uploadPrevious).toHaveBeenCalledWith(previous);
  expect(events).toEqual(["snapshot", "publish"]);
});

test("crawlAll skips the snapshot when no previous payload exists", async () => {
  const uploadPrevious = vi.fn(async () => {});
  const deps = makeCrawlAllDeps({
    countries: [KR],
    fetchPrevious: vi.fn(async () => null),
    uploadPrevious,
  });

  await crawlAll(deps);

  expect(uploadPrevious).not.toHaveBeenCalled();
  expect(deps.uploadCharts).toHaveBeenCalledTimes(1);
});

test("crawlAll keeps a failed country invalid when fetchPrevious returns null", async () => {
  const deps = makeCrawlAllDeps({
    countries: [KR, NG],
    fetchRss: failRssFor(NG.code),
    fetchPrevious: vi.fn(async () => null),
  });

  const result = await crawlAll(deps);

  expect(result.chartFile.countries.ng.valid).toBe(false);
  expect(result.chartFile.countries.ng.tracks).toEqual([]);
});

test("crawlAll keeps a failed country invalid when the previous payload lacks it", async () => {
  const fetchPrevious = vi.fn(async () =>
    previousChartFile({ kr: priorCountry(KR.name, 2) }),
  );
  const deps = makeCrawlAllDeps({
    countries: [KR, NG],
    fetchRss: failRssFor(NG.code),
    fetchPrevious,
  });

  const result = await crawlAll(deps);

  expect(result.chartFile.countries.ng.valid).toBe(false);
  expect(result.chartFile.countries.ng.tracks).toEqual([]);
});

test("crawlAll does not carry forward a previous entry that was itself empty", async () => {
  const emptyPriorNg: Country = { name: NG.name, valid: false, tracks: [] };
  const fetchPrevious = vi.fn(async () =>
    previousChartFile({ ng: emptyPriorNg }),
  );
  const deps = makeCrawlAllDeps({
    countries: [KR, NG],
    fetchRss: failRssFor(NG.code),
    fetchPrevious,
  });

  const result = await crawlAll(deps);

  expect(result.chartFile.countries.ng.valid).toBe(false);
  expect(result.chartFile.countries.ng.tracks).toEqual([]);
});

test("summarizeValidity reports total, valid count, and the invalid codes", async () => {
  const chartFile = previousChartFile({
    kr: priorCountry("South Korea", 2),
    ng: { name: "Nigeria", valid: false, tracks: [] },
    us: priorCountry("United States", 1),
  });

  const summary = summarizeValidity(chartFile);

  expect(summary).toEqual({ total: 3, validCount: 2, invalidCodes: ["ng"] });
});

test("crawlAll bakes spread as the count of countries whose chart contains a matching track", async () => {
  const US: CountryEntry = {
    code: "us",
    name: "United States",
    region: "Americas",
    lat: 38.9015,
    lon: -77.0114,
    isoNum: 840,
  };
  const sharedTrack = (cc: string): AppleRssTrack => ({
    rank: 1,
    id: `${cc}-shared`,
    name: "Shared Song",
    artist: "Shared Artist",
    appleUrl: `https://music.apple.com/${cc}/album/1?i=999999`,
    artworkUrl: `https://art/${cc}/1/600x600bb.jpg`,
  });
  const onlyKrTrack: AppleRssTrack = {
    rank: 2,
    id: "kr-only",
    name: "KR Only Song",
    artist: "KR Only Artist",
    appleUrl: "https://music.apple.com/kr/album/2?i=111111",
    artworkUrl: "https://art/kr/2/600x600bb.jpg",
  };
  const fetchRss = vi.fn(async (cc: string) =>
    cc === "kr" ? [sharedTrack(cc), onlyKrTrack] : [sharedTrack(cc)],
  );
  const deps = makeCrawlAllDeps({ countries: [KR, NG, US], fetchRss });

  const result = await crawlAll(deps);

  expect(result.chartFile.countries.kr.tracks[0].spread).toBe(3);
  expect(result.chartFile.countries.ng.tracks[0].spread).toBe(3);
  expect(result.chartFile.countries.us.tracks[0].spread).toBe(3);
  expect(result.chartFile.countries.kr.tracks[1].spread).toBe(1);
});

test("crawlAll bakes a matching blurb and sets null on tracks without one", async () => {
  const krEntry = commentaryEntry("KR blurb.");
  const store: CommentaryStore = {
    [commentaryKey("en", "kr artist", "kr song")]: krEntry,
  };
  const deps = makeCrawlAllDeps({
    countries: [KR, NG],
    fetchCommentary: vi.fn(async () => store),
  });

  const result = await crawlAll(deps);

  expect(result.chartFile.countries.kr.tracks[0].commentary).toEqual(krEntry);
  expect(result.chartFile.countries.ng.tracks[0].commentary).toBeNull();
});

test("crawlAll leaves commentary unset when no commentary source is wired", async () => {
  const deps = makeCrawlAllDeps({ countries: [KR] });

  const result = await crawlAll(deps);

  expect(result.chartFile.countries.kr.tracks[0].commentary).toBeUndefined();
});

test("crawlAll skips the bake and still publishes when commentary yields null", async () => {
  const deps = makeCrawlAllDeps({
    countries: [KR],
    fetchCommentary: vi.fn(async () => null),
  });

  const result = await crawlAll(deps);

  expect(result.chartFile.countries.kr.tracks[0].commentary).toBeUndefined();
  expect(deps.uploadCharts).toHaveBeenCalledTimes(1);
});

test("crawlAll clears a stale blurb carried forward from a failed country", async () => {
  const stalePriorNg: Country = {
    name: NG.name,
    valid: true,
    tracks: [
      {
        rank: 1,
        name: "ng song",
        artist: "ng artist",
        previewUrl: null,
        artworkUrl: "https://prior/art/1/600x600bb.jpg",
        appleUrl: "https://music.apple.com/prior/1",
        spotifyUrl: "https://open.spotify.com/search/prior1",
        commentary: commentaryEntry("stale blurb."),
      },
    ],
  };
  const deps = makeCrawlAllDeps({
    countries: [KR, NG],
    fetchRss: failRssFor(NG.code),
    fetchPrevious: vi.fn(async () => previousChartFile({ ng: stalePriorNg })),
    fetchCommentary: vi.fn(async () => ({})),
  });

  const result = await crawlAll(deps);

  expect(result.chartFile.countries.ng.tracks[0].commentary).toBeNull();
});

test("crawlCountry reports how many ids it asked about against how many resolved", async () => {
  const deps = makeCrawlCountryDeps();

  const { lookups } = await crawlCountry(deps);

  expect(lookups).toEqual({
    requested: sampleRssTracks().length,
    resolved: sampleRssTracks().length,
  });
});

test("crawlCountry counts an id the lookup omitted as requested but unresolved", async () => {
  const missing = "2";
  const deps = makeCrawlCountryDeps({
    lookupTracks: vi.fn<BatchLookup>(async (ids) =>
      resolvedPreviews(ids.filter((id) => id !== missing)),
    ),
  });

  const { lookups } = await crawlCountry(deps);

  expect(lookups.resolved).toBe(lookups.requested - 1);
});

test("crawlCountry reports no lookups when the RSS fetch failed", async () => {
  const deps = makeCrawlCountryDeps({
    fetchRss: vi.fn(async (cc: string) => {
      throw new AppleRssError(cc, "503 Service Unavailable");
    }),
  });

  const { lookups } = await crawlCountry(deps);

  expect(lookups).toEqual({ requested: 0, resolved: 0 });
});

test("crawlAll sums the lookup tally across countries", async () => {
  const deps = makeCrawlAllDeps({ countries: [KR, NG] });

  const result = await crawlAll(deps);

  // fakeRssFor gives each country a single track.
  expect(result.lookups).toEqual({ requested: 2, resolved: 2 });
});

test("keeps the eager rows in the payload and publishes the rest separately", async () => {
  const uploadSongsTail = vi.fn(async (_file: SongsTailFile) => {});
  const deps = makeCrawlAllDeps({
    countries: [KR],
    fetchRss: vi.fn(async (cc) => deepRssFor(cc, 40)),
    uploadSongsTail,
  });

  const result = await crawlAll(deps);

  const payload = result.chartFile.countries[KR.code].tracks;
  expect(payload).toHaveLength(EAGER_TRACK_COUNT);
  expect(payload.at(-1)?.rank).toBe(EAGER_TRACK_COUNT);

  expect(uploadSongsTail).toHaveBeenCalledTimes(1);
  const tail = uploadSongsTail.mock.calls[0][0];
  expect(tail.code).toBe(KR.code);
  expect(tail.tracks).toHaveLength(15);
  expect(tail.tracks[0].rank).toBe(EAGER_TRACK_COUNT + 1);
  expect(tail.tracks.at(-1)?.rank).toBe(40);
});

test("publishes no tail for a country that ranks no deeper than the payload", async () => {
  const uploadSongsTail = vi.fn(async (_file: SongsTailFile) => {});
  const deps = makeCrawlAllDeps({
    countries: [KR],
    fetchRss: vi.fn(async (cc) => deepRssFor(cc, EAGER_TRACK_COUNT)),
    uploadSongsTail,
  });

  const result = await crawlAll(deps);

  expect(result.chartFile.countries[KR.code].tracks).toHaveLength(
    EAGER_TRACK_COUNT,
  );
  expect(uploadSongsTail).not.toHaveBeenCalled();
});

test("counts spread across the whole chart, not only the eager rows", async () => {
  const shared = "shared song";
  const rssWithSharedDeepTrack = (cc: string): AppleRssTrack[] => {
    const tracks = deepRssFor(cc, 30);
    // The same song sits deep in one country and deep in the other, so it is
    // only visible to spread if the counting reaches past the eager rows.
    tracks[29] = {
      ...tracks[29],
      id: "shared-id",
      name: shared,
      artist: "shared artist",
      appleUrl: "https://music.apple.com/xx/album/shared?i=999",
    };
    return tracks;
  };
  const deps = makeCrawlAllDeps({
    countries: [KR, NG],
    fetchRss: vi.fn(async (cc) => rssWithSharedDeepTrack(cc)),
    uploadSongsTail: vi.fn(async (_file: SongsTailFile) => {}),
  });

  await crawlAll(deps);
  const tail = vi.mocked(deps.uploadSongsTail).mock.calls[0][0].tracks;

  expect(tail.at(-1)?.name).toBe(shared);
  expect(tail.at(-1)?.spread).toBe(2);
});

test("publishes no charts when a songs tail fails to upload", async () => {
  const deps = makeCrawlAllDeps({
    countries: [KR],
    fetchRss: vi.fn(async (cc) => deepRssFor(cc, 40)),
    uploadSongsTail: vi.fn(async () => {
      throw new Error("tail write failed");
    }),
  });

  await expect(crawlAll(deps)).rejects.toThrow("tail write failed");
  expect(deps.uploadCharts).not.toHaveBeenCalled();
});
