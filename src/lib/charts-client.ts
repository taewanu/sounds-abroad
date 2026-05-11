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
  const res = await fetch(url, {
    cache: "force-cache",
    next: { tags: ["charts"] },
  });
  if (!res.ok) {
    throw new ChartsFetchError(
      res.status,
      `Charts fetch failed: ${res.status} ${res.statusText}`,
    );
  }
  const json: unknown = await res.json();
  const parsed = ChartFileSchema.safeParse(json);
  if (!parsed.success) {
    throw new ChartsValidationError(
      parsed.error.issues,
      "Charts payload failed schema validation",
    );
  }
  return parsed.data;
}
