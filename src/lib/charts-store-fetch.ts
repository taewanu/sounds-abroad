/**
 * The credential the charts store asks for, in one place.
 *
 * The store answers over a public domain, so anything that knows the address
 * can read the whole payload. A shared secret on the read is what narrows that
 * to this project's own callers: the app and the crawl send it, an edge rule
 * refuses anyone who does not.
 *
 * There are five reads across the app and the crawl, which is why the header is
 * built here rather than at each one. A listener is unaffected either way: the
 * browser never contacts the store, which is why the songs-tail and
 * playlist-chart routes exist.
 */

export const CHARTS_STORE_KEY_HEADER = "x-charts-key";

/**
 * The header when a key is configured, and nothing when it is not.
 *
 * Absent is deliberately not an error. The code has to be deployable before the
 * secret exists and before any rule refuses anything, since the reverse order
 * takes the site down: a rule that refuses unauthenticated reads, enabled while
 * the app still sends none, leaves the app unable to read its own data.
 */
export function chartsStoreHeaders(): Record<string, string> {
  const key = process.env.CHARTS_READ_KEY;
  return key ? { [CHARTS_STORE_KEY_HEADER]: key } : {};
}

/**
 * `fetch` with the credential attached, for callers that pass no request options
 * of their own. Callers that do build their own options merge
 * `chartsStoreHeaders()` in instead, so the caching and timeout they set survive.
 */
export const fetchChartsStore: typeof fetch = (input, init) =>
  globalThis.fetch(input, {
    ...init,
    headers: { ...init?.headers, ...chartsStoreHeaders() },
  });
