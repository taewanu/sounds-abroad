import { expect, test } from "vitest";

import { COUNTRIES } from "@/lib/countries";

import {
  DOUBLE_TAP_MS,
  SELECT_DEFER_MS,
  type GestureConfig,
  type GestureEvent,
  type GestureState,
  initGestureState,
  reduce,
} from "./spin-gesture";

const DEG = Math.PI / 180;
const START = "us";
const country = (code: string) => COUNTRIES.find((c) => c.code === code)!;
const azOf = (code: string) => country(code).lon * DEG;
const elOf = (code: string) => country(code).lat * DEG;

const CFG: GestureConfig = {
  sensitivity: 1,
  friction: 4,
  horizontalLock: false,
  bounce: 0,
  fair: false,
  visited: new Set(),
  reducedMotion: false,
  readMode: false,
};

const cfg = (over: Partial<GestureConfig> = {}): GestureConfig => ({
  ...CFG,
  ...over,
});

const half = () => 0.5; // deterministic rng stub for the snap draw

// Fold a sequence of events through the reducer, returning the final state and
// every command emitted along the way.
function run(
  state: GestureState,
  events: GestureEvent[],
  config: GestureConfig = CFG,
) {
  let s = state;
  const commands = [];
  for (const event of events) {
    const result = reduce(s, event, config);
    s = result.state;
    commands.push(...result.commands);
  }
  return { state: s, commands };
}

const down = (id: number, x: number, y: number, t = 0): GestureEvent => ({
  type: "pointerDown",
  id,
  x,
  y,
  t,
});

test("initGestureState seeds settle targets onto the resting country", () => {
  const s = initGestureState(START);

  expect(s.mode).toBe("idle");
  expect(s.az).toBeCloseTo(azOf(START));
  expect(s.settleAz).toBeCloseTo(s.az);
  expect(s.settleEl).toBeCloseTo(s.el);
  expect(s.settledCode).toBe(START);
});

test("pointerDown starts a drag and captures the pointer", () => {
  const { state, commands } = run(initGestureState(START), [down(1, 100, 100)]);

  expect(state.mode).toBe("drag");
  expect(state.activePointerId).toBe(1);
  expect(commands).toContainEqual({ kind: "capturePointer", id: 1 });
  expect(commands).toContainEqual({ kind: "clearDefer" });
});

test("pointerDown is ignored in read mode so reading never grabs the globe", () => {
  const { state, commands } = run(
    initGestureState(START),
    [down(1, 100, 100)],
    cfg({ readMode: true }),
  );

  expect(state.activePointerId).toBeNull();
  expect(state.mode).toBe("idle");
  expect(commands).toEqual([]);
});

test("a second pointerDown is ignored while one gesture owns the drag", () => {
  const { state } = run(initGestureState(START), [
    down(1, 100, 100),
    down(2, 300, 100),
  ]);

  expect(state.activePointerId).toBe(1);
});

test("pointerMove rotates azimuth opposite the drag, scaled by sensitivity", () => {
  const start = initGestureState(START);
  const { state } = run(start, [
    down(1, 100, 100),
    { type: "pointerMove", id: 1, x: 120, y: 100, t: 16 },
  ]);

  // dx = 20, gain = 0.005 * 1, so az moves by -0.1 rad.
  expect(state.az).toBeCloseTo(start.az - 20 * 0.005);
});

test("pointerMove from a non-owning pointer neither steers nor ends the drag", () => {
  const start = initGestureState(START);
  const { state } = run(start, [
    down(1, 100, 100),
    { type: "pointerMove", id: 2, x: 400, y: 100, t: 16 },
  ]);

  expect(state.az).toBeCloseTo(start.az);
  expect(state.activePointerId).toBe(1);
});

test("read mode flipping on mid-drag rebaselines the pointer without rotating", () => {
  // pointerDown is refused in read mode, so the rebaseline path only matters
  // when a drag already owns the pointer and read mode flips on under it.
  const dragging: GestureState = {
    ...initGestureState(START),
    mode: "drag",
    activePointerId: 1,
    lastX: 100,
    lastY: 100,
  };
  const { state } = run(
    dragging,
    [{ type: "pointerMove", id: 1, x: 120, y: 100, t: 16 }],
    cfg({ readMode: true }),
  );

  expect(state.az).toBeCloseTo(dragging.az);
  expect(state.lastX).toBe(120);
});

test("a moved release flings with velocity from the flick, not a tap select", () => {
  const { state, commands } = run(initGestureState(START), [
    down(1, 100, 100),
    { type: "pointerMove", id: 1, x: 140, y: 100, t: 10 },
    {
      type: "pointerUp",
      id: 1,
      x: 140,
      y: 100,
      t: 10,
      region: "center",
      hitCode: "ca",
      listening: false,
    },
  ]);

  expect(state.mode).toBe("fling");
  expect(state.activePointerId).toBeNull();
  expect(commands.some((c) => c.kind === "settle")).toBe(false);
});

