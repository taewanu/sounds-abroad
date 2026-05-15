import { expect, test, vi } from "vitest";

import { AppleRssError, type AppleRssTrack } from "./apple-rss";
import { ItunesLookupError, type LookupResult } from "./itunes-lookup";
import { crawlCountry, type CrawlCountryDeps } from "./run";

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

test("crawlCountry drops a missed track but keeps the country valid=true", async () => {
  const failingId = "2";
  const lookupTrack = vi.fn<(id: string, cc: string) => Promise<LookupResult>>(
    async (id, cc) => {
      if (id === failingId)
        throw new ItunesLookupError(id, cc, "miss", "no track");
      return { id, previewUrl: previewUrlForId(id) };
    },
  );
  const deps = makeCrawlCountryDeps({ lookupTrack });
  const expectedSurvivingRanks = sampleRssTracks()
    .filter((t) => t.id !== failingId)
    .map((t) => t.rank);

  const { country } = await crawlCountry(deps);

  expect(country.valid).toBe(true);
  expect(country.tracks).toHaveLength(expectedSurvivingRanks.length);
  expect(country.tracks.map((t) => t.rank)).toEqual(expectedSurvivingRanks);
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
