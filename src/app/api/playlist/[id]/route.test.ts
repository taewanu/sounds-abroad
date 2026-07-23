import { afterEach, beforeEach, expect, test, vi } from "vitest";

import {
  ChartPartFetchError,
  ChartPartValidationError,
  fetchPlaylistFile,
} from "@/lib/chart-parts";

import { readPlaylist } from "./route";

vi.mock("@/lib/chart-parts", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/chart-parts")>(
      "@/lib/chart-parts",
    );
  return { ...actual, fetchPlaylistFile: vi.fn() };
});

const fetchPlaylistFileMock = vi.mocked(fetchPlaylistFile);

const CHARTS_URL = "https://data.test/charts/v1/charts.json";
const PLAYLIST_ID = "pl.fixture";

const playlistFile = {
  id: PLAYLIST_ID,
  lastUpdated: "2026-07-21T00:00:00.000Z",
  tracks: [
    {
      rank: 1,
      name: "A Song",
      artist: "An Artist",
      previewUrl: null,
      artworkUrl: "https://art.test/a.jpg",
      appleUrl: "https://music.apple.com/br/song/a/1",
    },
  ],
};

function makeReq(): Request {
  return new Request(`http://test/api/playlist/${PLAYLIST_ID}`);
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  process.env.CHARTS_BLOB_URL = CHARTS_URL;
});

afterEach(() => {
  delete process.env.CHARTS_BLOB_URL;
  vi.clearAllMocks();
});

test("returns the track list for a playlist that resolves", async () => {
  fetchPlaylistFileMock.mockResolvedValue(playlistFile);

  const res = await readPlaylist(makeReq(), params(PLAYLIST_ID));

  expect(res.status).toBe(200);
  await expect(res.json()).resolves.toEqual(playlistFile);
  expect(fetchPlaylistFileMock).toHaveBeenCalledWith(CHARTS_URL, PLAYLIST_ID);
});

test("passes an upstream not-found through as a not-found", async () => {
  fetchPlaylistFileMock.mockRejectedValue(
    new ChartPartFetchError(PLAYLIST_ID, 404, "missing"),
  );

  const res = await readPlaylist(makeReq(), params(PLAYLIST_ID));

  expect(res.status).toBe(404);
});

test("reports an upstream server error as a bad gateway", async () => {
  fetchPlaylistFileMock.mockRejectedValue(
    new ChartPartFetchError(PLAYLIST_ID, 500, "upstream exploded"),
  );

  const res = await readPlaylist(makeReq(), params(PLAYLIST_ID));

  expect(res.status).toBe(502);
});

test("reports a payload that fails validation as a bad gateway", async () => {
  fetchPlaylistFileMock.mockRejectedValue(
    new ChartPartValidationError(PLAYLIST_ID, [], "bad shape"),
  );

  const res = await readPlaylist(makeReq(), params(PLAYLIST_ID));

  expect(res.status).toBe(502);
});

test("rejects an empty id without reaching the store", async () => {
  const res = await readPlaylist(makeReq(), params(""));

  expect(res.status).toBe(400);
  expect(fetchPlaylistFileMock).not.toHaveBeenCalled();
});

test("fails loudly when the charts location is not configured", async () => {
  delete process.env.CHARTS_BLOB_URL;

  const res = await readPlaylist(makeReq(), params(PLAYLIST_ID));

  expect(res.status).toBe(500);
  expect(fetchPlaylistFileMock).not.toHaveBeenCalled();
});

test("lets an unrecognized failure through rather than reporting it as upstream", async () => {
  fetchPlaylistFileMock.mockRejectedValue(new Error("something else"));

  await expect(readPlaylist(makeReq(), params(PLAYLIST_ID))).rejects.toThrow(
    "something else",
  );
});