test("a center tap selects the hit country and settles to it", () => {
  const { state, commands } = run(initGestureState(START), [
    down(1, 100, 100),
    {
      type: "pointerUp",
      id: 1,
      x: 100,
      y: 100,
      t: 5,
      region: "center",
      hitCode: "ca",
      listening: true,
    },
  ]);

  expect(state.mode).toBe("settle");
  expect(state.settleAz).toBeCloseTo(azOf("ca"));
  expect(commands).toContainEqual({
    kind: "settle",
    code: "ca",
    changed: true,
    viaTap: true,
  });
});

test("an ocean tap re-centres the current country instead of jumping away", () => {
  const { commands } = run(initGestureState(START), [
    down(1, 100, 100),
    {
      type: "pointerUp",
      id: 1,
      x: 100,
      y: 100,
      t: 5,
      region: "center",
      hitCode: null,
      listening: true,
    },
  ]);

  expect(commands).toContainEqual({
    kind: "settle",
    code: START,
    changed: false,
    viaTap: true,
  });
});

test("a tap landing during an in-flight settle redirects to the tapped country", () => {
  const settling: GestureState = {
    ...initGestureState(START),
    mode: "settle",
    az: azOf("ca"),
    el: elOf("ca"),
    settleAz: azOf("ca"),
    settleEl: elOf("ca"),
  };
  // The press freezes the glide to "drag"; the release taps a new country, so
  // runSelect's mode-"settle" guard is past and the settle redirects.
  const { state, commands } = run(settling, [
    down(1, 100, 100),
    {
      type: "pointerUp",
      id: 1,
      x: 100,
      y: 100,
      t: 5,
      region: "center",
      hitCode: "mx",
      listening: true,
    },
  ]);

  expect(state.settleAz).toBeCloseTo(azOf("mx"));
  expect(commands).toContainEqual({
    kind: "settle",
    code: "mx",
    changed: true,
    viaTap: true,
  });
});

test("a first side-third tap while listening defers its select", () => {
  const { state, commands } = run(initGestureState(START), [
    down(1, 20, 100),
    {
      type: "pointerUp",
      id: 1,
      x: 20,
      y: 100,
      t: 5,
      region: "left",
      hitCode: "ca",
      listening: true,
    },
  ]);

  expect(state.lastEdgeTapAt).toBe(5);
  expect(state.pendingSelectCode).toBe("ca");
  expect(commands).toContainEqual({
    kind: "armDefer",
    delayMs: SELECT_DEFER_MS,
  });
  expect(commands.some((c) => c.kind === "settle")).toBe(false);
});

test("a fired deferred timer selects the pending country", () => {
  const armed: GestureState = {
    ...initGestureState(START),
    mode: "drag",
    pendingSelectCode: "ca",
  };
  const { commands } = run(armed, [{ type: "deferFire" }]);

  expect(commands).toContainEqual({
    kind: "settle",
    code: "ca",
    changed: true,
    viaTap: true,
  });
});

test("a fired deferred timer bails when an external pick already settled", () => {
  const armed: GestureState = {
    ...initGestureState(START),
    mode: "settle",
    pendingSelectCode: "ca",
  };
  const { commands } = run(armed, [{ type: "deferFire" }]);

  expect(commands.some((c) => c.kind === "settle")).toBe(false);
});

test("pointerCancel snaps to a country so it never rests on open ocean", () => {
  const start = initGestureState(START);
  const dragging: GestureState = {
    ...start,
    mode: "drag",
    activePointerId: 1,
  };
  const { commands } = run(
    dragging,
    [{ type: "pointerCancel", id: 1, rng: half }],
    CFG,
  );

  expect(commands.some((c) => c.kind === "settle")).toBe(true);
  expect(commands).toContainEqual({ kind: "releasePointer", id: 1 });
});

test("pointerCancel wipes an armed deferred select as it snaps", () => {
  const armedDrag: GestureState = {
    ...initGestureState(START),
    mode: "drag",
    activePointerId: 1,
    lastEdgeTapAt: 100,
    pendingSelectCode: "ca",
  };
  const { state, commands } = run(armedDrag, [
    { type: "pointerCancel", id: 1, rng: half },
  ]);

  expect(commands).toContainEqual({ kind: "clearDefer" });
  expect(state.lastEdgeTapAt).toBeNull();
});

