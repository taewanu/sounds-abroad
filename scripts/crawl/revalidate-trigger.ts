// 2× Vercel Blob s-maxage (60s, see upload-blob.ts) — gives edge propagation
// headroom so revalidate doesn't re-cache stale Blob.
const PROPAGATION_MS = 120_000;

export async function triggerRevalidate(): Promise<void> {
  const url = process.env.SITE_URL;
  const secret = process.env.REVALIDATE_SECRET;
  if (!url) throw new Error("SITE_URL missing");
  if (!secret) throw new Error("REVALIDATE_SECRET missing");

  await new Promise((r) => setTimeout(r, PROPAGATION_MS));

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
