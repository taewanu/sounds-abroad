export interface RetryOptions {
  /** Extra attempts after the first (total tries = retries + 1). */
  retries: number;
  /** Base backoff, doubling each retry: backoffMs, 2×, 4×… */
  backoffMs: number;
  sleep: (ms: number) => Promise<void>;
  /** Gates which errors retry; defaults to retrying all. */
  shouldRetry?: (err: unknown) => boolean;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const shouldRetry = options.shouldRetry ?? (() => true);
  let attempt = 0;

  for (;;) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= options.retries || !shouldRetry(err)) throw err;
      await options.sleep(options.backoffMs * 2 ** attempt);
      attempt += 1;
    }
  }
}
