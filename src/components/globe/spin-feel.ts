// Maps the flick speed at release (screen px per ms, signed) to the globe's
// initial spin speed (radians per second, signed). This is the heart of the
// swipe feel: how a hard fling versus a gentle nudge translates into travel.
// Linear for now; an eased or capped curve is one lever to tune by hand.
export function flickToSpin(flickPxPerMs: number): number {
  return flickPxPerMs * 6;
}
