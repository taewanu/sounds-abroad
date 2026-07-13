import { COUNTRIES } from "./countries";

const VISITED_WEIGHT = 0.08; // how strongly an already-seen country is avoided

// Weighted random draw from `pool`, biased away from already-visited countries
// so the same few do not repeat. `r` (in [0, 1)) is the injected draw position,
// so the bias stays testable without stubbing Math.random.
export function weightedDraw(
  pool: readonly string[],
  visited: ReadonlySet<string>,
  r: number,
): string {
  const weights = pool.map((code) => (visited.has(code) ? VISITED_WEIGHT : 1));
  const total = weights.reduce((sum, w) => sum + w, 0);
  let position = r * total;
  for (let i = 0; i < pool.length; i++) {
    position -= weights[i];
    if (position <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

// The visited set with `code` added. Returns the input set unchanged when the
// code is already present, so settling on the same country does not force a
// re-render through a functional setState.
export function addVisited(
  visited: ReadonlySet<string>,
  code: string,
): ReadonlySet<string> {
  if (visited.has(code)) return visited;
  const next = new Set(visited);
  next.add(code);
  return next;
}

const ALL_CODES = COUNTRIES.map((c) => c.code);

// A fair random country from anywhere on the globe, never one in `exclude`
// (the country already shown, plus any candidates the caller has already
// rejected), so a shuffle always lands somewhere new and an end-of-chart roll
// never redraws a chart that already failed. Unlike the fling snap there is no
// rest direction: geography doesn't narrow the pool, every country is a
// candidate, but the draw reuses the same visited-weighting, so repeated draws
// spread across the map instead of repeating. Randomness enters via `rng`
// (defaults to Math.random), injected so the draw stays testable.
export function pickShuffleCountry(
  visited: ReadonlySet<string>,
  exclude: readonly string[],
  rng: () => number = Math.random,
): string {
  const excluded = new Set(exclude);
  const pool = ALL_CODES.filter((code) => !excluded.has(code));
  return weightedDraw(pool, visited, rng());
}
