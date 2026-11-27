import { COUNTRIES } from '@/lib/countries';

import { flickToSpin } from './spin-feel';
import { pickSnapCountry, pickStep } from './spin-select';
import { isTap } from './tap-detect';

// The gesture state machine for the spun globe, as a pure reducer. Every drag,
// fling, settle, step, and interruption transition lives here so the
// interruption matrix (tap-during-settle, pointer arbitration) is table-testable
// instead of reasoned by hand in event-handler closures. The React shell
// (`spin-snap-controls.tsx`) owns only the impure edges: it translates DOM
// pointer events into the events below, runs the returned commands, and draws
// the camera from the returned state.
//
// Purity contract: `reduce` never touches the DOM, the camera, the chart store,
// or `Math.random`. Anything impure enters as event payload the shell resolves
// first (the tap's `side`, the snap draw's `rng`) or leaves as a command the
// shell runs (`settle`, `capturePointer`, `releasePointer`).

const DEG = Math.PI / 180;
const DRAG_RAD_PER_PX = 0.005; // base drag gain, scaled by the sensitivity slider
const EL_LIMIT = 75 * DEG; // stop short of the poles so the view never flips
const SETTLE_VEL = 2; // rad/s under which a fling hands off to the snap spring
const SNAP_OMEGA = 17; // snap spring frequency: higher settles faster
// rad/s ceiling on a settle. A far external pick (shuffle / a11y list) would
// otherwise ride the spring's amplitude-scaled peak velocity and strobe across
// the globe; the cap turns that into a steady glide. Small post-fling snaps
// stay under it, so their feel is untouched.
const MAX_SETTLE_VEL = 7;
export const TAP_MAX_PX = 8; // press-to-release drift under which a gesture is a tap
const SETTLE_EPS = 0.002; // rad from the settle target under which a settle ends

const COUNTRY_BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// Shortest signed angle to rotate `from` onto `to`, so settling never unwinds
// the long way around the globe.
const shortestAngle = (delta: number) => Math.atan2(Math.sin(delta), Math.cos(delta));

export type GestureMode = 'idle' | 'drag' | 'fling' | 'settle';

// The whole gesture machine as plain data: camera orientation and velocity, the
// live mode, the settle targets and last-landed country, the one pointer that
// owns the active gesture, and the press/last-sample bookkeeping that anchors
// tap-vs-spin and release velocity.
export interface GestureState {
  az: number;
  el: number;
  vAz: number;
  vEl: number;
  mode: GestureMode;
  // Where the globe rests or is headed.
  settleAz: number;
  settleEl: number;
  settledCode: string;
  // The step cursor, a rest direction on the row that taps walk: a step moves
  // it along the row, and any other landing restarts the row on that landing.
  stepAz: number;
  stepEl: number;
  // The pointer owning the active gesture, or null when none does.
  // touchAction:"none" routes every touch to one element, so a second finger's
  // move/up must not steer or end the first finger's drag.
  activePointerId: number | null;
  downX: number;
  downY: number;
  lastX: number;
  lastY: number;
  lastT: number;
  vx: number;
  vy: number;
}

// Config the shell feeds in with each event: the live slider/prop snapshot the
// old handler read from `cfg.current`. Passed per-call so the reducer stays a
// pure function of (state, event, cfg) with no captured mutable refs.
export interface GestureConfig {
  sensitivity: number;
  friction: number;
  horizontalLock: boolean;
  bounce: number;
  fair: boolean;
  visited: ReadonlySet<string>;
  reducedMotion: boolean;
  readMode: boolean;
}

export type GestureEvent =
  | { type: 'pointerDown'; id: number; x: number; y: number; t: number }
  | { type: 'pointerMove'; id: number; x: number; y: number; t: number }
  | {
      type: 'pointerUp';
      id: number;
      x: number;
      y: number;
      t: number;
      // Which half of the globe the release fell in; a tap steps toward it.
      side: 'left' | 'right';
    }
  | { type: 'pointerCancel'; id: number; rng: () => number }
  // The URL country changed: the a11y list or a shared link drives the globe.
  | { type: 'externalSelect'; code: string | null }
  | { type: 'frame'; dt: number; rng: () => number };

// Whether the listener chose this settle as a destination. A gesture (a
// completed fling or step) did, so it earns a history entry; everything else is
// "external" and relabels in place: a followed URL or shared link, a
// programmatic roll, or an interrupted touch snapping back to the nearest
// country, none of which is a landing the listener aimed for.
export type SettleOrigin = 'gesture' | 'external';

// Impure work the shell runs after each reduce. The reducer names the effect;
// the shell owns how it reaches the DOM, timers, and chart store.
export type GestureCommand =
  | {
      kind: 'settle';
      code: string;
      changed: boolean;
      viaTap: boolean;
      origin: SettleOrigin;
    }
  | { kind: 'capturePointer'; id: number }
  | { kind: 'releasePointer'; id: number };

export interface ReduceResult {
  state: GestureState;
  commands: GestureCommand[];
}

