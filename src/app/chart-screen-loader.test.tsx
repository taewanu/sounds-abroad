import { Suspense } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import { streamingFetch } from "@/lib/__fixtures__/streaming-fetch";
import { CHARTS_READ_TIMEOUT_MS, EARLY_CHARTS_READ } from "@/lib/charts-client";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("./chart-screen", () => ({ ChartScreen: () => <p>chart</p> }));

afterEach(() => {
  delete window[EARLY_CHARTS_READ];
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

// The loader keeps its read for the visit, so each test takes a fresh module.
async function renderFreshLoader() {
  const { ChartScreenLoader: FreshLoader } =
    await import("./chart-screen-loader");
  await act(async () => {
    render(
      <Suspense>
        <FreshLoader />
      </Suspense>,
    );
  });
}

test("a failed chart read offers a retry that reloads the page", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  const reload = vi.fn();
  vi.spyOn(window, "location", "get").mockReturnValue({
    ...window.location,
    reload,
  });

  await renderFreshLoader();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));

  expect(screen.getByRole("alert").textContent).toContain("Charts didn’t load");
  expect(reload).toHaveBeenCalledOnce();
});

test("a response that never starts ends in the failure once the timer runs out", async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    ),
  );

  await renderFreshLoader();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(CHARTS_READ_TIMEOUT_MS);
  });

  expect(screen.getByRole("alert").textContent).toContain("Charts didn’t load");
});

test("a body that keeps arriving is not cut off by the timer, however long it takes", async () => {
  vi.useFakeTimers();
  const chunks = ['{"lastUpdated":"",', '"countries":{}}'];
  vi.stubGlobal(
    "fetch",
    streamingFetch(chunks, CHARTS_READ_TIMEOUT_MS * 0.9, { closes: true }),
  );

  await renderFreshLoader();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(CHARTS_READ_TIMEOUT_MS * 3);
  });

  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByText("chart")).toBeTruthy();
});

test("a body that stalls midway ends in the failure once the timer runs out", async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "fetch",
    streamingFetch(['{"lastUpdated":"",'], CHARTS_READ_TIMEOUT_MS / 2, {
      closes: false,
    }),
  );

  await renderFreshLoader();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(CHARTS_READ_TIMEOUT_MS * 2);
  });

  expect(screen.getByRole("alert").textContent).toContain("Charts didn’t load");
});
