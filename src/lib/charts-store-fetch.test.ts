import { afterEach, expect, test, vi } from "vitest";

import {
  CHARTS_STORE_KEY_HEADER,
  chartsStoreHeaders,
  fetchChartsStore,
} from "./charts-store-fetch";

const ORIGINAL_KEY = process.env.CHARTS_READ_KEY;

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.CHARTS_READ_KEY;
  else process.env.CHARTS_READ_KEY = ORIGINAL_KEY;
  vi.restoreAllMocks();
});

function captureFetch() {
  const seen: RequestInit[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) => {
    seen.push(init ?? {});
    return Promise.resolve(new Response("{}"));
  });
  return seen;
}

test("the header carries the configured key", () => {
  process.env.CHARTS_READ_KEY = "a-secret";

  expect(chartsStoreHeaders()).toEqual({
    [CHARTS_STORE_KEY_HEADER]: "a-secret",
  });
});

// Absent is not an error, because the code ships before the secret does. A
// throw here would force the deploy order that takes the site down.
test("no key configured sends no header rather than failing", () => {
  delete process.env.CHARTS_READ_KEY;

  expect(chartsStoreHeaders()).toEqual({});
});

test("a store read carries the key", async () => {
  process.env.CHARTS_READ_KEY = "a-secret";
  const seen = captureFetch();

  await fetchChartsStore("https://store.test/charts.json");

  expect(seen[0].headers).toMatchObject({
    [CHARTS_STORE_KEY_HEADER]: "a-secret",
  });
});

test("a store read without a key configured is still made, unauthenticated", async () => {
  delete process.env.CHARTS_READ_KEY;
  const seen = captureFetch();

  await fetchChartsStore("https://store.test/charts.json");

  expect(seen[0].headers).toEqual({});
});

// The caller's own options decide caching and timeouts; attaching a credential
// must not drop them.
test("a caller's request options survive alongside the key", async () => {
  process.env.CHARTS_READ_KEY = "a-secret";
  const seen = captureFetch();
  const signal = AbortSignal.timeout(1000);

  await fetchChartsStore("https://store.test/charts.json", {
    cache: "force-cache",
    signal,
    headers: { accept: "application/json" },
  });

  expect(seen[0].cache).toBe("force-cache");
  expect(seen[0].signal).toBe(signal);
  expect(seen[0].headers).toEqual({
    accept: "application/json",
    [CHARTS_STORE_KEY_HEADER]: "a-secret",
  });
});

test("the key is read per request, so rotating it does not need a restart", async () => {
  const seen = captureFetch();

  process.env.CHARTS_READ_KEY = "first";
  await fetchChartsStore("https://store.test/charts.json");
  process.env.CHARTS_READ_KEY = "second";
  await fetchChartsStore("https://store.test/charts.json");

  expect(seen[0].headers).toMatchObject({ [CHARTS_STORE_KEY_HEADER]: "first" });
  expect(seen[1].headers).toMatchObject({
    [CHARTS_STORE_KEY_HEADER]: "second",
  });
});
