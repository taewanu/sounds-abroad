import { MUSIC_CHARTS_TAG } from "./cache-tags";
import { ChartFileSchema, type ChartFile } from "./chart-schema";

export class ChartsFetchError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ChartsFetchError";
  }
}

export class ChartsValidationError extends Error {
  constructor(
    public readonly issues: unknown,
    message: string,
  ) {
    super(message);
    this.name = "ChartsValidationError";
  }
}

export async function fetchCharts(url: string): Promise<ChartFile> {
  let res: Response;
  try {
    res = await fetch(url, {
      cache: "force-cache",
      next: { tags: [MUSIC_CHARTS_TAG] },
    });
  } catch (err) {
    throw new ChartsFetchError(
      0,
      `Charts fetch failed: ${err instanceof Error ? err.message : "network error"}`,
    );
  }

  if (!res.ok) {
    throw new ChartsFetchError(
      res.status,
      `Charts fetch failed: ${res.status} ${res.statusText}`,
    );
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch (err) {
    throw new ChartsFetchError(
      res.status,
      `Charts fetch failed: invalid JSON (${err instanceof Error ? err.message : "parse error"})`,
    );
  }

  const parsed = ChartFileSchema.safeParse(json);
  if (!parsed.success) {
    throw new ChartsValidationError(
      parsed.error.issues,
      "Charts payload failed schema validation",
    );
  }
  return parsed.data;
}
