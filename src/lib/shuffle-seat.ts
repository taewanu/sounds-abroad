import type { Country, Track } from "./chart-schema";
import { selectGem } from "./select-gem";

/**
 * The track a shuffle landing starts in the country it drew: that country's
 * Local Gem, when the gem carries a preview.
 *
 * Null otherwise, and the landing then happens in silence, which is bearable
 * because the landing itself stays visible: the globe travels and the chart
 * changes. No eager track in the published payload lacked a preview when this
 * was written, so redrawing until something sounds would be machinery for a
 * case measured at zero.
 *
 * The one place the shuffle's choice is made, so playing another lens's answer
 * is a change here and nowhere else.
 */
export function shuffleSeat(country: Country | undefined): Track | null {
  if (!country) return null;
  const gem = selectGem(country.tracks)?.gem ?? null;
  return gem?.previewUrl ? gem : null;
}
