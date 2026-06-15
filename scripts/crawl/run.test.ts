import { expect, test, vi } from "vitest";

import {
  ChartFileSchema,
  type ChartFile,
  type Country,
} from "../../src/lib/chart-schema";
import {
  commentaryKey,
  type CommentaryStore,
} from "../../src/lib/commentary-store";
import type { CountryEntry } from "../../src/lib/countries";

import { AppleRssError, type AppleRssTrack } from "./apple-rss";
import { ItunesLookupError, type LookupResult } from "./itunes-lookup";
import {
  crawlAll,
  crawlCountry,
  summarizeValidity,
  type CrawlAllDeps,
  type CrawlCountryDeps,
} from "./run";

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

function makeCrawlCountryDeps(
  overrides: Partial<CrawlCountryDeps> = {},
): CrawlCountryDeps {
  const tracks = sampleRssTracks();
  return {
    cc: "kr",
    name: "South Korea",
    fetchRss: vi.fn(async () => tracks),
    lookupTrack: vi.fn<(id: string, cc: string) => Promise<LookupResult>>(
      async (id) => ({ id, previewUrl: previewUrlForId(id) }),
    ),
    throttle: async (fn) => fn(),
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

test("crawlCountry composes RSS + Lookup into typed tracks with synthesized spotifySearchUrl", async () => {
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
    spotifySearchUrl: `https://open.spotify.com/search/${encodeURIComponent(
      `${firstRss.name} ${firstRss.artist}`,
    )}`,
  });
});

test("crawlCountry inserts a placeholder with previewUrl=null on lookup failure", async () => {
  const failingId = "2";
  const lookupTrack = vi.fn<(id: string, cc: string) => Promise<LookupResult>>(
    async (id, cc) => {
      if (id === failingId)
        throw new ItunesLookupError(id, cc, "http", "503 Service Unavailable");
      return { id, previewUrl: previewUrlForId(id) };
    },
  );
  const deps = makeCrawlCountryDeps({ lookupTrack });
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

test("crawlCountry rethrows non-ItunesLookupError from lookupTrack", async () => {
  const errorMessage = "unexpected lookup error";
  const deps = makeCrawlCountryDeps({
    lookupTrack: vi.fn(async () => {
      throw new TypeError(errorMessage);
    }),
  });

  const promise = crawlCountry(deps);

  await expect(promise).rejects.toThrow(errorMessage);
});

test("crawlCountry routes every external call through the injected throttle", async () => {
  let count = 0;
  const throttle = async <T>(fn: () => Promise<T>): Promise<T> => {
    count += 1;
    return fn();
  };
  const deps = makeCrawlCountryDeps({ throttle });
  const expectedCount = 1 + sampleRssTracks().length; // 1 RSS + N Lookups

  await crawlCountry(deps);

  expect(count).toBe(expectedCount);
});

const FROZEN_NOW = new Date("2026-05-15T12:00:00.000Z");
const BLOB_URL = "https://blob/charts/v1/charts.json";

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

function makeCrawlAllDeps(input: {
  countries: readonly CountryEntry[];
  fetchRss?: (cc: string) => Promise<AppleRssTrack[]>;
  fetchPrevious?: () => Promise<ChartFile | null>;
  fetchCommentary?: () => Promise<CommentaryStore | null>;
}): CrawlAllDeps {
  return {
    countries: input.countries,
    fetchRss: input.fetchRss ?? vi.fn(async (cc) => fakeRssFor(cc)),
    lookupTrack: vi.fn<(id: string, cc: string) => Promise<LookupResult>>(
      async (id, cc) => ({ id, previewUrl: `https://preview/${cc}/${id}.m4a` }),
    ),
    throttle: async (fn) => fn(),
    uploadCharts: vi.fn(async () => BLOB_URL),
    triggerRevalidate: vi.fn(async () => {}),
    fetchPrevious: input.fetchPrevious,
    fetchCommentary: input.fetchCommentary,
    now: () => FROZEN_NOW,
  };
}

function commentaryEntry(lead: string) {
  return {
    lead,
    tag: "new entry",
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
      spotifySearchUrl: `https://open.spotify.com/search/prior${i + 1}`,
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
        spotifySearchUrl: "https://open.spotify.com/search/prior1",
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
