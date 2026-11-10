import { afterEach, expect, test, vi } from "vitest";

import type { ChartFile } from "../../src/lib/chart-schema";
import { putJson } from "../lib/object-store";

import {
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

test("sizes a body by its base64 length plus the entry overhead", () => {
  // Multi-byte characters, so a count of characters and a count of bytes differ.
  const body = "é".repeat(1000);

  const size = dataCacheEntrySize(body);

  expect(size).toBe(
    Buffer.from(body).toString("base64").length + DATA_CACHE_ENTRY_OVERHEAD,
  );
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
