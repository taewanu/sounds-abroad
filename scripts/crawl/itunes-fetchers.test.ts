import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { ApplePlaylistsError } from "./apple-playlists";
import { AppleRssError } from "./apple-rss";
import { createItunesFetchers } from "./itunes-fetchers";
import { ItunesLookupError } from "./itunes-lookup";
import { createThrottle } from "./throttle";

const GAP_MS = 3000;

function previewMap(
  ids: readonly string[],
  previewUrl: string,
): Map<string, { id: string; previewUrl: string; genre: string | null }> {
  return new Map(ids.map((id) => [id, { id, previewUrl, genre: null }]));
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

test("a failing lookup's retry attempts each take their own throttle slot", async () => {
  // The gap encodes a per-IP request budget, so it must bound REQUESTS, not
  // logical fetches: attempts packed into one slot amplify the very
  // rate-limiting being retried.
  const attemptTimes: number[] = [];
  const lookupTracks = vi.fn(async (ids: readonly string[], cc: string) => {
    attemptTimes.push(Date.now());
    throw new ItunesLookupError(ids, cc, "http", "429 Too Many Requests");
  });
  const itunes = createItunesFetchers({
    fetchRss: vi.fn(async () => []),
    fetchPlaylists: vi.fn(async () => []),
    lookupTracks,
    throttle: createThrottle(GAP_MS),
  });

  const promise = itunes.lookupTracks(["1"], "kr").catch((err: unknown) => err);
  await vi.runAllTimersAsync();
  const err = await promise;

  expect(err).toBeInstanceOf(ItunesLookupError);
  expect(attemptTimes.length).toBeGreaterThan(1);
  for (let i = 1; i < attemptTimes.length; i++) {
    expect(attemptTimes[i] - attemptTimes[i - 1]).toBeGreaterThanOrEqual(
      GAP_MS,
    );
  }
});

test("a failing RSS fetch's retry attempts each take their own throttle slot", async () => {
  const attemptTimes: number[] = [];
  const fetchRss = vi.fn(async (cc: string) => {
    attemptTimes.push(Date.now());
    throw new AppleRssError(cc, "429 Too Many Requests");
  });
  const itunes = createItunesFetchers({
    fetchRss,
    fetchPlaylists: vi.fn(async () => []),
    lookupTracks: vi.fn(async (ids: readonly string[]) =>
      previewMap(ids, "https://p/1.m4a"),
    ),
    throttle: createThrottle(GAP_MS),
  });

  const promise = itunes.fetchRss("kr").catch((err: unknown) => err);
  await vi.runAllTimersAsync();
  const err = await promise;

  expect(err).toBeInstanceOf(AppleRssError);
  expect(attemptTimes.length).toBeGreaterThan(1);
  for (let i = 1; i < attemptTimes.length; i++) {
    expect(attemptTimes[i] - attemptTimes[i - 1]).toBeGreaterThanOrEqual(
      GAP_MS,
    );
  }
});

test("both fetchers draw from the one shared throttle budget", async () => {
  const requestTimes: number[] = [];
  const itunes = createItunesFetchers({
    fetchRss: vi.fn(async () => {
      requestTimes.push(Date.now());
      return [];
    }),
    fetchPlaylists: vi.fn(async () => []),
    lookupTracks: vi.fn(async (ids: readonly string[]) => {
      requestTimes.push(Date.now());
      return previewMap(ids, "https://p/1.m4a");
    }),
    throttle: createThrottle(GAP_MS),
  });

  const promise = Promise.all([
    itunes.fetchRss("kr"),
    itunes.lookupTracks(["1"], "kr"),
  ]);
  await vi.runAllTimersAsync();
  await promise;

  expect(requestTimes).toHaveLength(2);
  expect(requestTimes[1] - requestTimes[0]).toBeGreaterThanOrEqual(GAP_MS);
});

test("a lookup that recovers within the retry budget still resolves", async () => {
  const previewUrl = "https://p/1.m4a";
  let attempt = 0;
  const lookupTracks = vi.fn(async (ids: readonly string[], cc: string) => {
    attempt += 1;
    if (attempt === 1)
      throw new ItunesLookupError(ids, cc, "network", "socket hang up");
    return previewMap(ids, previewUrl);
  });
  const itunes = createItunesFetchers({
    fetchRss: vi.fn(async () => []),
    fetchPlaylists: vi.fn(async () => []),
    lookupTracks,
    throttle: createThrottle(GAP_MS),
  });

  const promise = itunes.lookupTracks(["1"], "kr");
  await vi.runAllTimersAsync();

  await expect(promise).resolves.toEqual(previewMap(["1"], previewUrl));
});

test("a failing playlist feed's retry attempts each take their own throttle slot", async () => {
  const attemptTimes: number[] = [];
  const fetchPlaylists = vi.fn(async (cc: string) => {
    attemptTimes.push(Date.now());
    throw new ApplePlaylistsError(cc, "504 Gateway Time-out");
  });
  const itunes = createItunesFetchers({
    fetchRss: vi.fn(async () => []),
    fetchPlaylists,
    lookupTracks: vi.fn(async (ids: readonly string[]) =>
      previewMap(ids, "https://p/1.m4a"),
    ),
    throttle: createThrottle(GAP_MS),
  });

  const promise = itunes.fetchPlaylists("kr").catch((err: unknown) => err);
  await vi.runAllTimersAsync();
  const err = await promise;

  expect(err).toBeInstanceOf(ApplePlaylistsError);
  expect(attemptTimes.length).toBeGreaterThan(1);
  for (let i = 1; i < attemptTimes.length; i++) {
    expect(attemptTimes[i] - attemptTimes[i - 1]).toBeGreaterThanOrEqual(
      GAP_MS,
    );
  }
});

test("a playlist feed that recovers within the retry budget still resolves", async () => {
  let attempt = 0;
  const feed = [
    {
      id: "pl.a",
      name: "a",
      appleUrl: "https://music.apple.com/kr/playlist/pl.a",
      artworkUrl: "https://art/a/600x600bb.jpg",
    },
  ];
  const itunes = createItunesFetchers({
    fetchRss: vi.fn(async () => []),
    fetchPlaylists: vi.fn(async (cc: string) => {
      attempt += 1;
      if (attempt === 1) throw new ApplePlaylistsError(cc, "504");
      return feed;
    }),
    lookupTracks: vi.fn(async (ids: readonly string[]) =>
      previewMap(ids, "https://p/1.m4a"),
    ),
    throttle: createThrottle(GAP_MS),
  });

  const promise = itunes.fetchPlaylists("kr");
  await vi.runAllTimersAsync();

  await expect(promise).resolves.toEqual(feed);
});
