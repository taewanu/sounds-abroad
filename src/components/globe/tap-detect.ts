// Decides whether a pointer gesture was a tap (select the country under the
// finger) or the start of a spin. The controller compares the press-down point
// to the release point rather than summing every move in between, so a finger
// that jitters while held still and lifts near where it landed is read as a tap,
// not a spin. `maxPx` is the wobble tolerance, tuned on real hardware.
export interface Point {
  x: number;
  y: number;
}

export function isTap(start: Point, end: Point, maxPx: number): boolean {
  const dx = end.x - start.x;
  const dy = end.y - start.y;

  return Math.hypot(dx, dy) <= maxPx;
}
