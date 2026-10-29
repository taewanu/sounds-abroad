import { withRetry } from "./retry";

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export class RevalidateError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "RevalidateError";
  }
}

// A timeout, network error, 5xx or 429 can clear on the next try; any other
// 4xx (a mismatched secret) would only fail the same way again.
function isTransient(err: unknown): boolean {
  if (!(err instanceof RevalidateError)) return true;
  return err.status >= 500 || err.status === 429;
}

export async function triggerRevalidate(
  sleep: (ms: number) => Promise<void> = defaultSleep,
): Promise<void> {
  const url = process.env.SITE_URL;
  const secret = process.env.REVALIDATE_SECRET;
  if (!url) throw new Error("SITE_URL missing");
  if (!secret) throw new Error("REVALIDATE_SECRET missing");

  // Fires immediately: R2 is read-after-write consistent and nothing caches
  // between the upload and this call, so there is no propagation to wait out.
  // The `max-age` the uploads set still governs browsers and Next's own fetch
  // cache; what it does not reach is Cloudflare's edge, which leaves `.json`
  // uncached under its default rules (measured cf-cache-status: DYNAMIC). A
  // cache rule on the data domain would change that, and would need a purge
  // here rather than a wait.
  //
  // Retried because a missed call leaves every page on the previous charts
  // until the next crawl, hours away; the pages' own timers are only daily.
  await withRetry(
    async () => {
      const res = await fetch(`${url}/api/revalidate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${secret}` },
        // Bound each attempt so a hung endpoint doesn't push the cron past its
        // schedule window. TimeoutError surfaces unchanged via Sentry.
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        throw new RevalidateError(
          res.status,
          `revalidate failed: ${res.status} ${res.statusText}`,
        );
      }
    },
    { retries: 2, backoffMs: 5_000, sleep, shouldRetry: isTransient },
  );
}
