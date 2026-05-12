import { describe, expect, it, vi } from "vitest";
import { ChartFileSchema } from "../../src/lib/chart-schema";
import type { AppleRssTrack } from "./apple-rss.mjs";
import { ItunesLookupError, type LookupResult } from "./itunes-lookup.mjs";
import { crawlCountry, type CrawlCountryDeps } from "./run.mjs";

const FROZEN_NOW = new Date("2026-05-12T12:00:00.000Z");

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

function makeDeps(overrides: Partial<CrawlCountryDeps> = {}): CrawlCountryDeps {
  const tracks = sampleRssTracks();
  return {
    cc: "kr",
    name: "South Korea",
    fetchRss: vi.fn(async () => tracks),
    lookupTrack: vi.fn<(id: string, cc: string) => Promise<LookupResult>>(
      async (id) => ({
        id,
        previewUrl: `https://preview/${id}.m4a`,
      }),
    ),
    throttle: async (fn) => fn(),
    uploadCharts: vi.fn(async () => "https://blob/charts/v1/charts.json"),
    triggerRevalidate: vi.fn(async () => {}),
    now: () => FROZEN_NOW,
    ...overrides,
  };
}

describe("crawlCountry", () => {
  it("returns a chart file that satisfies ChartFileSchema on full success", async () => {
    const deps = makeDeps();

    const result = await crawlCountry(deps);

    const parsed = ChartFileSchema.parse(result.chartFile);
    expect(parsed.lastUpdated).toBe(FROZEN_NOW.toISOString());
    expect(parsed.countries.kr.name).toBe("South Korea");
    expect(parsed.countries.kr.valid).toBe(true);
    expect(parsed.countries.kr.tracks).toHaveLength(3);
  });

  it("composes RSS + Lookup into typed tracks with synthesized spotifySearchUrl", async () => {
    const deps = makeDeps();

    const { chartFile } = await crawlCountry(deps);

    expect(chartFile.countries.kr.tracks[0]).toEqual({
      rank: 1,
      name: "REDRED",
      artist: "코르티스",
      previewUrl: "https://preview/1.m4a",
      artworkUrl: "https://art/1/600x600bb.jpg",
      appleUrl: "https://music.apple.com/kr/album/1",
      spotifySearchUrl:
        "https://open.spotify.com/search/REDRED%20%EC%BD%94%EB%A5%B4%ED%8B%B0%EC%8A%A4",
    });
  });

  it("marks country valid=false and drops failing tracks when a lookup misses", async () => {
    const lookupTrack = vi.fn<
      (id: string, cc: string) => Promise<LookupResult>
    >(async (id, cc) => {
      if (id === "2") throw new ItunesLookupError(id, cc, "miss", "no track");
      return { id, previewUrl: `https://preview/${id}.m4a` };
    });
    const deps = makeDeps({ lookupTrack });

    const { chartFile } = await crawlCountry(deps);

    expect(chartFile.countries.kr.valid).toBe(false);
    expect(chartFile.countries.kr.tracks).toHaveLength(2);
    expect(chartFile.countries.kr.tracks.map((t) => t.rank)).toEqual([1, 3]);
  });

  it("rethrows when RSS fetch fails (no upload attempted)", async () => {
    const uploadCharts = vi.fn(async () => "unused");
    const deps = makeDeps({
      fetchRss: vi.fn(async () => {
        throw new Error("rss boom");
      }),
      uploadCharts,
    });

    await expect(crawlCountry(deps)).rejects.toThrow("rss boom");
    expect(uploadCharts).not.toHaveBeenCalled();
  });

  it("uploads the chart file and triggers revalidate exactly once", async () => {
    const deps = makeDeps();

    const result = await crawlCountry(deps);

    expect(deps.uploadCharts).toHaveBeenCalledTimes(1);
    expect(deps.uploadCharts).toHaveBeenCalledWith(result.chartFile);
    expect(deps.triggerRevalidate).toHaveBeenCalledTimes(1);
    expect(result.url).toBe("https://blob/charts/v1/charts.json");
  });

  it("routes every external call through the injected throttle", async () => {
    let count = 0;
    const throttle = async <T>(fn: () => Promise<T>): Promise<T> => {
      count += 1;
      return fn();
    };
    const deps = makeDeps({ throttle });

    await crawlCountry(deps);

    // 1 RSS + 3 Lookups
    expect(count).toBe(4);
  });
});
