import { COUNTRIES } from "@/lib/countries";

import { flickToSpin } from "./spin-feel";
import { pickSnapCountry } from "./spin-select";
import { type HorizontalThird, classifyTap, isTap } from "./tap-detect";

// The gesture state machine for the spun globe, as a pure reducer. Every drag,
// fling, settle, tap, skip, and interruption transition lives here so the
// interruption matrix (tap-during-settle, skip-during-settle, cancel-during-
// defer, pointer arbitration) is table-testable instead of reasoned by hand in
// event-handler closures. The React shell (`spin-snap-controls.tsx`) owns only
// the impure edges: it translates DOM pointer events into the events below,
// runs the returned commands, and draws the camera from the returned state.
//
// Purity contract: `reduce` never touches the DOM, the camera, timers, the
// chart store, or `Math.random`. Anything impure enters as event payload the
// shell resolves first (the tap's `region` and `hitCode`, the snap draw's
// `rng`) or leaves as a command the shell runs (`settle`, `signalSkip`,
// `armDefer`, `clearDefer`, `capturePointer`, `releasePointer`).

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
const TAP_MAX_PX = 8; // press-to-release drift under which a gesture is a tap
export const DOUBLE_TAP_MS = 280; // edge double-tap window: a 2nd side-third tap within this skips
// Deferred-select delay: waits past the double-tap window (longer than
// DOUBLE_TAP_MS) so main-thread jank can't fire the select before a second
// tap's pointerup and misclassify a skip as a select.
export const SELECT_DEFER_MS = 360;
// Angular tolerance (rad) for "the camera sits on the settle target": ends a
// settle, and tells a skip whether a settle was interrupted mid-glide.
const SETTLE_EPS = 0.002;

const COUNTRY_BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

// Shortest signed angle to rotate `from` onto `to`, so settling never unwinds
// the long way around the globe.
const shortestAngle = (delta: number) =>
  Math.atan2(Math.sin(delta), Math.cos(delta));

export type GestureMode = "idle" | "drag" | "fling" | "settle";

