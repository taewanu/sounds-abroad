import { afterEach, expect, test, vi } from "vitest";

import type { ChartFile } from "../../src/lib/chart-schema";

import { loadPreviousCharts } from "./previous-charts";

const PREV_URL = "https://blob/charts/v1/charts-prev.json";

function chartFile(): ChartFile {
  return {
    lastUpdated: "2026-05-15T12:00:00.000Z",
    countries: {
      kr: { name: "South Korea", valid: true, tracks: [] },
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

test("returns the snapshot and reports movement triggers live", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const previous = chartFile();
  const fetchCharts = vi.fn(async () => previous);

  const result = await loadPreviousCharts(PREV_URL, fetchCharts);

  expect(result).toBe(previous);
  expect(fetchCharts).toHaveBeenCalledWith(PREV_URL);
  expect(warn).toHaveBeenCalledWith(
    expect.stringContaining("movement triggers live"),
  );
});

test("returns null and reports inert triggers when the URL is not set", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const fetchCharts = vi.fn(async () => chartFile());

  const result = await loadPreviousCharts(undefined, fetchCharts);

  expect(result).toBeNull();
  expect(fetchCharts).not.toHaveBeenCalled();
  expect(warn).toHaveBeenCalledWith(
    expect.stringContaining("movement triggers inert"),
  );
});

test("returns null and reports inert triggers when the snapshot is unreadable", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const fetchCharts = vi.fn(async () => null);

  const result = await loadPreviousCharts(PREV_URL, fetchCharts);

  expect(result).toBeNull();
  expect(warn).toHaveBeenCalledWith(
    expect.stringContaining("movement triggers inert"),
  );
});
