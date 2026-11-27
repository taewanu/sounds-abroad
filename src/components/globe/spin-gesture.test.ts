import { expect, test } from 'vitest';

import { COUNTRIES } from '@/lib/countries';

import {
  type GestureCommand,
  type GestureConfig,
  type GestureEvent,
  type GestureState,
  initGestureState,
  reduce,
  TAP_MAX_PX,
} from './spin-gesture';

const DEG = Math.PI / 180;
const START = 'us';
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
function run(state: GestureState, events: GestureEvent[], config: GestureConfig = CFG) {
  let s = state;
  const commands: GestureCommand[] = [];
  for (const event of events) {
    const result = reduce(s, event, config);
    s = result.state;
    commands.push(...result.commands);
  }
  return { state: s, commands };
}

const down = (id: number, x: number, y: number, t = 0): GestureEvent => ({
  type: 'pointerDown',
  id,
  x,
  y,
  t,
});

const move = (id: number, x: number, y: number, t: number): GestureEvent => ({
  type: 'pointerMove',
  id,
  x,
  y,
  t,
});

const up = (id: number, x: number, y: number, t: number, side: 'left' | 'right'): GestureEvent => ({
  type: 'pointerUp',
  id,
  x,
  y,
  t,
  side,
});

// A press and a release on the same spot.
const tap = (side: 'left' | 'right', t = 0): GestureEvent[] => [
  down(1, 100, 100, t),
  up(1, 100, 100, t, side),
];

const landings = (commands: GestureCommand[]) =>
  commands.flatMap((c) => (c.kind === 'settle' ? [c.code] : []));

// Signed shortest azimuth turn from one heading to another: negative is west.
const turn = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

test('initGestureState seeds settle targets onto the resting country', () => {
  const s = initGestureState(START);

  expect(s.mode).toBe('idle');
  expect(s.az).toBeCloseTo(azOf(START));
  expect(s.settleAz).toBeCloseTo(s.az);
  expect(s.settleEl).toBeCloseTo(s.el);
  expect(s.settledCode).toBe(START);
});

test('pointerDown starts a drag and captures the pointer', () => {
  const { state, commands } = run(initGestureState(START), [down(1, 100, 100)]);

  expect(state.mode).toBe('drag');
  expect(state.activePointerId).toBe(1);
  expect(commands).toContainEqual({ kind: 'capturePointer', id: 1 });
});

test('pointerDown is ignored in read mode so reading never grabs the globe', () => {
  const { state, commands } = run(
    initGestureState(START),
    [down(1, 100, 100)],
    cfg({ readMode: true }),
  );

  expect(state.activePointerId).toBeNull();
  expect(state.mode).toBe('idle');
  expect(commands).toEqual([]);
});

test('a second pointerDown is ignored while one gesture owns the drag', () => {
  const { state } = run(initGestureState(START), [down(1, 100, 100), down(2, 300, 100)]);

  expect(state.activePointerId).toBe(1);
});

test('pointerMove rotates azimuth opposite the drag, scaled by sensitivity', () => {
  const start = initGestureState(START);
  const { state } = run(start, [
    down(1, 100, 100),
    { type: 'pointerMove', id: 1, x: 120, y: 100, t: 16 },
  ]);

  // dx = 20, gain = 0.005 * 1, so az moves by -0.1 rad.
  expect(state.az).toBeCloseTo(start.az - 20 * 0.005);
});

test('pointerMove from a non-owning pointer neither steers nor ends the drag', () => {
  const start = initGestureState(START);
  const { state } = run(start, [
    down(1, 100, 100),
    { type: 'pointerMove', id: 2, x: 400, y: 100, t: 16 },
  ]);

  expect(state.az).toBeCloseTo(start.az);
  expect(state.activePointerId).toBe(1);
});

test('read mode flipping on mid-drag rebaselines the pointer without rotating', () => {
  // pointerDown is refused in read mode, so the rebaseline path only matters
  // when a drag already owns the pointer and read mode flips on under it.
  const dragging: GestureState = {
    ...initGestureState(START),
    mode: 'drag',
    activePointerId: 1,
    lastX: 100,
    lastY: 100,
  };
  const { state } = run(
    dragging,
    [{ type: 'pointerMove', id: 1, x: 120, y: 100, t: 16 }],
    cfg({ readMode: true }),
  );

  expect(state.az).toBeCloseTo(dragging.az);
  expect(state.lastX).toBe(120);
});

test('a moved release flings with velocity from the flick, not a step', () => {
  const { state, commands } = run(initGestureState(START), [
    down(1, 100, 100),
    move(1, 140, 100, 10),
    up(1, 140, 100, 10, 'right'),
  ]);

  expect(state.mode).toBe('fling');
  expect(state.activePointerId).toBeNull();
  expect(landings(commands)).toEqual([]);
});

