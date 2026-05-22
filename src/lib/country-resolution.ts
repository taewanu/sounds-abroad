export type ResolveSource = "url" | "random";

export interface ResolveCountryInput {
  urlParam: string | null;
  allCodes: readonly string[];
  visited: ReadonlySet<string>;
  rng: () => number;
}

export interface ResolveCountryResult {
  code: string;
  source: ResolveSource;
  didReset: boolean;
}

export function resolveCountry({
  urlParam,
  allCodes,
  visited,
  rng,
}: ResolveCountryInput): ResolveCountryResult {
  if (urlParam !== null) {
    const normalized = urlParam.toLowerCase();
    if (allCodes.includes(normalized)) {
      return { code: normalized, source: "url", didReset: false };
    }
  }

  let candidates = allCodes.filter((c) => !visited.has(c));
  let didReset = false;
  if (candidates.length === 0) {
    candidates = [...allCodes];
    didReset = true;
  }

  const index = Math.floor(rng() * candidates.length);
  return { code: candidates[index], source: "random", didReset };
}
