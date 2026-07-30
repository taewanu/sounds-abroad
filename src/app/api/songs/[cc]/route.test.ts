import { afterEach, beforeEach, expect, test, vi } from "vitest";

import {
  ChartPartFetchError,
  ChartPartValidationError,
  fetchSongsTail,
} from "@/lib/chart-parts";

import { readSongsTail } from "./route";

vi.mock("@/lib/chart-parts", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/chart-parts")>(
      "@/lib/chart-parts",
    );
  return { ...actual, fetchSongsTail: vi.fn() };
});

const fetchSongsTailMock = vi.mocked(fetchSongsTail);

const CHARTS_URL = "https://data.test/charts/v1/charts.json";
const COUNTRY = "br";

const songsTailFile = {
  code: COUNTRY,
  lastUpdated: "2026-07-21T00:00:00.000Z",
  tracks: [
    {
      rank: 26,
      name: "A Song",
      artist: "An Artist",
      previewUrl: null,
      artworkUrl: "https://art.test/a.jpg",
      appleUrl: "https://music.apple.com/br/song/a/1",
      spotifyUrl: "https://open.spotify.com/track/a1",
    },
  ],
};

function makeReq(): Request {
  return new Request(`http://test/api/songs/${COUNTRY}`);
}

function params(cc: string) {
  return { params: Promise.resolve({ cc }) };
}

beforeEach(() => {
  process.env.CHARTS_BLOB_URL = CHARTS_URL;
});

afterEach(() => {
  delete process.env.CHARTS_BLOB_URL;
  vi.clearAllMocks();
});

test("returns the chart tail for a country that resolves", async () => {
  fetchSongsTailMock.mockResolvedValue(songsTailFile);

  const res = await readSongsTail(makeReq(), params(COUNTRY));

  expect(res.status).toBe(200);
  await expect(res.json()).resolves.toEqual(songsTailFile);
  expect(fetchSongsTailMock).toHaveBeenCalledWith(CHARTS_URL, COUNTRY);
});

test("caches an absent tail for as long as a present one", async () => {
  fetchSongsTailMock.mockRejectedValue(
    new ChartPartFetchError(COUNTRY, 404, "missing"),
  );

  const res = await readSongsTail(makeReq(), params(COUNTRY));

  expect(res.status).toBe(404);
  expect(res.headers.get("cache-control")).toBe("public, max-age=60");
});

test("reports an upstream server error as a bad gateway", async () => {
  fetchSongsTailMock.mockRejectedValue(
    new ChartPartFetchError(COUNTRY, 500, "upstream exploded"),
  );

  const res = await readSongsTail(makeReq(), params(COUNTRY));

  expect(res.status).toBe(502);
  expect(res.headers.get("cache-control")).toBe("no-store");
});

test("reports a payload that fails validation as a bad gateway", async () => {
  fetchSongsTailMock.mockRejectedValue(
    new ChartPartValidationError(COUNTRY, [], "bad shape"),
  );

  const res = await readSongsTail(makeReq(), params(COUNTRY));

  expect(res.status).toBe(502);
  expect(res.headers.get("cache-control")).toBe("no-store");
});

test("rejects a malformed country code without reaching the store", async () => {
  const res = await readSongsTail(makeReq(), params("not-a-code"));

  expect(res.status).toBe(400);
  expect(res.headers.get("cache-control")).toBe("public, max-age=60");
  expect(fetchSongsTailMock).not.toHaveBeenCalled();
});

test("fails loudly when the charts location is not configured", async () => {
  delete process.env.CHARTS_BLOB_URL;

  const res = await readSongsTail(makeReq(), params(COUNTRY));

  expect(res.status).toBe(500);
  expect(res.headers.get("cache-control")).toBe("no-store");
  expect(fetchSongsTailMock).not.toHaveBeenCalled();
});

test("lets an unrecognized failure through rather than reporting it as upstream", async () => {
  fetchSongsTailMock.mockRejectedValue(new Error("something else"));

  await expect(readSongsTail(makeReq(), params(COUNTRY))).rejects.toThrow(
    "something else",
  );
});
