import { AppleRssError, type AppleRssTrack } from "./apple-rss";
import { withLookupRetry, type BatchLookup } from "./lookup-retry";
import { withRetry } from "./retry";
import type { Throttle } from "./throttle";

export interface ItunesFetchers {
  fetchRss: (cc: string) => Promise<AppleRssTrack[]>;
  lookupTracks: BatchLookup;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Composes both iTunes fetchers over ONE shared throttle, with the retry
 * wrapped around the throttled call so every attempt, not every logical fetch,
 * takes its own slot. Composing the other way lets one slot issue three
 * requests under a failure storm, tripling the per-IP budget the throttle gap
 * encodes and feeding the very rate-limiting being retried.
 */
export function createItunesFetchers(deps: {
  fetchRss: (cc: string) => Promise<AppleRssTrack[]>;
  lookupTracks: BatchLookup;
  throttle: Throttle;
  sleep?: (ms: number) => Promise<void>;
}): ItunesFetchers {
  const { throttle } = deps;
  const sleep = deps.sleep ?? defaultSleep;
  return {
    fetchRss: (cc) =>
      withRetry(() => throttle(() => deps.fetchRss(cc)), {
        retries: 2,
        backoffMs: 500,
        sleep,
        shouldRetry: (err) => err instanceof AppleRssError,
      }),
    lookupTracks: withLookupRetry(
      (ids, cc) => throttle(() => deps.lookupTracks(ids, cc)),
      { sleep },
    ),
  };
}
