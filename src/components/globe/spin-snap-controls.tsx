'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  type GestureCommand,
  type GestureConfig,
  type GestureEvent,
  type SettleOrigin,
  initGestureState,
  reduce,
} from './spin-gesture';

const RADIUS = 3.5;

interface SpinSnapControlsProps {
  initialCode: string;
  // The externally-selected country (from the URL); the globe settles to it when it
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
  // `viaTap` is true only for a tap step, so the tour can tell a tap from the
  // flick it teaches. `origin` is "gesture" for a fling or step and "external"
  // for a URL/list/programmatic settle, so the caller can push a history entry
  // for the first and relabel in place for the second.
  onSettle: (code: string, changed: boolean, viaTap: boolean, origin: SettleOrigin) => void;
}

// Drives the camera as a spun globe: drag to rotate, release to fling with
// momentum, and on coming to rest snap to the nearest country. A tap on either
// half steps one country west or east. There is no free-rotate; it never rests
// on open ocean. The gesture machine itself lives in the pure `spin-gesture`
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

  // Seed the sim once at mount. useState's lazy initializer runs the build a
  // single time (passing it straight to useRef would rebuild and discard it
  // every render), and holding it in a ref keeps writes out of the render pass.
  const [initialSim] = useState(() => initGestureState(initialCode));
  const sim = useRef(initialSim);

  const applyCamera = () => {
    const s = sim.current;
    camera.position.set(
      RADIUS * Math.cos(s.el) * Math.sin(s.az),
      RADIUS * Math.sin(s.el),
      RADIUS * Math.cos(s.el) * Math.cos(s.az),
    );
    camera.lookAt(0, 0, 0);
  };

  // Run one command: the impure work the reducer can only name (notify,
  // capture/release the pointer).
  const runCommand = useCallback((command: GestureCommand, el: HTMLCanvasElement) => {
    switch (command.kind) {
      case 'settle':
        onSettleRef.current(command.code, command.changed, command.viaTap, command.origin);
        break;
      case 'capturePointer':
        el.setPointerCapture?.(command.id);
        break;
      case 'releasePointer':
        el.releasePointerCapture?.(command.id);
        break;
    }
  }, []);

  // Fold an event into the sim, then run its commands. Stable across renders
  // (gl and runCommand are), so the listener effect subscribes once.
  const dispatch = useCallback(
    (event: GestureEvent) => {
      const el = gl.domElement;
      const { state, commands } = reduce(sim.current, event, cfg.current);
      sim.current = state;
      for (const command of commands) {
        runCommand(command, el);
      }
    },
    [gl, runCommand],
  );

  // Follow external selection: when the URL country changes (the a11y list, a
  // shared link) settle to it like a gesture would. A gesture's own settle
  // writes the URL first, so the reducer no-ops when it already matches.
  useEffect(() => {
    dispatch({ type: 'externalSelect', code: targetCode });
  }, [targetCode, dispatch]);

  useEffect(() => {
    const el = gl.domElement;

    const onDown = (e: PointerEvent) => {
      dispatch({
        type: 'pointerDown',
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        t: e.timeStamp,
      });
    };

    const onMove = (e: PointerEvent) => {
      dispatch({
        type: 'pointerMove',
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        t: e.timeStamp,
      });
    };

    const onUp = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      dispatch({
        type: 'pointerUp',
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        t: e.timeStamp,
        side: e.clientX - rect.left < rect.width / 2 ? 'left' : 'right',
      });
    };

    const onCancel = (e: PointerEvent) => {
      dispatch({ type: 'pointerCancel', id: e.pointerId, rng: Math.random });
    };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onCancel);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onCancel);
    };
  }, [gl, dispatch]);

  useFrame((_, dt) => {
    dispatch({ type: 'frame', dt, rng: Math.random });
    // Read mode suspends the sim (the frame event leaves az/el frozen); leave
    // the camera untouched too rather than re-pin it every hidden frame.
    if (cfg.current.readMode) return;
    applyCamera();
  });

  return null;
}