// The whole gesture machine as plain data: camera orientation and velocity, the
// live mode, the settle targets and last-landed country, the one pointer that
// owns the active gesture, the press/last-sample bookkeeping that anchors
// tap-vs-spin and release velocity, the double-tap arm window, and the country a
// deferred edge-tap select will land on when its timer fires.
export interface GestureState {
  az: number;
  el: number;
  vAz: number;
  vEl: number;
  mode: GestureMode;
  settleAz: number;
  settleEl: number;
  settledCode: string;
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
  // Time of the prior deferred side-third tap, or null. Arms the double-tap
  // window: a second side tap within DOUBLE_TAP_MS turns the pair into a skip.
  lastEdgeTapAt: number | null;
  // Country a pending deferred-select timer will land on when it fires.
  pendingSelectCode: string | null;
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
  | { type: "pointerDown"; id: number; x: number; y: number; t: number }
  | { type: "pointerMove"; id: number; x: number; y: number; t: number }
  | {
      type: "pointerUp";
      id: number;
      x: number;
      y: number;
      t: number;
      // Which horizontal third the release fell in (shell reads the rect).
      region: HorizontalThird;
      // Nearest front-facing country to the tap, or null on an ocean tap (shell
      // projects the camera). Only consulted when the release classifies a tap.
      hitCode: string | null;
      listening: boolean;
    }
  | { type: "pointerCancel"; id: number; rng: () => number }
  // A deferred edge-tap select timer fired.
  | { type: "deferFire" }
  // ?cc= changed: the a11y country list or a shared link drives the globe.
  | { type: "externalSelect"; code: string | null }
  | { type: "frame"; dt: number; rng: () => number };

// Impure work the shell runs after each reduce. The reducer names the effect;
// the shell owns how it reaches the DOM, timers, and chart store.
export type GestureCommand =
  | { kind: "settle"; code: string; changed: boolean; viaTap: boolean }
  | { kind: "signalSkip"; dir: 1 | -1 }
  | { kind: "armDefer"; delayMs: number }
  | { kind: "clearDefer" }
  | { kind: "capturePointer"; id: number }
  | { kind: "releasePointer"; id: number };

export interface ReduceResult {
  state: GestureState;
  commands: GestureCommand[];
}

// Resting state seeded to a country. The settle targets start on the resting
// position so "az/el are at the settle targets" reads true from the first
// frame; the skip-during-settle resume relies on that to tell a stranded glide
// from rest.
export function initGestureState(code: string): GestureState {
  const start = COUNTRY_BY_CODE.get(code);
  const startAz = start ? start.lon * DEG : 0;
  const startEl = start ? start.lat * DEG : 0;
  return {
    az: startAz,
    el: startEl,
    vAz: 0,
    vEl: 0,
    mode: "idle",
    settleAz: startAz,
    settleEl: startEl,
    settledCode: code,
    activePointerId: null,
    downX: 0,
    downY: 0,
    lastX: 0,
    lastY: 0,
    lastT: 0,
    vx: 0,
    vy: 0,
    lastEdgeTapAt: null,
    pendingSelectCode: null,
  };
}

const owns = (s: GestureState, id: number) => s.activePointerId === id;

// Aim at a country: record the landing, notify via a `settle` command no matter
// how we got here (fling, tap, external ?cc=), then either cut instantly
// (reduced motion) or hand off to the snap spring the `frame` event runs.
// Mutates the draft `s` and appends to `commands`; both are call-local copies,
// so `reduce` stays pure. A null/unknown code just parks at idle.
function settleTo(
  s: GestureState,
  commands: GestureCommand[],
  cfg: GestureConfig,
  code: string | null,
  viaTap = false,
): void {
  const country = code ? COUNTRY_BY_CODE.get(code) : null;
  if (!country) {
    s.mode = "idle";
    return;
  }
  s.settleAz = country.lon * DEG;
  s.settleEl = country.lat * DEG;
  // Notify on every settle, even re-landing the same country, so the chart
  // resurfaces and the tour re-arms its hint; `changed` lets the shell gate the
  // country-change side effects (?cc=, visited, haptic).
  const changed = s.settledCode !== country.code;
  s.settledCode = country.code;
  commands.push({
    kind: "settle",
    code: country.code,
    changed,
    viaTap,
  });

  if (cfg.reducedMotion) {
    // Instant cut: jump to the spring's end state so the next draw shows the
    // target country with no in-between frames.
    s.az = s.settleAz;
    s.el = s.settleEl;
    s.vAz = 0;
    s.vEl = 0;
    s.mode = "idle";
  } else {
    s.mode = "settle";
  }
}

// Select the tapped country, re-centring the current one on an ocean miss so a
// tap never jumps away. Shared by the immediate-select path and the deferred
// timer; bails when the situation changed while a deferred select was armed:
// read mode forbids moving the globe under the reader, and mode "settle" means
// an external ?cc= already landed during the window.
function runSelect(
  s: GestureState,
  commands: GestureCommand[],
  cfg: GestureConfig,
  code: string | null,
): void {
  if (cfg.readMode || s.mode === "settle") return;
  s.lastEdgeTapAt = null;
  // viaTap: a bare tap-select, so the tour's gesture beat can ignore it rather
  // than treat an accidental tap as the flick it teaches.
  settleTo(s, commands, cfg, code ?? s.settledCode, true);
}

export function reduce(
  state: GestureState,
  event: GestureEvent,
  cfg: GestureConfig,
): ReduceResult {
  const s = { ...state };
  const commands: GestureCommand[] = [];

  switch (event.type) {
    case "pointerDown": {
      // Read mode covers the globe; ignore presses so reading never grabs it.
      if (cfg.readMode) break;
      // A gesture already owns a pointer: ignore a second finger rather than let
      // it reset the drag anchor and hurl the globe on the next move.
      if (s.activePointerId !== null) break;
      // Cancel a deferred edge-tap select so it can't fire mid-gesture; the
      // armed window survives this press so a second tap can still skip.
      commands.push({ kind: "clearDefer" });
      s.mode = "drag";
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
      commands.push({ kind: "capturePointer", id: event.id });
      break;
    }

    case "pointerMove": {
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

    case "pointerUp": {
      if (s.activePointerId === null || !owns(s, event.id)) break;
      s.activePointerId = null;
      commands.push({ kind: "releasePointer", id: event.id });

      if (
        isTap(
          { x: s.downX, y: s.downY },
          { x: event.x, y: event.y },
          TAP_MAX_PX,
        )
      ) {
        const action = classifyTap({
          listening: event.listening,
          region: event.region,
          now: event.t,
          lastEdgeTapAt: s.lastEdgeTapAt,
          windowMs: DOUBLE_TAP_MS,
        });

        if (action.kind === "skip") {
          // A second side-third tap within the window: drop the first tap's
          // pending select and skip instead. A skip moves no globe of its own.
          commands.push({ kind: "clearDefer" });
          s.lastEdgeTapAt = null;
          // The press that began this tap froze any in-flight settle by setting
          // mode to "drag" (see pointerDown). At rest az/el already sit on the
          // targets, so return to idle; otherwise a settle was interrupted mid-
          // glide and its targets still hold the intended landing, so resume it
          // rather than strand the globe mid-flight, possibly on open ocean.
          const atTarget =
            Math.abs(shortestAngle(s.settleAz - s.az)) < SETTLE_EPS &&
            Math.abs(s.settleEl - s.el) < SETTLE_EPS;
          s.mode = atTarget ? "idle" : "settle";
          commands.push({ kind: "signalSkip", dir: action.dir });
          break;
        }

        if (action.kind === "deferSelect") {
          // First side-third tap while listening: defer the select past the
          // double-tap window so a second tap can turn it into a skip; select if
          // none comes. Coordinates are already resolved into hitCode, so the
          // deferred run still aims at the tap point.
          commands.push({ kind: "clearDefer" });
          s.lastEdgeTapAt = event.t;
          s.pendingSelectCode = event.hitCode ?? s.settledCode;
          commands.push({ kind: "armDefer", delayMs: SELECT_DEFER_MS });
          break;
        }

        // Center third or no preview: a double-tap has no skip meaning, so
        // select with no delay and arm no window.
        runSelect(s, commands, cfg, event.hitCode ?? s.settledCode);
        break;
      }

      // A fling is a fresh intent: drop any armed double-tap window.
      s.lastEdgeTapAt = null;
      s.vAz = -flickToSpin(s.vx) * cfg.sensitivity;
      s.vEl = cfg.horizontalLock ? 0 : flickToSpin(s.vy) * cfg.sensitivity;
      s.mode = "fling";
      break;
    }

    case "deferFire": {
      runSelect(s, commands, cfg, s.pendingSelectCode ?? s.settledCode);
      break;
    }

    case "pointerCancel": {
      // An interrupted touch (system gesture, multi-touch) fires pointercancel,
      // not pointerup. Snap to the nearest country so it still never rests on
      // open ocean, and end any armed double-tap window.
      if (s.activePointerId === null || !owns(s, event.id)) break;
      s.activePointerId = null;
      commands.push({ kind: "releasePointer", id: event.id });
      commands.push({ kind: "clearDefer" });
      s.lastEdgeTapAt = null;
      settleTo(
        s,
        commands,
        cfg,
        pickSnapCountry(s.el, s.az, cfg.visited, cfg.fair, event.rng),
      );
      break;
    }

    case "externalSelect": {
      // Follow ?cc=: settle to it like a gesture would when we aren't there. A
      // gesture's own settle wrote ?cc= first, so code === settledCode by the
      // time this runs and it no-ops, no feedback loop. Cancel any armed
      // edge-tap select so a following tap isn't misread as a second tap.
      if (event.code && event.code !== s.settledCode) {
        commands.push({ kind: "clearDefer" });
        s.lastEdgeTapAt = null;
        settleTo(s, commands, cfg, event.code);
      }
      break;
    }

    case "frame": {
      const dt = event.dt;
      // Read mode (sheet at full) hides the globe. Suspend the sim so a leftover
      // fling can't drift and settle a new country under the reader. Park an
      // in-flight fling outright (drop its momentum so it doesn't resume on
      // collapse), but leave a settle alone: a settle is an intentional landing
      // (a gesture, or an external ?cc= pick), so let it resume and land when
      // the sheet collapses. A fling can't reach settle while reading, so
      // mode === "settle" here is always a real selection, never stray momentum.
      if (cfg.readMode) {
        if (s.mode === "fling") {
          s.vAz = 0;
          s.vEl = 0;
          s.mode = "idle";
        }
        break;
      }

      if (s.mode === "fling") {
        s.az += s.vAz * dt;
        s.el = clamp(s.el + s.vEl * dt, -EL_LIMIT, EL_LIMIT);
        const decay = Math.exp(-cfg.friction * dt);
        s.vAz *= decay;
        s.vEl *= decay;
        if (Math.hypot(s.vAz, s.vEl) < SETTLE_VEL) {
          settleTo(
            s,
            commands,
            cfg,
            pickSnapCountry(s.el, s.az, cfg.visited, cfg.fair, event.rng),
          );
        }
      } else if (s.mode === "settle") {
        // Under-damped spring: the view glides past the target country and
        // springs back. Bounce lowers the damping ratio for more overshoot.
        const dtc = Math.min(dt, 0.05);
        const zeta = clamp(1 - 0.7 * cfg.bounce, 0.2, 1);
        const dAz = shortestAngle(s.settleAz - s.az);
        const dEl = s.settleEl - s.el;
        s.vAz +=
          (SNAP_OMEGA * SNAP_OMEGA * dAz - 2 * zeta * SNAP_OMEGA * s.vAz) * dtc;
        s.vEl +=
          (SNAP_OMEGA * SNAP_OMEGA * dEl - 2 * zeta * SNAP_OMEGA * s.vEl) * dtc;
        const speed = Math.hypot(s.vAz, s.vEl);
        if (speed > MAX_SETTLE_VEL) {
          const k = MAX_SETTLE_VEL / speed;
          s.vAz *= k;
          s.vEl *= k;
        }
        s.az += s.vAz * dtc;
        s.el += s.vEl * dtc;
        if (
          Math.abs(shortestAngle(s.settleAz - s.az)) < SETTLE_EPS &&
          Math.abs(s.settleEl - s.el) < SETTLE_EPS &&
          Math.hypot(s.vAz, s.vEl) < 0.02
        ) {
          s.az = s.settleAz;
          s.el = s.settleEl;
          s.vAz = 0;
          s.vEl = 0;
          s.mode = "idle";
        }
      }
      break;
    }
  }

  return { state: s, commands };
}
