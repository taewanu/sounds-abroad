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

const DEG = Math.PI / 180;
const RADIUS = 3.5;
const DRAG_RAD_PER_PX = 0.005; // base drag gain, scaled by the sensitivity slider
const EL_LIMIT = 75 * DEG; // stop short of the poles so the view never flips
const SETTLE_VEL = 0.6; // rad/s under which a fling hands off to the snap spring
const SNAP_OMEGA = 10; // snap spring frequency: higher settles faster
const TAP_MAX_PX = 8;

const COUNTRY_BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

// Shortest signed angle to rotate `from` onto `to`, so settling never unwinds
// the long way around the globe.
const shortestAngle = (delta: number) =>
  Math.atan2(Math.sin(delta), Math.cos(delta));

interface SpinSnapControlsProps {
  initialCode: string;
  sensitivity: number;
  friction: number;
  horizontalLock: boolean;
  bounce: number;
  fair: boolean;
  visited: ReadonlySet<string>;
  onSettle: (code: string) => void;
}

// Drives the camera as a spun globe: drag to rotate, release to fling with
// momentum, and on coming to rest snap to the nearest country. A tap jumps
// straight to the nearest country. There is no free-rotate; it never rests on
// open ocean.
export function SpinSnapControls({
  initialCode,
  sensitivity,
  friction,
  horizontalLock,
  bounce,
  fair,
  visited,
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

  const settleTo = (code: string | null) => {
    const s = sim.current;
    const country = code ? COUNTRY_BY_CODE.get(code) : null;
    if (!country) {
      s.mode = "idle";
      return;
    }
    s.settleAz = country.lon * DEG;
    s.settleEl = country.lat * DEG;
    s.mode = "settle";
    if (s.settledCode !== country.code) {
      s.settledCode = country.code;
      onSettleRef.current(country.code);
    }
  };

  useEffect(() => {
    const el = gl.domElement;

    // Gesture tracking held on one mutable object (not reassigned render-scope
    // locals): pointer position, release velocity, drag distance, drag state.
    const g = {
      lastX: 0,
      lastY: 0,
      lastT: 0,
      moved: 0,
      vx: 0,
      vy: 0,
      dragging: false,
    };

    const onDown = (e: PointerEvent) => {
      const s = sim.current;
      s.mode = "drag";
      s.vAz = 0;
      s.vEl = 0;
      g.dragging = true;
      g.lastX = e.clientX;
      g.lastY = e.clientY;
      g.lastT = e.timeStamp;
      g.moved = 0;
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
      g.moved += Math.hypot(dx, dy);
      g.lastX = e.clientX;
      g.lastY = e.clientY;
      g.lastT = e.timeStamp;
    };

    const onUp = (e: PointerEvent) => {
      if (!g.dragging) return;
      g.dragging = false;
      el.releasePointerCapture?.(e.pointerId);
      const s = sim.current;

      if (g.moved < TAP_MAX_PX) {
        const rect = el.getBoundingClientRect();
        const candidates = projectFrontCountries(
          camera,
          rect.width,
          rect.height,
        );
        settleTo(
          pickNearestToPoint(
            candidates,
            e.clientX - rect.left,
            e.clientY - rect.top,
          ),
        );
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
