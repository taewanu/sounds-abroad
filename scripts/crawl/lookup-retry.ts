import {
  ItunesLookupError,
  type ItunesLookupErrorKind,
  type LookupResult,
} from "./itunes-lookup";
import { withRetry } from "./retry";

// Lookup failures worth retrying: the request never completed (network) or the
// server returned non-2xx (http). A returned-but-wrong payload (json/shape/miss)
// will not change on an immediate retry, so those propagate unretried and the
// track resolves to a null preview until the next scheduled crawl.
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

/**
 * Wraps a per-track lookup so transient failures retry with backoff, mirroring
 * the RSS retry wiring. Drops into the `lookupTrack` dependency slot.
 */
export function withLookupRetry(
  lookup: (id: string, cc: string) => Promise<LookupResult>,
  options: LookupRetryOptions,
): (id: string, cc: string) => Promise<LookupResult> {
  const { sleep, retries = 2, backoffMs = 500 } = options;
  return (id, cc) =>
    withRetry(() => lookup(id, cc), {
      retries,
      backoffMs,
      sleep,
      shouldRetry: isTransientLookupError,
    });
}