test("externalSelect settles to a new ?cc= country", () => {
  const { state, commands } = run(initGestureState(START), [
    { type: "externalSelect", code: "mx" },
  ]);

  expect(state.settleAz).toBeCloseTo(azOf("mx"));
  expect(commands).toContainEqual({
    kind: "settle",
    code: "mx",
    changed: true,
    viaTap: false,
  });
});

test("externalSelect no-ops when the target already matches the landing", () => {
  const { commands } = run(initGestureState(START), [
    { type: "externalSelect", code: START },
  ]);

  expect(commands).toEqual([]);
});

test("a fling hands off to the snap spring once it slows below threshold", () => {
  const slow: GestureState = {
    ...initGestureState(START),
    mode: "fling",
    vAz: 1, // below SETTLE_VEL = 2
    vEl: 0,
  };
  const { commands } = run(
    slow,
    [{ type: "frame", dt: 0.016, rng: half }],
    CFG,
  );

  expect(commands.some((c) => c.kind === "settle")).toBe(true);
});

test("a frame in read mode parks an in-flight fling instead of drifting", () => {
  const flinging: GestureState = {
    ...initGestureState(START),
    mode: "fling",
    vAz: 5,
  };
  const { state } = run(
    flinging,
    [{ type: "frame", dt: 0.016, rng: half }],
    cfg({ readMode: true }),
  );

  expect(state.mode).toBe("idle");
  expect(state.vAz).toBe(0);
});

test("a settle converges to idle once the camera sits on the target", () => {
  const settling: GestureState = {
    ...initGestureState(START),
    mode: "settle",
    az: azOf("ca"),
    el: elOf("ca"),
    settleAz: azOf("ca"),
    settleEl: elOf("ca"),
    vAz: 0,
    vEl: 0,
  };
  const { state } = run(settling, [{ type: "frame", dt: 0.016, rng: half }]);

  expect(state.mode).toBe("idle");
});

test("reduced motion cuts straight to the target with no settle glide", () => {
  const { state } = run(
    initGestureState(START),
    [
      down(1, 100, 100),
      {
        type: "pointerUp",
        id: 1,
        x: 100,
        y: 100,
        t: 5,
        region: "center",
        hitCode: "ca",
        listening: true,
      },
    ],
    cfg({ reducedMotion: true }),
  );

  expect(state.mode).toBe("idle");
  expect(state.az).toBeCloseTo(azOf("ca"));
});

// The skip-during-settle resume. A second side-third tap within the window is a
// skip: it moves no globe of its own, but the press that began it froze whatever
// settle was gliding. These two lock the judgment the resume must make.

test("a skip signals its direction and drops the pending select", () => {
  const armed: GestureState = {
    ...initGestureState(START),
    mode: "drag",
    activePointerId: 1,
    lastEdgeTapAt: 100,
    downX: 20,
    downY: 100,
  };
  const { commands } = run(armed, [
    {
      type: "pointerUp",
      id: 1,
      x: 20,
      y: 100,
      t: 100 + DOUBLE_TAP_MS - 1,
      region: "left",
      hitCode: "ca",
      listening: true,
    },
  ]);

  expect(commands).toContainEqual({ kind: "signalSkip", dir: -1 });
  expect(commands).toContainEqual({ kind: "clearDefer" });
});

test("a skip mid-glide resumes the interrupted settle, never stranding the globe", () => {
  const interrupted: GestureState = {
    ...initGestureState(START),
    mode: "drag",
    activePointerId: 1,
    lastEdgeTapAt: 100,
    downX: 20,
    downY: 100,
    az: azOf("ca"),
    el: elOf("ca"),
    settleAz: azOf("mx"), // targets still hold the intended landing
    settleEl: elOf("mx"),
  };
  const { state } = run(interrupted, [
    {
      type: "pointerUp",
      id: 1,
      x: 20,
      y: 100,
      t: 100 + DOUBLE_TAP_MS - 1,
      region: "left",
      hitCode: null,
      listening: true,
    },
  ]);

  expect(state.mode).toBe("settle");
});

test("a skip at rest returns to idle rather than re-running a finished settle", () => {
  const atRest: GestureState = {
    ...initGestureState(START),
    mode: "drag",
    activePointerId: 1,
    lastEdgeTapAt: 100,
    downX: 20,
    downY: 100,
    az: azOf("ca"),
    el: elOf("ca"),
    settleAz: azOf("ca"),
    settleEl: elOf("ca"),
  };
  const { state } = run(atRest, [
    {
      type: "pointerUp",
      id: 1,
      x: 20,
      y: 100,
      t: 100 + DOUBLE_TAP_MS - 1,
      region: "left",
      hitCode: null,
      listening: true,
    },
  ]);

  expect(state.mode).toBe("idle");
});
