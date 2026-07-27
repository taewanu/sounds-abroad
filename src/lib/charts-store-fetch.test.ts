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

/** What the request ended up carrying, whichever form the caller passed in. */
function sentHeaders(init: RequestInit): Record<string, string> {
  return Object.fromEntries(new Headers(init.headers));
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

  expect(sentHeaders(seen[0])).toMatchObject({
    [CHARTS_STORE_KEY_HEADER]: "a-secret",
  });
});

test("a store read without a key configured is still made, unauthenticated", async () => {
  delete process.env.CHARTS_READ_KEY;
  const seen = captureFetch();

  await fetchChartsStore("https://store.test/charts.json");

  expect(sentHeaders(seen[0])).toEqual({});
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
  expect(sentHeaders(seen[0])).toEqual({
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

  expect(sentHeaders(seen[0])).toMatchObject({
    [CHARTS_STORE_KEY_HEADER]: "first",
  });
  expect(sentHeaders(seen[1])).toMatchObject({
    [CHARTS_STORE_KEY_HEADER]: "second",
  });
});

// `fetch` accepts headers in three forms and the type here promises all three.
// An object spread preserves only the first: it empties a `Headers` instance and
// turns an array of pairs into numeric keys, so a caller's headers vanish with
// no error.
test.each([
  { form: "record", headers: { accept: "application/json" } as HeadersInit },
  { form: "Headers", headers: new Headers({ accept: "application/json" }) },
  { form: "pairs", headers: [["accept", "application/json"]] as HeadersInit },
])("a caller's headers survive when passed as $form", async ({ headers }) => {
  process.env.CHARTS_READ_KEY = "a-secret";
  const seen = captureFetch();

  await fetchChartsStore("https://store.test/charts.json", { headers });

  expect(sentHeaders(seen[0])).toEqual({
    accept: "application/json",
    [CHARTS_STORE_KEY_HEADER]: "a-secret",
  });
});
