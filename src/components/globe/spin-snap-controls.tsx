"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";

import { COUNTRIES } from "@/lib/countries";

import { flickToSpin } from "./spin-feel";
import {
  pickNearestToPoint,
  pickSnapCountry,
  projectFrontCountries,
} from "./spin-select";
import { horizontalThird, isTap } from "./tap-detect";

const DEG = Math.PI / 180;
const RADIUS = 3.5;
const DRAG_RAD_PER_PX = 0.005; // base drag gain, scaled by the sensitivity slider
const EL_LIMIT = 75 * DEG; // stop short of the poles so the view never flips
const SETTLE_VEL = 2; // rad/s under which a fling hands off to the snap spring
const SNAP_OMEGA = 17; // snap spring frequency: higher settles faster
const TAP_MAX_PX = 8; // press-to-release drift under which a gesture is a tap
const TAP_HIT_PX = 44; // a tap beyond this from every country pin selects nothing

const COUNTRY_BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

// Shortest signed angle to rotate `from` onto `to`, so settling never unwinds
// the long way around the globe.
const shortestAngle = (delta: number) =>
  Math.atan2(Math.sin(delta), Math.cos(delta));

interface SpinSnapControlsProps {
  initialCode: string;
  // The externally-selected country (?cc=); the globe settles to it when it
  // changes, so the a11y list and shared links drive the globe like a gesture.
  targetCode: string | null;
  // OS "reduce motion": replaces the snap spring with an instant cut.
  reducedMotion: boolean;
  sensitivity: number;
  friction: number;
  horizontalLock: boolean;
  bounce: number;
  fair: boolean;
  visited: ReadonlySet<string>;
  readMode: boolean;
  // A track is playing: a no-movement tap on the left/right third skips instead
  // of selecting. Off (no track) keeps every tap selecting a country.
  listening: boolean;
  onSkip: (dir: 1 | -1) => void;
  // `changed` is false when the settle re-lands the country already shown, so
  // the caller can fire on every settle but gate country-change side effects.
  onSettle: (code: string, changed: boolean) => void;
}