export function initGestureState(code: string): GestureState {
  const start = COUNTRY_BY_CODE.get(code);
  const startAz = start ? start.lon * DEG : 0;
  const startEl = start ? start.lat * DEG : 0;
  return {
    az: startAz,
    el: startEl,
    vAz: 0,
    vEl: 0,
    mode: 'idle',
    settleAz: startAz,
    settleEl: startEl,
    settledCode: code,
    stepAz: startAz,
    stepEl: startEl,
    activePointerId: null,
    downX: 0,
    downY: 0,
    lastX: 0,
    lastY: 0,
    lastT: 0,
    vx: 0,
    vy: 0,
  };
}

const owns = (s: GestureState, id: number) => s.activePointerId === id;

// Aim at a country: record the landing, notify via a `settle` command no matter
// how we got here (fling, step, external URL pick), then either cut instantly
// (reduced motion) or hand off to the snap spring the `frame` event runs.
// Mutates the draft `s` and appends to `commands`; both are call-local copies,
// so `reduce` stays pure. A null/unknown code just parks at idle.
function settleTo(
  s: GestureState,
  commands: GestureCommand[],
  cfg: GestureConfig,
  code: string | null,
  viaTap = false,
  origin: SettleOrigin = 'gesture',
): void {
  const country = code ? COUNTRY_BY_CODE.get(code) : null;
  if (!country) {
    s.mode = 'idle';
    return;
  }
  s.settleAz = country.lon * DEG;
  s.settleEl = country.lat * DEG;
  if (!viaTap) {
    s.stepAz = s.settleAz;
    s.stepEl = s.settleEl;
  }
  // Notify on every settle, even re-landing the same country, so the chart
  // resurfaces and the tour re-arms its hint; `changed` lets the shell gate the
  // country-change side effects (URL, visited, haptic).
  const changed = s.settledCode !== country.code;
  s.settledCode = country.code;
  commands.push({
    kind: 'settle',
    code: country.code,
    changed,
    viaTap,
    origin,
  });

  if (cfg.reducedMotion) {
    // Instant cut: jump to the spring's end state so the next draw shows the
    // target country with no in-between frames.
    s.az = s.settleAz;
    s.el = s.settleEl;
    s.vAz = 0;
    s.vEl = 0;
    s.mode = 'idle';
  } else {
    s.mode = 'settle';
  }
}

// Step one country toward the tapped side, unless read mode holds the globe
// still, which settles it in place.
function runStep(
  s: GestureState,
  commands: GestureCommand[],
  cfg: GestureConfig,
  side: 'left' | 'right',
): void {
  if (cfg.readMode) {
    s.mode = 'settle';
    return;
  }
  const step = pickStep(s.stepEl, s.stepAz, side === 'left' ? -1 : 1);
  s.stepAz = step.az;
  // viaTap lets the tour's gesture beat ignore a step instead of counting it as
  // the flick it teaches.
  settleTo(s, commands, cfg, step.code, true);
}

// A spin that stopped short of a landing rests where it stopped, so the camera
// becomes both the settle target and the start of a new row.
function anchorAtCamera(s: GestureState): void {
  s.settleAz = s.az;
  s.settleEl = s.el;
  s.stepAz = s.az;
  s.stepEl = s.el;
}

