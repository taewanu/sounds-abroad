import { ChartFileSchema, type ChartFile } from "../../src/lib/chart-schema";

/**
 * Reads the last published payload so a failed crawl can carry forward
 * last-good data. Degrades to null on any failure — carry-forward is
 * best-effort and must never abort the crawl.
 */
export async function fetchPublishedCharts(
  url: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<ChartFile | null> {
  try {
    const res = await fetchImpl(url);
    if (!res.ok) return null;
    const json: unknown = await res.json();
    const parsed = ChartFileSchema.safeParse(json);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
