import { afterEach, expect, test, vi } from "vitest";

import { MUSIC_CHARTS_TAG } from "./cache-tags";
import type { PlaylistFile } from "./chart-schema";
import {
  fetchPlaylistFile,
  playlistFileUrl,
  PlaylistFetchError,
  PlaylistValidationError,
} from "./playlist-client";

const CHARTS_URL =
  "https://store.public.blob.vercel-storage.com/charts/v1/charts.json";
const PLAYLIST_ID = "pl.48229b41bbfc47d7af39dae8e8b5276e";

afterEach(() => {
  vi.restoreAllMocks();
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
        previewUrl: "https://preview/1.m4a",
        artworkUrl: "https://art/1/600x600bb.jpg",
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
  expect(playlistFileUrl(CHARTS_URL, PLAYLIST_ID)).toBe(
    `https://store.public.blob.vercel-storage.com/charts/v1/playlists/${PLAYLIST_ID}.json`,
  );
});

test("keeps a non-default host and prefix when deriving the URL", () => {
  const url = playlistFileUrl("https://cdn.example/x/y/charts.json", "pl.a");

  expect(url).toBe("https://cdn.example/x/y/playlists/pl.a.json");
});

test("escapes a playlist id so it cannot reshape the path", () => {
  const url = playlistFileUrl(CHARTS_URL, "pl.a/../../secret");

  expect(url).not.toContain("../");
});

test("returns the parsed track list when the body matches the schema", async () => {
  const spy = mockJson(playlistFile());

  const result = await fetchPlaylistFile(CHARTS_URL, PLAYLIST_ID);

  expect(result.tracks[0].artist).toBe("연준");
  expect(result.id).toBe(PLAYLIST_ID);
  expect(spy).toHaveBeenCalledWith(playlistFileUrl(CHARTS_URL, PLAYLIST_ID), {
    cache: "force-cache",
    next: { tags: [MUSIC_CHARTS_TAG] },
  });
});

test("throws with the status when the blob is missing", async () => {
  mockJson({}, 404);

  await expect(
    fetchPlaylistFile(CHARTS_URL, PLAYLIST_ID),
  ).rejects.toMatchObject({
    name: "PlaylistFetchError",
    status: 404,
    playlistId: PLAYLIST_ID,
  });
});

test("throws when the body is not JSON", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response("not json", { status: 200 }),
  );

  await expect(
    fetchPlaylistFile(CHARTS_URL, PLAYLIST_ID),
  ).rejects.toBeInstanceOf(PlaylistFetchError);
});

test("throws when the network call rejects", async () => {
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("offline"));

  await expect(
    fetchPlaylistFile(CHARTS_URL, PLAYLIST_ID),
  ).rejects.toMatchObject({ name: "PlaylistFetchError", status: 0 });
});

test("throws when the payload fails schema validation", async () => {
  mockJson({ id: PLAYLIST_ID, lastUpdated: "2026-07-20", tracks: [] });

  await expect(
    fetchPlaylistFile(CHARTS_URL, PLAYLIST_ID),
  ).rejects.toBeInstanceOf(PlaylistValidationError);
});

test("rejects a payload published for a different playlist", async () => {
  mockJson(playlistFile("pl.somethingelse"));

  await expect(
    fetchPlaylistFile(CHARTS_URL, PLAYLIST_ID),
  ).rejects.toMatchObject({
    name: "PlaylistValidationError",
    playlistId: PLAYLIST_ID,
  });
});
