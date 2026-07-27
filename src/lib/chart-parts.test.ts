import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { MUSIC_CHARTS_TAG } from "./cache-tags";
import {
  chartPartUrl,
  fetchPlaylistFile,
  fetchSongsTail,
  ChartPartFetchError,
  ChartPartValidationError,
} from "./chart-parts";
import type { PlaylistFile } from "./chart-schema";

const CHARTS_URL =
  "https://store.public.blob.vercel-storage.com/charts/v1/charts.json";
const PLAYLIST_ID = "pl.48229b41bbfc47d7af39dae8e8b5276e";

afterEach(() => {
  vi.restoreAllMocks();
});

// The helper reads `process.env` per request, so a key present in the shell or in
// CI would make the no-key assertions below expect an empty header set while the
// request correctly carried one. Cleared per test and restored after, rather than
// saved by hand inside each test, so a later test cannot forget to.
const KEY_OUTSIDE = process.env.CHARTS_READ_KEY;

beforeEach(() => {
  delete process.env.CHARTS_READ_KEY;
});

afterEach(() => {
  if (KEY_OUTSIDE === undefined) delete process.env.CHARTS_READ_KEY;
  else process.env.CHARTS_READ_KEY = KEY_OUTSIDE;
});

function playlistFile(id = PLAYLIST_ID): PlaylistFile {
  return {
    id,
    lastUpdated: "2026-07-20T00:00:00.000Z",
    tracks: [
      {
        rank: 1,
        name: "Ice Cream",
        artist: "연준",
        previewUrl: "https://audio-ssl.itunes.apple.com/1.m4a",
        artworkUrl: "https://is1-ssl.mzstatic.com/1/600x600bb.jpg",
        appleUrl: "https://music.apple.com/kr/album/x?i=1",
      },
    ],
  };
}

function mockJson(body: unknown, status = 200): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
}

test("derives the playlist URL from the charts URL", () => {
  expect(chartPartUrl(CHARTS_URL, "playlists", PLAYLIST_ID)).toBe(
    `https://store.public.blob.vercel-storage.com/charts/v1/playlists/${PLAYLIST_ID}.json`,
  );
});

test("keeps a non-default host and prefix when deriving the URL", () => {
  const url = chartPartUrl(
    "https://cdn.example/x/y/charts.json",
    "playlists",
    "pl.a",
  );

  expect(url).toBe("https://cdn.example/x/y/playlists/pl.a.json");
});

test("escapes a playlist id so it cannot reshape the path", () => {
  const url = chartPartUrl(CHARTS_URL, "playlists", "pl.a/../../secret");

  expect(url).not.toContain("../");
});

test("returns the parsed track list when the body matches the schema", async () => {
  const spy = mockJson(playlistFile());

  const result = await fetchPlaylistFile(CHARTS_URL, PLAYLIST_ID);

  expect(result.tracks[0].artist).toBe("연준");
  expect(result.id).toBe(PLAYLIST_ID);
  expect(spy).toHaveBeenCalledWith(
    chartPartUrl(CHARTS_URL, "playlists", PLAYLIST_ID),
    {
      cache: "force-cache",
      next: { tags: [MUSIC_CHARTS_TAG] },
      signal: expect.any(AbortSignal),
      // Empty with no key configured, which is how this suite runs. What the
      // header carries when one is set has its own test below.
      headers: {},
    },
  );
});

test("throws with the status when the blob is missing", async () => {
  mockJson({}, 404);

  await expect(
    fetchPlaylistFile(CHARTS_URL, PLAYLIST_ID),
  ).rejects.toMatchObject({
    name: "ChartPartFetchError",
    status: 404,
    part: PLAYLIST_ID,
  });
});

test("throws when the body is not JSON", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response("not json", { status: 200 }),
  );

  await expect(
    fetchPlaylistFile(CHARTS_URL, PLAYLIST_ID),
  ).rejects.toBeInstanceOf(ChartPartFetchError);
});

test("throws when the network call rejects", async () => {
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("offline"));

  await expect(
    fetchPlaylistFile(CHARTS_URL, PLAYLIST_ID),
  ).rejects.toMatchObject({ name: "ChartPartFetchError", status: 0 });
});

test("throws when the payload fails schema validation", async () => {
  mockJson({ id: PLAYLIST_ID, lastUpdated: "2026-07-20", tracks: [] });

  await expect(
    fetchPlaylistFile(CHARTS_URL, PLAYLIST_ID),
  ).rejects.toBeInstanceOf(ChartPartValidationError);
});

test("rejects a payload published for a different playlist", async () => {
  mockJson(playlistFile("pl.somethingelse"));

  await expect(
    fetchPlaylistFile(CHARTS_URL, PLAYLIST_ID),
  ).rejects.toMatchObject({
    name: "ChartPartValidationError",
    part: PLAYLIST_ID,
  });
});

test("locates a country's deeper chart beside the playlists", () => {
  expect(chartPartUrl(CHARTS_URL, "songs", "kr")).toBe(
    "https://store.public.blob.vercel-storage.com/charts/v1/songs/kr.json",
  );
});

test("reads a country's deeper chart", async () => {
  const tail = {
    code: "kr",
    lastUpdated: "2026-07-22T00:00:00.000Z",
    tracks: [
      {
        rank: 26,
        name: "A deeper song",
        artist: "An artist",
        previewUrl: null,
        artworkUrl: "https://is1-ssl.mzstatic.com/26/600x600bb.jpg",
        appleUrl: "https://music.apple.com/kr/song/26?i=26",
        spotifyUrl: "https://open.spotify.com/search/a",
      },
    ],
  };
  mockJson(tail);

  await expect(fetchSongsTail(CHARTS_URL, "kr")).resolves.toEqual(tail);
});

test("rejects a deeper chart published for a different country", async () => {
  mockJson({
    code: "ng",
    lastUpdated: "2026-07-22T00:00:00.000Z",
    tracks: [
      {
        rank: 26,
        name: "A deeper song",
        artist: "An artist",
        previewUrl: null,
        artworkUrl: "https://is1-ssl.mzstatic.com/26/600x600bb.jpg",
        appleUrl: "https://music.apple.com/ng/song/26?i=26",
        spotifyUrl: "https://open.spotify.com/search/a",
      },
    ],
  });

  await expect(fetchSongsTail(CHARTS_URL, "kr")).rejects.toBeInstanceOf(
    ChartPartValidationError,
  );
});

// The store answers over a public domain, so the read carries a credential an
// edge rule checks. A listener sees nothing of this: the browser never contacts
// the store, which is why these routes exist.
test("a part read carries the store credential when one is configured", async () => {
  process.env.CHARTS_READ_KEY = "a-secret";
  const spy = mockJson({
    id: PLAYLIST_ID,
    lastUpdated: "2026-05-16T00:00:00.000Z",
    tracks: [
      {
        rank: 1,
        name: "Test",
        artist: "Test Artist",
        previewUrl: "https://audio-ssl.itunes.apple.com/1.m4a",
        artworkUrl: "https://is1-ssl.mzstatic.com/600x600bb.jpg",
        appleUrl: "https://music.apple.com/kr/1",
      },
    ],
  } satisfies PlaylistFile);

  await fetchPlaylistFile(CHARTS_URL, PLAYLIST_ID);

  const init = spy.mock.calls[0][1] as RequestInit;
  expect(init.headers).toMatchObject({ "x-charts-key": "a-secret" });
  // The credential must not cost the caching or the timeout the read sets.
  expect(init.cache).toBe("force-cache");
  expect(init.signal).toBeInstanceOf(AbortSignal);
});