test('a tap on the left half steps to another country west of the current one', () => {
  const { state, commands } = run(initGestureState(START), tap('left'));

  expect(state.mode).toBe('settle');
  expect(state.settledCode).not.toBe(START);
  expect(turn(azOf(START), state.settleAz)).toBeLessThan(0);
  expect(commands).toContainEqual({
    kind: 'settle',
    code: state.settledCode,
    changed: true,
    viaTap: true,
    origin: 'gesture',
  });
});

test('a tap on the right half steps to another country east of the current one', () => {
  const { state, commands } = run(initGestureState(START), tap('right'));

  expect(state.mode).toBe('settle');
  expect(state.settledCode).not.toBe(START);
  expect(turn(azOf(START), state.settleAz)).toBeGreaterThan(0);
  expect(commands).toContainEqual({
    kind: 'settle',
    code: state.settledCode,
    changed: true,
    viaTap: true,
    origin: 'gesture',
  });
});

test('a step lands as a gesture, so its landing pushes a history entry', () => {
  const { commands } = run(initGestureState(START), tap('left'));

  expect(commands.filter((c) => c.kind === 'settle')).toEqual([
    expect.objectContaining({ origin: 'gesture' }),
  ]);
});

test('repeated taps each step one country further, with no wait between them', () => {
  const { commands } = run(initGestureState(START), [
    ...tap('left', 0),
    ...tap('left', 1),
    ...tap('left', 2),
  ]);

  const path = [START, ...landings(commands)];
  expect(path).toHaveLength(4);
  expect(new Set(path).size).toBe(path.length);
  for (let i = 1; i < path.length; i++) {
    expect(turn(azOf(path[i - 1]), azOf(path[i]))).toBeLessThan(0);
  }
});

test('a release at exactly the tap distance threshold still steps', () => {
  const { commands } = run(initGestureState(START), [
    down(1, 100, 100),
    move(1, 100 + TAP_MAX_PX, 100, 10),
    up(1, 100 + TAP_MAX_PX, 100, 10, 'left'),
  ]);

  expect(landings(commands)).toHaveLength(1);
});

test('a release past the tap distance threshold flings instead of stepping', () => {
  const { state, commands } = run(initGestureState(START), [
    down(1, 100, 100),
    move(1, 100 + TAP_MAX_PX + 1, 100, 10),
    up(1, 100 + TAP_MAX_PX + 1, 100, 10, 'left'),
  ]);

  expect(state.mode).toBe('fling');
  expect(landings(commands)).toEqual([]);
});

test('a drag that returns within the tap distance threshold steps rather than flings', () => {
  const { state, commands } = run(initGestureState(START), [
    down(1, 100, 100),
    move(1, 160, 100, 10),
    move(1, 104, 100, 20),
    up(1, 104, 100, 20, 'right'),
  ]);

  expect(state.mode).toBe('settle');
  expect(landings(commands)).toHaveLength(1);
  expect(turn(azOf(START), state.settleAz)).toBeGreaterThan(0);
});

test('a tap during an in-flight settle steps on from where that settle was heading', () => {
  const heading = 'de';
  const settling: GestureState = {
    ...initGestureState(START),
    mode: 'settle',
    settleAz: azOf(heading),
    settleEl: elOf(heading),
    settledCode: heading,
  };

  const { state, commands } = run(settling, tap('right'));

  expect(state.mode).toBe('settle');
  expect(state.settledCode).not.toBe(heading);
  expect(turn(azOf(heading), state.settleAz)).toBeGreaterThan(0);
  expect(commands).toContainEqual(expect.objectContaining({ kind: 'settle', changed: true }));
});

test('a tap that stops a fling steps from where the spin stopped', () => {
  const stoppedAt = 'de';
  const flinging: GestureState = {
    ...initGestureState(START),
    mode: 'fling',
    vAz: 5,
    az: azOf(stoppedAt),
    el: elOf(stoppedAt),
  };

  const { state } = run(flinging, tap('right'));

  expect(state.settledCode).not.toBe(stoppedAt);
  expect(turn(azOf(stoppedAt), state.settleAz)).toBeGreaterThan(0);
});

test('a tap after read mode parked a fling steps from where it parked', () => {
  const parkedAt = 'de';
  const parked: GestureState = {
    ...initGestureState(START),
    mode: 'idle',
    az: azOf(parkedAt),
    el: elOf(parkedAt),
  };

  const { state } = run(parked, tap('right'));

  expect(state.settledCode).not.toBe(parkedAt);
  expect(turn(azOf(parkedAt), state.settleAz)).toBeGreaterThan(0);
});

test('an external landing during the press wins over the tap', () => {
  const { commands } = run(initGestureState(START), [
    down(1, 100, 100),
    { type: 'externalSelect', code: 'mx' },
    up(1, 100, 100, 5, 'left'),
  ]);

  expect(landings(commands)).toEqual(['mx']);
});

