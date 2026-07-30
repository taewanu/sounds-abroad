export const MISCONFIGURED_MESSAGE = "CHARTS_BLOB_URL is not configured";

// One lifetime for every answer that holds at least until the next crawl:
// the store's answers, present or absent, change only when a crawl publishes,
// and a malformed request stays malformed. Server-side failures are never
// stored, since they can recover at any moment and a cached copy would only
// delay that.
export const CHART_LIFETIME = "public, max-age=60";
export const NEVER_STORE = "no-store";

// The cache directive is required so every response carries a chosen policy
// rather than the storage default an omitted argument would silently inherit.
export function json(body: unknown, status: number, cache: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": cache },
  });
}
