"use client";

import { useCallback, useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";

import { globeChartStore } from "@/lib/globe-chart-store";

import {
  type GestureCommand,
  type GestureConfig,
  type GestureEvent,
  type GestureState,
  initGestureState,
  reduce,
} from "./spin-gesture";
import { pickNearestToPoint, projectFrontCountries } from "./spin-select";
import { horizontalThird } from "./tap-detect";

const RADIUS = 3.5;
const TAP_HIT_PX = 44; // a tap beyond this from every country pin selects nothing

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
  // `changed` is false when the settle re-lands the country already shown, so
  // the caller can fire on every settle but gate country-change side effects.
  // `viaTap` is true only for a bare tap-select, so the tour can tell an
  // accidental tap from the flick it teaches.
  onSettle: (code: string, changed: boolean, viaTap: boolean) => void;
}

// Drives the camera as a spun globe: drag to rotate, release to fling with
// momentum, and on coming to rest snap to the nearest country. A tap jumps
// straight to the nearest country. There is no free-rotate; it never rests on
// open ocean. The gesture machine itself lives in the pure `spin-gesture`
// reducer; this component owns only the impure edges: DOM pointer events in,
// commands and the camera draw out.
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
  onSettle,
}: SpinSnapControlsProps) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);

  const cfg = useRef<GestureConfig>({
    sensitivity,
    friction,
    horizontalLock,
    bounce,
    fair,
    visited,
    reducedMotion,
    readMode,
  });
  const onSettleRef = useRef(onSettle);

  // The pending deferred edge-tap select timer (armDefer/clearDefer commands).
  const deferTimer = useRef<number | null>(null);

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
    };
    onSettleRef.current = onSettle;
  });

  // Lazily seed the sim once, not on every render: passing the value to useRef
  // would rebuild and discard it each time the argument is evaluated. Non-null
  // for the rest of the component's life once this guard has run.
  const sim = useRef<GestureState | null>(null);
  if (sim.current === null) sim.current = initGestureState(initialCode);

  const applyCamera = () => {
    const s = sim.current!;
    camera.position.set(
      RADIUS * Math.cos(s.el) * Math.sin(s.az),
      RADIUS * Math.sin(s.el),
      RADIUS * Math.cos(s.el) * Math.cos(s.az),
    );
    camera.lookAt(0, 0, 0);
  };

  // Run one command: the impure work the reducer can only name (notify, skip,
  // arm/clear the deferred-select timer, capture/release the pointer). A fired
  // timer re-enters the machine via dispatchRef, since useFrame (not an effect)
  // must drive dispatch and so it can't be a useEffectEvent.
  const dispatchRef = useRef<(event: GestureEvent) => void>(() => {});
  const runCommand = useCallback(
    (command: GestureCommand, el: HTMLCanvasElement) => {
      switch (command.kind) {
        case "settle":
          onSettleRef.current(command.code, command.changed, command.viaTap);
          break;
        case "signalSkip":
          globeChartStore.getState().signalSkip(command.dir);
          break;
        case "armDefer":
          if (deferTimer.current !== null)
            window.clearTimeout(deferTimer.current);
          deferTimer.current = window.setTimeout(() => {
            deferTimer.current = null;
            dispatchRef.current({ type: "deferFire" });
          }, command.delayMs);
          break;
        case "clearDefer":
          if (deferTimer.current !== null) {
            window.clearTimeout(deferTimer.current);
            deferTimer.current = null;
          }
          break;
        case "capturePointer":
          el.setPointerCapture?.(command.id);
          break;
        case "releasePointer":
          el.releasePointerCapture?.(command.id);
          break;
      }
    },
    [],
  );

  // Fold an event into the sim, then run its commands. Stable across renders
  // (gl and runCommand are), so the listener effect subscribes once.
  const dispatch = useCallback(
    (event: GestureEvent) => {
      const el = gl.domElement;
      const { state, commands } = reduce(sim.current!, event, cfg.current);
      sim.current = state;
      for (const command of commands) {
        runCommand(command, el);
      }
    },
    [gl, runCommand],
  );
  useEffect(() => {
    dispatchRef.current = dispatch;
  });

  // Follow external selection: when ?cc= changes (the a11y country list, a
  // shared link) settle to it like a gesture would. A gesture's own settle
  // writes ?cc= first, so the reducer no-ops when it already matches.
  useEffect(() => {
    dispatch({ type: "externalSelect", code: targetCode });
  }, [targetCode, dispatch]);

  useEffect(() => {
    const el = gl.domElement;

    const onDown = (e: PointerEvent) => {
      dispatch({
        type: "pointerDown",
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        t: e.timeStamp,
      });
    };

    const onMove = (e: PointerEvent) => {
      dispatch({
        type: "pointerMove",
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        t: e.timeStamp,
      });
    };

    const onUp = (e: PointerEvent) => {
      // Resolve the DOM-dependent tap payload up front so the reducer stays
      // camera-free: which third the release fell in, and the nearest front
      // country to it (null on an ocean tap). Only the tap branch consults them.
      const rect = el.getBoundingClientRect();
      const region = horizontalThird(e.clientX - rect.left, rect.width);
      const candidates = projectFrontCountries(camera, rect.width, rect.height);
      const hitCode = pickNearestToPoint(
        candidates,
        e.clientX - rect.left,
        e.clientY - rect.top,
        TAP_HIT_PX,
      );
      dispatch({
        type: "pointerUp",
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        t: e.timeStamp,
        region,
        hitCode,
        listening: globeChartStore.getState().listening,
      });
    };

    const onCancel = (e: PointerEvent) => {
      dispatch({ type: "pointerCancel", id: e.pointerId, rng: Math.random });
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onCancel);
    return () => {
      if (deferTimer.current !== null) {
        window.clearTimeout(deferTimer.current);
        deferTimer.current = null;
      }
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onCancel);
    };
  }, [gl, camera, dispatch]);

  useFrame((_, dt) => {
    dispatch({ type: "frame", dt, rng: Math.random });
    // Read mode suspends the sim (the frame event leaves az/el frozen); leave
    // the camera untouched too rather than re-pin it every hidden frame.
    if (cfg.current.readMode) return;
    applyCamera();
  });

  return null;
}
