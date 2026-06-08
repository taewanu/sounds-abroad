export function randomCountryCode(
  codes: readonly string[],
  rng: () => number = Math.random,
): string {
  return codes[Math.floor(rng() * codes.length)];
}
