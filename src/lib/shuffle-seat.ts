import type { Country, Track } from "./chart-schema";
import { selectGem } from "./select-gem";

/**
 * The track a shuffle landing starts in the country it drew: that country's
 * Local Gem, when the gem carries a preview.
 *
 * Null otherwise, and the landing then happens in silence. That is acceptable
 * because the landing itself is still visible, the globe travels and the chart
 * changes, and because every charted track carries a preview today; the null
 * covers a failed crawl leaving a country trackless, not a case listeners meet.
 * Redrawing until something plays would be machinery for a case that does not
 * occur.
 *
 * The one place the shuffle's choice is made, so playing another lens's answer
 * is a change here and nowhere else.
 */
export function shuffleSeat(country: Country | undefined): Track | null {
  if (!country) return null;
  const gem = selectGem(country.tracks)?.gem ?? null;
  return gem?.previewUrl ? gem : null;
}
