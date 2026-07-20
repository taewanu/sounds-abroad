import {
  ItunesLookupError,
  type ItunesLookupErrorKind,
  type LookupResult,
} from "./itunes-lookup";
import { withRetry } from "./retry";

// Lookup failures worth retrying: the request never completed (network) or the
// server returned non-2xx (http). A returned-but-wrong payload (json/shape)
// will not change on an immediate retry, so those propagate unretried and the
// batch's tracks resolve to null previews until the next scheduled crawl.
const TRANSIENT_KINDS: ReadonlySet<ItunesLookupErrorKind> = new Set([
  "network",
  "http",
]);

function isTransientLookupError(err: unknown): boolean {
  return err instanceof ItunesLookupError && TRANSIENT_KINDS.has(err.kind);
}

export interface LookupRetryOptions {
  sleep: (ms: number) => Promise<void>;
  retries?: number;
  backoffMs?: number;
}

export type BatchLookup = (
  ids: readonly string[],
  cc: string,
) => Promise<Map<string, LookupResult>>;

/**
 * Wraps a batched lookup so transient failures retry with backoff, mirroring
 * the RSS retry wiring. Drops into the `lookupTracks` dependency slot.
 */
export function withLookupRetry(
  lookup: BatchLookup,
  options: LookupRetryOptions,
): BatchLookup {
  const { sleep, retries = 2, backoffMs = 500 } = options;
  return (ids, cc) =>
    withRetry(() => lookup(ids, cc), {
      retries,
      backoffMs,
      sleep,
      shouldRetry: isTransientLookupError,
    });
}
