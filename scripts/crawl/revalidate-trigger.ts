export async function triggerRevalidate(): Promise<void> {
  const url = process.env.SITE_URL;
  const secret = process.env.REVALIDATE_SECRET;
  if (!url) throw new Error("SITE_URL missing");
  if (!secret) throw new Error("REVALIDATE_SECRET missing");

  // Fires immediately: R2 is read-after-write consistent, and the published
  // objects are JSON, which Cloudflare's default rules leave uncached
  // (cf-cache-status: DYNAMIC), so nothing stale sits between the upload and
  // this call. A cache rule on the data domain would reintroduce that window,
  // and would need a purge here rather than a wait.
  const res = await fetch(`${url}/api/revalidate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
    // Bound the request so a hung endpoint doesn't push the cron past its
    // schedule window. TimeoutError surfaces unchanged via Sentry.
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`revalidate failed: ${res.status} ${res.statusText}`);
  }
}
