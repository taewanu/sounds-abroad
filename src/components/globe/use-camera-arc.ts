"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useThree } from "@react-three/fiber";

import { cameraArcPath } from "@/lib/camera-arc";
import { COUNTRIES } from "@/lib/countries";
import { easeSpring } from "@/lib/ease-spring";

const DUR_GLOBE_MS = 900;
const RISE_FACTOR = 0.15;

const COUNTRY_BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));

class ArcStore {
  private listeners = new Set<() => void>();
  private active = false;

  subscribe = (cb: () => void) => {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  };

  getSnapshot = () => this.active;

  set = (value: boolean) => {
    if (this.active === value) return;
    this.active = value;
    this.listeners.forEach((l) => l());
  };
}

export interface UseCameraArcOptions {
  targetCode: string | null;
}

interface ControlsLike {
  update?: () => void;
}

export function useCameraArc({ targetCode }: UseCameraArcOptions) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as ControlsLike | null;
  const [store] = useState(() => new ArcStore());

  const isAnimating = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );

  useEffect(() => {
    if (!targetCode) return;
    const country = COUNTRY_BY_CODE.get(targetCode);
    if (!country) return;

    const from = camera.position.clone();
    const baseRadius = from.length();
    const path = cameraArcPath({
      from,
      toLatLon: { lat: country.lat, lon: country.lon },
      baseRadius,
      riseFactor: RISE_FACTOR,
    });

    store.set(true);
    const start = performance.now();
    let rafId = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DUR_GLOBE_MS);
      const eased = easeSpring(t);
      camera.position.copy(path(eased));
      camera.lookAt(0, 0, 0);
      if (t < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        controls?.update?.();
        store.set(false);
      }
    };
    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      store.set(false);
    };
  }, [targetCode, camera, controls, store]);

  return { isAnimating };
}
