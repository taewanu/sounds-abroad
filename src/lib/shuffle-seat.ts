import type { Country, Track } from "./chart-schema";
import { selectGem } from "./select-gem";

/**
 * The track a shuffle landing starts in the country it drew: that country's
 * Local Gem, when the gem carries a preview. Null otherwise, so a country left
 * trackless by a failed crawl, or holding a gem the feed gives no preview for,
 * lands in silence rather than on a seat that can only report a failure.
 *
 * The one place the shuffle's choice is made, so playing another lens's answer
 * is a change here and nowhere else.
 */
export function shuffleSeat(country: Country | undefined): Track | null {
  if (!country) return null;
  const gem = selectGem(country.tracks)?.gem ?? null;
  return gem?.previewUrl ? gem : null;
}
