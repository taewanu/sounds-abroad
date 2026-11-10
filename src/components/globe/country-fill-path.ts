import { type CountryRings, unwrapLongitudes } from "@/lib/country-outlines";

export interface RingPathContext {
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  fill(fillRule: CanvasFillRule): void;
}

/**
 * Fills [lon, lat] rings on an equirectangular canvas. An unwrapped ring can run
 * past either canvas edge, so each ring is also drawn one canvas width to each
 * side, which lands the overflow where a horizontally repeating texture samples it.
 */
export function fillCountryRings(
  ctx: RingPathContext,
  rings: CountryRings,
  width: number,
  height: number,
): void {
  ctx.beginPath();
  for (const ring of rings.map(unwrapLongitudes)) {
    for (const shift of [-width, 0, width]) {
      for (let i = 0; i < ring.length; i++) {
        const [lon, lat] = ring[i];
        const x = ((lon + 180) / 360) * width + shift;
        const y = ((90 - lat) / 180) * height;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
    }
  }
  ctx.fill("evenodd");
}
