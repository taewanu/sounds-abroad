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

export type HorizontalThird = "left" | "center" | "right";

// Which horizontal third of a `width`-wide viewport the point `x` falls in. The
// caller treats the side thirds as skip zones (left->prev, right->next) and the
// center as plain select. Boundaries lean toward the center so the side zones
// never overrun the middle.
export function horizontalThird(x: number, width: number): HorizontalThird {
  if (x < width / 3) return "left";
  if (x >= (width * 2) / 3) return "right";
  return "center";
}

// What a settled tap should do: skip a track, select immediately, or arm the
// double-tap skip window. A skip needs a preview playing and two empty taps in
// a side third within `windowMs`; the second tap's side picks the direction.
export type TapAction =
  | { kind: "skip"; dir: 1 | -1 }
  | { kind: "select" }
  | { kind: "armSkip" };

// A tap that resolves to a country pin (`hit`) selects with no delay wherever
// it lands, so a country rendered in a side third is never second-class. The
// skip gesture lives only over empty globe: an empty side-third tap while
// listening arms the window, and a second one within it turns the pair into a
// skip. An empty center tap or a tap with no preview has no skip meaning, so
// it selects with no delay. `lastEdgeTapAt` is the time of the prior arming
// tap, or null.
export function classifyTap(args: {
  listening: boolean;
  region: HorizontalThird;
  hit: boolean;
  now: number;
  lastEdgeTapAt: number | null;
  windowMs: number;
}): TapAction {
  const { listening, region, hit, now, lastEdgeTapAt, windowMs } = args;

  if (hit || !listening || region === "center") return { kind: "select" };

  if (lastEdgeTapAt !== null && now - lastEdgeTapAt <= windowMs) {
    return { kind: "skip", dir: region === "left" ? -1 : 1 };
  }

  return { kind: "armSkip" };
}
