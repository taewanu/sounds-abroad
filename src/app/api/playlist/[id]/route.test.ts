import { afterEach, beforeEach, expect, test, vi } from "vitest";

import {
  ChartPartFetchError,
  ChartPartValidationError,
  fetchPlaylistFile,
} from "@/lib/chart-parts";
import { PlaylistIdSchema } from "@/lib/url-schema";

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
const PLAYLIST_ID = `pl.${"0123456789abcdef".repeat(2)}`;

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
  expect(res.headers.get("cache-control")).toBe("public, max-age=60");
});

test("reports an upstream server error as a bad gateway", async () => {
  fetchPlaylistFileMock.mockRejectedValue(
    new ChartPartFetchError(PLAYLIST_ID, 500, "upstream exploded"),
  );

  const res = await readPlaylist(makeReq(), params(PLAYLIST_ID));

  expect(res.status).toBe(502);
  expect(res.headers.get("cache-control")).toBe("no-store");
});

test("reports a payload that fails validation as a bad gateway", async () => {
  fetchPlaylistFileMock.mockRejectedValue(
    new ChartPartValidationError(PLAYLIST_ID, [], "bad shape"),
  );

  const res = await readPlaylist(makeReq(), params(PLAYLIST_ID));

  expect(res.status).toBe(502);
  expect(res.headers.get("cache-control")).toBe("no-store");
});

test.each(["", "pl.fixture", "../charts", "pl.%2e%2e", `${PLAYLIST_ID}x`])(
  "rejects the malformed id %j without reaching the store",
  async (id) => {
    const res = await readPlaylist(makeReq(), params(id));

    expect(res.status).toBe(400);
    expect(res.headers.get("cache-control")).toBe("public, max-age=60");
    expect(fetchPlaylistFileMock).not.toHaveBeenCalled();
  },
);

test("accepts exactly the ids the crawl's schema accepts", async () => {
  fetchPlaylistFileMock.mockResolvedValue(playlistFile);
  const candidates = [PLAYLIST_ID, PLAYLIST_ID.toUpperCase(), "pl.", "x", ""];

  for (const id of candidates) {
    fetchPlaylistFileMock.mockClear();

    const res = await readPlaylist(makeReq(), params(id));

    const accepted = PlaylistIdSchema.safeParse(id).success;
    expect(res.status !== 400).toBe(accepted);
    expect(fetchPlaylistFileMock).toHaveBeenCalledTimes(accepted ? 1 : 0);
  }
});

test("fails loudly when the charts location is not configured", async () => {
  delete process.env.CHARTS_BLOB_URL;

  const res = await readPlaylist(makeReq(), params(PLAYLIST_ID));

  expect(res.status).toBe(500);
  expect(res.headers.get("cache-control")).toBe("no-store");
  expect(fetchPlaylistFileMock).not.toHaveBeenCalled();
});

test("lets an unrecognized failure through rather than reporting it as upstream", async () => {
  fetchPlaylistFileMock.mockRejectedValue(new Error("something else"));

  await expect(readPlaylist(makeReq(), params(PLAYLIST_ID))).rejects.toThrow(
    "something else",
  );
});
