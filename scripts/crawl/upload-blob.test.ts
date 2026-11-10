import { IncrementalCache } from "next/dist/server/lib/incremental-cache";
import type { CachedFetchValue } from "next/dist/server/response-cache";
import { afterEach, expect, test, vi } from "vitest";

import type { ChartFile } from "../../src/lib/chart-schema";
import { putJson } from "../lib/object-store";

import {
  DATA_CACHE_ENTRY_CAP,
  DATA_CACHE_ENTRY_OVERHEAD,
  DATA_CACHE_WARN_SIZE,
  dataCacheEntrySize,
  uploadCharts,
} from "./upload-blob";

vi.mock("../lib/object-store", async () => {
  const actual = await vi.importActual<typeof import("../lib/object-store")>(
    "../lib/object-store",
  );
  return { ...actual, putJson: vi.fn(async () => "https://store.test/charts") };
});

const putJsonMock = vi.mocked(putJson);

afterEach(() => {
  vi.restoreAllMocks();
  putJsonMock.mockClear();
});

// Base64 writes every three bytes as four characters, so this is the largest
// body whose entry still sits at the warning size.
const LARGEST_QUIET_BODY_BYTES =
  Math.floor((DATA_CACHE_WARN_SIZE - DATA_CACHE_ENTRY_OVERHEAD) / 4) * 3;

function chartFileOfBytes(bytes: number): ChartFile {
  const empty = JSON.stringify({ lastUpdated: "", countries: {} });
  return { lastUpdated: "x".repeat(bytes - empty.length), countries: {} };
}

/** The entry Next.js builds for a cached fetch, as `patch-fetch.js` assembles it. */
function fetchEntry(body: string, url: string): CachedFetchValue {
  return {
    kind: "FETCH" as CachedFetchValue["kind"],
    data: {
      headers: {},
      body: Buffer.from(body).toString("base64"),
      status: 200,
      url,
    },
    revalidate: 1,
  };
}

/** The size Next.js reports when it refuses to cache `entry`. */
async function sizeNextRefusesAt(entry: CachedFetchValue): Promise<number> {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const cache = new IncrementalCache({
    dev: false,
    requestHeaders: {},
    previewProps: {
      previewModeId: "",
      previewModeSigningKey: "",
      previewModeEncryptionKey: "",
    },
    prerenderManifest: {
      version: 4,
      routes: {},
      dynamicRoutes: {},
      notFoundRoutes: [],
      preview: {
        previewModeId: "",
        previewModeSigningKey: "",
        previewModeEncryptionKey: "",
      },
    },
  });

  await cache.set("key", entry, { fetchCache: true });

  const refusal = String(warn.mock.calls[0]?.[0]);
  return Number(/\((\d+) bytes\)/.exec(refusal)?.[1]);
}

test("sizes a body as the entry Next.js measures against its cap", async () => {
  // Multi-byte characters, so a count of characters and a count of bytes differ.
  const body = "é".repeat(DATA_CACHE_ENTRY_CAP);
  const bare = JSON.stringify(fetchEntry("", "")).length;
  const url = "u".repeat(DATA_CACHE_ENTRY_OVERHEAD - bare);

  const refusedAt = await sizeNextRefusesAt(fetchEntry(body, url));

  expect(dataCacheEntrySize(body)).toBe(refusedAt);
});

test("a chart file whose entry sits at the warning size publishes quietly", async () => {
  const onNearCacheCap = vi.fn();

  await uploadCharts(
    chartFileOfBytes(LARGEST_QUIET_BODY_BYTES),
    onNearCacheCap,
  );

  expect(putJsonMock).toHaveBeenCalledTimes(1);
  expect(onNearCacheCap).not.toHaveBeenCalled();
});

test("a chart file whose entry passes the warning size reports the published body's entry size", async () => {
  const onNearCacheCap = vi.fn();

  await uploadCharts(
    chartFileOfBytes(LARGEST_QUIET_BODY_BYTES + 1),
    onNearCacheCap,
  );

  const published = putJsonMock.mock.calls[0][1];
  expect(Buffer.byteLength(published)).toBe(LARGEST_QUIET_BODY_BYTES + 1);
  expect(onNearCacheCap).toHaveBeenCalledExactlyOnceWith(
    dataCacheEntrySize(published),
  );
});
