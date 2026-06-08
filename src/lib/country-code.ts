import { COUNTRIES, type CountryEntry } from "./countries";

const BY_CODE: ReadonlyMap<string, CountryEntry> = new Map(
  COUNTRIES.map((c) => [c.code, c]),
);

const ALL_CODES: ReadonlySet<string> = new Set(BY_CODE.keys());

// Normalize a raw ?cc= value to its canonical lowercase code, or null when it
// is missing or not a known country. Defaults to the full country set; callers
// with a narrower source (the codes present in a given chart payload) pass their
// own set.
export function validateCountryCode(
  raw: string | null,
  validCodes: ReadonlySet<string> = ALL_CODES,
): string | null {
  if (raw === null) return null;
  const lower = raw.toLowerCase();
  return validCodes.has(lower) ? lower : null;
}

export function countryByCode(code: string): CountryEntry | undefined {
  return BY_CODE.get(code);
}