test('a tap released under read mode steps nowhere', () => {
  const pressed = run(initGestureState(START), [down(1, 100, 100)]).state;

  const { state, commands } = run(pressed, [up(1, 100, 100, 5, 'left')], cfg({ readMode: true }));

  expect(landings(commands)).toEqual([]);
  expect(state.settledCode).toBe(START);
  expect(state.settleAz).toBeCloseTo(azOf(START));
});

test('a tap released under read mode resumes the settle its press froze', () => {
  const heading = 'de';
  const settling: GestureState = {
    ...initGestureState(START),
    mode: 'settle',
    settleAz: azOf(heading),
    settleEl: elOf(heading),
    settledCode: heading,
  };
  const pressed = run(settling, [down(1, 100, 100)]).state;

  const { state } = run(pressed, [up(1, 100, 100, 5, 'left')], cfg({ readMode: true }));

  expect(state.mode).toBe('settle');
  expect(state.settleAz).toBeCloseTo(azOf(heading));
});

test('pointerCancel snaps to a country so it never rests on open ocean', () => {
  const start = initGestureState(START);
  const dragging: GestureState = {
    ...start,
    mode: 'drag',
    activePointerId: 1,
  };
  const { commands } = run(dragging, [{ type: 'pointerCancel', id: 1, rng: half }], CFG);

  const settle = commands.find((c) => c.kind === 'settle');
  expect(settle).toBeDefined();
  // An interrupted touch is recovery, not a chosen landing, so it must not push
  // a history entry the back button would then have to undo.
  expect(settle).toMatchObject({ origin: 'external' });
  expect(commands).toContainEqual({ kind: 'releasePointer', id: 1 });
});

test('a cancelled press re-lands where it rests instead of stepping', () => {
  const { commands } = run(initGestureState(START), [
    down(1, 100, 100),
    { type: 'pointerCancel', id: 1, rng: half },
  ]);

  expect(commands).toContainEqual({
    kind: 'settle',
    code: START,
    changed: false,
    viaTap: false,
    origin: 'external',
  });
});

test('externalSelect settles to a new ?cc= country', () => {
  const { state, commands } = run(initGestureState(START), [
    { type: 'externalSelect', code: 'mx' },
  ]);

  expect(state.settleAz).toBeCloseTo(azOf('mx'));
  expect(commands).toContainEqual({
    kind: 'settle',
    code: 'mx',
    changed: true,
    viaTap: false,
    origin: 'external',
  });
});

test('externalSelect no-ops when the target already matches the landing', () => {
  const { commands } = run(initGestureState(START), [{ type: 'externalSelect', code: START }]);

  expect(commands).toEqual([]);
});

test('a fling hands off to the snap spring once it slows below threshold', () => {
  const slow: GestureState = {
    ...initGestureState(START),
    mode: 'fling',
    vAz: 1, // below SETTLE_VEL = 2
    vEl: 0,
  };
  const { commands } = run(slow, [{ type: 'frame', dt: 0.016, rng: half }], CFG);

  expect(commands.some((c) => c.kind === 'settle')).toBe(true);
});

test('a frame in read mode parks an in-flight fling instead of drifting', () => {
  const flinging: GestureState = {
    ...initGestureState(START),
    mode: 'fling',
    vAz: 5,
  };
  const { state } = run(
    flinging,
    [{ type: 'frame', dt: 0.016, rng: half }],
    cfg({ readMode: true }),
  );

  expect(state.mode).toBe('idle');
  expect(state.vAz).toBe(0);
});

test('a settle converges to idle once the camera sits on the target', () => {
  const settling: GestureState = {
    ...initGestureState(START),
    mode: 'settle',
    az: azOf('ca'),
    el: elOf('ca'),
    settleAz: azOf('ca'),
    settleEl: elOf('ca'),
    vAz: 0,
    vEl: 0,
  };
  const { state } = run(settling, [{ type: 'frame', dt: 0.016, rng: half }]);

  expect(state.mode).toBe('idle');
});

test('a settle step clamps elevation to the pole guard despite outward velocity', () => {
  const EL_LIMIT = 75 * DEG;
  const settling: GestureState = {
    ...initGestureState(START),
    mode: 'settle',
    az: azOf(START),
    el: EL_LIMIT,
    settleAz: azOf(START),
    settleEl: elOf(START), // a real target, safely below the guard
    vAz: 0,
    vEl: 10, // strong outward velocity carried from a fling
  };
  const { state } = run(settling, [{ type: 'frame', dt: 0.016, rng: half }]);

  expect(state.el).toBeLessThanOrEqual(EL_LIMIT);
});

test('reduced motion cuts straight to the stepped country with no settle glide', () => {
  const { state } = run(initGestureState(START), tap('left'), cfg({ reducedMotion: true }));

  expect(state.mode).toBe('idle');
  expect(state.settledCode).not.toBe(START);
  expect(state.az).toBeCloseTo(state.settleAz);
});
