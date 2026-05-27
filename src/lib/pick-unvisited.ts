export interface PickUnvisitedInput {
  allCodes: readonly string[];
  visited: ReadonlySet<string>;
  rng: () => number;
}

export interface PickUnvisitedResult {
  code: string;
  didReset: boolean;
}

export function pickUnvisited({
  allCodes,
  visited,
  rng,
}: PickUnvisitedInput): PickUnvisitedResult {
  let candidates = allCodes.filter((c) => !visited.has(c));
  let didReset = false;
  if (candidates.length === 0) {
    candidates = [...allCodes];
    didReset = true;
  }

  const index = Math.floor(rng() * candidates.length);
  return { code: candidates[index], didReset };
}