// Drives the camera as a spun globe: drag to rotate, release to fling with
// momentum, and on coming to rest snap to the nearest country. A tap jumps
// straight to the nearest country. There is no free-rotate; it never rests on
// open ocean.
export function SpinSnapControls({
  initialCode,
  targetCode,
  reducedMotion,
  sensitivity,
  friction,
  horizontalLock,
  bounce,
  fair,
  visited,
  readMode,
  listening,
  onSkip,
  onSettle,
}: SpinSnapControlsProps) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);

  const cfg = useRef({
    sensitivity,
    friction,
    horizontalLock,
    bounce,
    fair,
    visited,
    reducedMotion,
    readMode,
    listening,
    onSkip,
  });
  const onSettleRef = useRef(onSettle);

  // Keep the long-lived pointer handlers and per-frame loop reading the latest
  // props without re-subscribing. Written in an effect, never during render.
  useEffect(() => {
    cfg.current = {
      sensitivity,
      friction,
      horizontalLock,
      bounce,
      fair,
      visited,
      reducedMotion,
      readMode,
      listening,
      onSkip,
    };
    onSettleRef.current = onSettle;
  });

  const sim = useRef(
    (() => {
      const start = COUNTRY_BY_CODE.get(initialCode);
      return {
        az: start ? start.lon * DEG : 0,
        el: start ? start.lat * DEG : 0,
        vAz: 0,
        vEl: 0,
        mode: "idle" as "idle" | "drag" | "fling" | "settle",
        settleAz: 0,
        settleEl: 0,
        settledCode: initialCode,
      };
    })(),
  );

  const applyCamera = () => {
    const s = sim.current;
    camera.position.set(
      RADIUS * Math.cos(s.el) * Math.sin(s.az),
      RADIUS * Math.sin(s.el),
      RADIUS * Math.cos(s.el) * Math.cos(s.az),
    );
    camera.lookAt(0, 0, 0);
  };

  // Aim the camera at a country. Records the landing and notifies once via
  // onSettle no matter how we got here (fling, tap, or an external ?cc=
  // change), then either cuts instantly (reduced motion) or hands off to the
  // snap spring in useFrame.
  const settleTo = (code: string | null) => {
    const s = sim.current;
    const country = code ? COUNTRY_BY_CODE.get(code) : null;
    if (!country) {
      s.mode = "idle";
      return;
    }
    s.settleAz = country.lon * DEG;
    s.settleEl = country.lat * DEG;
    // Notify on every settle, even re-landing the same country, so the chart
    // resurfaces and the tour re-arms its hint; the `changed` flag lets the
    // caller gate the country-change side effects (?cc=, visited, haptic).
    const changed = s.settledCode !== country.code;
    s.settledCode = country.code;
    onSettleRef.current(country.code, changed);

    if (cfg.current.reducedMotion) {
      // Instant cut: jump straight to the spring's end state so the next
      // applyCamera draws the target country with no in-between frames.
      s.az = s.settleAz;
      s.el = s.settleEl;
      s.vAz = 0;
      s.vEl = 0;
      s.mode = "idle";
    } else {
      s.mode = "settle";
    }
  };

  // Follow external selection: when ?cc= changes (the a11y country list, a
  // shared link) and we aren't already there, settle to it like a gesture
  // would. A gesture's own settle writes ?cc=, so targetCode === settledCode by
  // the time this runs — it no-ops, no feedback loop.
  useEffect(() => {
    if (targetCode && targetCode !== sim.current.settledCode) {
      settleTo(targetCode);
    }
  }, [targetCode]);

  useEffect(() => {
    const el = gl.domElement;

    // Gesture tracking held on one mutable object (not reassigned render-scope
    // locals): press-down point, last pointer position, release velocity, drag
    // state. The down point anchors tap-vs-spin: we compare it to the release
    // point, so a jitter that returns near the start stays a tap.
    const g = {
      downX: 0,
      downY: 0,
      lastX: 0,
      lastY: 0,
      lastT: 0,
      vx: 0,
      vy: 0,
      dragging: false,
    };

    const onDown = (e: PointerEvent) => {
      // Read mode covers the globe; ignore presses so reading never grabs it.
      if (cfg.current.readMode) return;
      const s = sim.current;
      s.mode = "drag";
      s.vAz = 0;
      s.vEl = 0;
      g.dragging = true;
      g.downX = e.clientX;
      g.downY = e.clientY;
      g.lastX = e.clientX;
      g.lastY = e.clientY;
      g.lastT = e.timeStamp;
      g.vx = 0;
      g.vy = 0;
      el.setPointerCapture?.(e.pointerId);
    };

    const onMove = (e: PointerEvent) => {
      if (!g.dragging) return;
      const s = sim.current;
      const dx = e.clientX - g.lastX;
      const dy = e.clientY - g.lastY;
      const dt = Math.max(1, e.timeStamp - g.lastT);
      const gain = DRAG_RAD_PER_PX * cfg.current.sensitivity;

      s.az -= dx * gain;
      if (!cfg.current.horizontalLock) {
        s.el = clamp(s.el + dy * gain, -EL_LIMIT, EL_LIMIT);
      }
      g.vx = dx / dt;
      g.vy = dy / dt;
      g.lastX = e.clientX;
      g.lastY = e.clientY;
      g.lastT = e.timeStamp;
    };

    const onUp = (e: PointerEvent) => {
      if (!g.dragging) return;
      g.dragging = false;
      el.releasePointerCapture?.(e.pointerId);
      const s = sim.current;

      if (
        isTap(
          { x: g.downX, y: g.downY },
          { x: e.clientX, y: e.clientY },
          TAP_MAX_PX,
        )
      ) {
        const rect = el.getBoundingClientRect();

        // While listening, an edge tap skips: left third -> prev, right third ->
        // next. The center third falls through to the usual select-nearest. A
        // drag never reaches here (isTap above gates it), so spinning is intact.
        if (cfg.current.listening) {
          const third = horizontalThird(e.clientX - rect.left, rect.width);
          if (third === "left") {
            cfg.current.onSkip(-1);
            return;
          }
          if (third === "right") {
            cfg.current.onSkip(1);
            return;
          }
        }

        const candidates = projectFrontCountries(
          camera,
          rect.width,
          rect.height,
        );
        const hit = pickNearestToPoint(
          candidates,
          e.clientX - rect.left,
          e.clientY - rect.top,
          TAP_HIT_PX,
        );
        // A tap that lands on no country re-centres the current one, so a
        // mis-aim on open ocean does nothing rather than jumping away.
        settleTo(hit ?? s.settledCode);
        return;
      }

      const sens = cfg.current.sensitivity;
      s.vAz = -flickToSpin(g.vx) * sens;
      s.vEl = cfg.current.horizontalLock ? 0 : flickToSpin(g.vy) * sens;
      s.mode = "fling";
    };

    // An interrupted touch (system gesture, multi-touch) fires pointercancel,
    // not pointerup. Without this the drag never ends and the globe freezes.
    // Snap to the nearest country so it still never rests on open ocean.
    const onCancel = (e: PointerEvent) => {
      if (!g.dragging) return;
      g.dragging = false;
      el.releasePointerCapture?.(e.pointerId);
      const s = sim.current;
      settleTo(
        pickSnapCountry(s.el, s.az, cfg.current.visited, cfg.current.fair),
      );
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onCancel);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onCancel);
    };
  }, [gl, camera]);

  useFrame((_, dt) => {
    const s = sim.current;

    // Read mode (sheet at full) hides the globe. Suspend the sim so a leftover
    // fling can't drift and settle a new country under the reader. Park an
    // in-flight fling outright (drop its momentum so it doesn't resume on
    // collapse), but leave a settle in progress alone: a settle is an
    // intentional landing (a gesture, or an external ?cc= pick from the a11y
    // selector), so let it resume and land when the sheet collapses. A fling
    // can't reach settle while reading, so mode === "settle" here is always a
    // real selection, never stray momentum.
    if (cfg.current.readMode) {
      if (s.mode === "fling") {
        s.vAz = 0;
        s.vEl = 0;
        s.mode = "idle";
      }
      return;
    }

    if (s.mode === "fling") {
      s.az += s.vAz * dt;
      s.el = clamp(s.el + s.vEl * dt, -EL_LIMIT, EL_LIMIT);
      const decay = Math.exp(-cfg.current.friction * dt);
      s.vAz *= decay;
      s.vEl *= decay;
      if (Math.hypot(s.vAz, s.vEl) < SETTLE_VEL) {
        settleTo(
          pickSnapCountry(s.el, s.az, cfg.current.visited, cfg.current.fair),
        );
      }
    } else if (s.mode === "settle") {
      // Under-damped spring: the view glides past the target country and
      // springs back. Bounce lowers the damping ratio for more overshoot.
      const dtc = Math.min(dt, 0.05);
      const zeta = clamp(1 - 0.7 * cfg.current.bounce, 0.2, 1);
      const dAz = shortestAngle(s.settleAz - s.az);
      const dEl = s.settleEl - s.el;
      s.vAz +=
        (SNAP_OMEGA * SNAP_OMEGA * dAz - 2 * zeta * SNAP_OMEGA * s.vAz) * dtc;
      s.vEl +=
        (SNAP_OMEGA * SNAP_OMEGA * dEl - 2 * zeta * SNAP_OMEGA * s.vEl) * dtc;
      s.az += s.vAz * dtc;
      s.el += s.vEl * dtc;
      if (
        Math.abs(shortestAngle(s.settleAz - s.az)) < 0.002 &&
        Math.abs(s.settleEl - s.el) < 0.002 &&
        Math.hypot(s.vAz, s.vEl) < 0.02
      ) {
        s.az = s.settleAz;
        s.el = s.settleEl;
        s.vAz = 0;
        s.vEl = 0;
        s.mode = "idle";
      }
    }
    applyCamera();
  });

  return null;
}