export function reduce(state: GestureState, event: GestureEvent, cfg: GestureConfig): ReduceResult {
  const s = { ...state };
  const commands: GestureCommand[] = [];

  switch (event.type) {
    case 'pointerDown': {
      // Read mode covers the globe; ignore presses so reading never grabs it.
      if (cfg.readMode) break;
      // A gesture already owns a pointer: ignore a second finger rather than let
      // it reset the drag anchor and hurl the globe on the next move.
      if (s.activePointerId !== null) break;
      if (s.mode === 'fling') anchorAtCamera(s);
      s.mode = 'drag';
      s.vAz = 0;
      s.vEl = 0;
      s.activePointerId = event.id;
      s.downX = event.x;
      s.downY = event.y;
      s.lastX = event.x;
      s.lastY = event.y;
      s.lastT = event.t;
      s.vx = 0;
      s.vy = 0;
      commands.push({ kind: 'capturePointer', id: event.id });
      break;
    }

    case 'pointerMove': {
      if (s.activePointerId === null || !owns(s, event.id)) break;
      // Read mode can flip on mid-drag; a move writes az directly, bypassing the
      // frame suspend, so don't rotate. Keep the pointer baseline current so a
      // flip back off doesn't read the whole gap as one jump.
      if (cfg.readMode) {
        s.lastX = event.x;
        s.lastY = event.y;
        s.lastT = event.t;
        break;
      }
      const dx = event.x - s.lastX;
      const dy = event.y - s.lastY;
      const dt = Math.max(1, event.t - s.lastT);
      const gain = DRAG_RAD_PER_PX * cfg.sensitivity;
      s.az -= dx * gain;
      if (!cfg.horizontalLock) {
        s.el = clamp(s.el + dy * gain, -EL_LIMIT, EL_LIMIT);
      }
      s.vx = dx / dt;
      s.vy = dy / dt;
      s.lastX = event.x;
      s.lastY = event.y;
      s.lastT = event.t;
      break;
    }

    case 'pointerUp': {
      if (s.activePointerId === null || !owns(s, event.id)) break;
      s.activePointerId = null;
      commands.push({ kind: 'releasePointer', id: event.id });

      if (isTap({ x: s.downX, y: s.downY }, { x: event.x, y: event.y }, TAP_MAX_PX)) {
        runStep(s, commands, cfg, event.side);
        break;
      }

      s.vAz = -flickToSpin(s.vx) * cfg.sensitivity;
      s.vEl = cfg.horizontalLock ? 0 : flickToSpin(s.vy) * cfg.sensitivity;
      s.mode = 'fling';
      break;
    }

    case 'pointerCancel': {
      // An interrupted touch (system gesture, multi-touch) fires pointercancel,
      // not pointerup. Snap to the nearest country so it still never rests on
      // open ocean.
      if (s.activePointerId === null || !owns(s, event.id)) break;
      s.activePointerId = null;
      commands.push({ kind: 'releasePointer', id: event.id });
      // The snap-back is recovery, not a chosen landing, so it relabels in place
      // rather than pushing a history entry the back button would have to undo.
      settleTo(
        s,
        commands,
        cfg,
        pickSnapCountry(s.el, s.az, cfg.visited, cfg.fair, event.rng),
        false,
        'external',
      );
      break;
    }

    case 'externalSelect': {
      // Follow the URL country: settle to it like a gesture would when we aren't
      // there. A gesture's own settle wrote the URL first, so code === settledCode by the
      // time this runs and it no-ops, no feedback loop.
      if (!event.code || event.code === s.settledCode) break;
      // A landing ends any press in progress, so the finger's later moves,
      // release, or cancel can't pull the globe off it.
      if (s.activePointerId !== null) {
        commands.push({ kind: 'releasePointer', id: s.activePointerId });
        s.activePointerId = null;
      }
      settleTo(s, commands, cfg, event.code, false, 'external');
      break;
    }

    case 'frame': {
      const dt = event.dt;
      // Read mode (sheet at full) hides the globe. Suspend the sim so a leftover
      // fling can't drift and settle a new country under the reader. Park an
      // in-flight fling outright (drop its momentum so it doesn't resume on
      // collapse), but leave a settle alone: a settle is an intentional landing
      // (a gesture, or an external URL pick), so let it resume and land when
      // the sheet collapses. A fling can't reach settle while reading, so
      // mode === "settle" here is always a real selection, never stray momentum.
      if (cfg.readMode) {
        if (s.mode === 'fling') {
          s.vAz = 0;
          s.vEl = 0;
          s.mode = 'idle';
          anchorAtCamera(s);
        }
        break;
      }

      if (s.mode === 'fling') {
        s.az += s.vAz * dt;
        s.el = clamp(s.el + s.vEl * dt, -EL_LIMIT, EL_LIMIT);
        const decay = Math.exp(-cfg.friction * dt);
        s.vAz *= decay;
        s.vEl *= decay;
        if (Math.hypot(s.vAz, s.vEl) < SETTLE_VEL) {
          settleTo(s, commands, cfg, pickSnapCountry(s.el, s.az, cfg.visited, cfg.fair, event.rng));
        }
      } else if (s.mode === 'settle') {
        // Under-damped spring: the view glides past the target country and
        // springs back. Bounce lowers the damping ratio for more overshoot.
        const dtc = Math.min(dt, 0.05);
        const zeta = clamp(1 - 0.7 * cfg.bounce, 0.2, 1);
        const dAz = shortestAngle(s.settleAz - s.az);
        const dEl = s.settleEl - s.el;
        s.vAz += (SNAP_OMEGA * SNAP_OMEGA * dAz - 2 * zeta * SNAP_OMEGA * s.vAz) * dtc;
        s.vEl += (SNAP_OMEGA * SNAP_OMEGA * dEl - 2 * zeta * SNAP_OMEGA * s.vEl) * dtc;
        const speed = Math.hypot(s.vAz, s.vEl);
        if (speed > MAX_SETTLE_VEL) {
          const k = MAX_SETTLE_VEL / speed;
          s.vAz *= k;
          s.vEl *= k;
        }
        s.az += s.vAz * dtc;
        // Clamp like the fling branch: residual velocity or a high-bounce
        // overshoot toward a near-limit latitude can step el past the pole
        // guard for a frame even though every settle target sits below it.
        s.el = clamp(s.el + s.vEl * dtc, -EL_LIMIT, EL_LIMIT);
        if (
          Math.abs(shortestAngle(s.settleAz - s.az)) < SETTLE_EPS &&
          Math.abs(s.settleEl - s.el) < SETTLE_EPS &&
          Math.hypot(s.vAz, s.vEl) < 0.02
        ) {
          s.az = s.settleAz;
          s.el = s.settleEl;
          s.vAz = 0;
          s.vEl = 0;
          s.mode = 'idle';
        }
      }
      break;
    }
  }

  return { state: s, commands };
}
