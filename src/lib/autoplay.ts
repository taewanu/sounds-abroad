import type { Country, Track } from "@/lib/chart-schema";

// The track a selection autoplays: the country's highest-ranked entry that has a
// real preview. Nulls are skipped, matching the within-country auto-advance.
export function pickAutoplayTrack(country: Country): Track | null {
  return country.tracks.find((t) => t.previewUrl !== null) ?? null;
}
