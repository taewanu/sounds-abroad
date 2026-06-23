"use client";

import {
  type CSSProperties,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";

import { usePrefersReducedMotion } from "./use-prefers-reduced-motion";

// Scroll pacing: duration scales with the overflow distance so the title moves
// at a roughly constant speed no matter how far it has to travel.
const MS_PER_PX = 45;
const MIN_DURATION_MS = 4000;

export interface UseOverflowMarqueeOptions {
  // Restrict scrolling to the moments the spec allows (current track, hover).
  enabled: boolean;
  // Re-measure when the rendered text changes without a box-size change.
  text?: string;
}

export interface OverflowMarquee<T extends HTMLElement> {
  // Attach to the clipping viewport whose overflow drives the marquee.
  ref: RefObject<T | null>;
  active: boolean;
  // CSS custom properties for the keyframe; undefined while inactive.
  style: CSSProperties | undefined;
}

export function useOverflowMarquee<T extends HTMLElement = HTMLSpanElement>({
  enabled,
  text,
}: UseOverflowMarqueeOptions): OverflowMarquee<T> {
  const ref = useRef<T>(null);
  const [distance, setDistance] = useState(0);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) {
      setDistance(0);
      return;
    }
    const measure = () => {
      const overflow = el.scrollWidth - el.clientWidth;
      setDistance(overflow > 0 ? overflow : 0);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [enabled, text]);

  const active = enabled && distance > 0 && !reducedMotion;
  const style: CSSProperties | undefined = active
    ? ({
        "--marquee-distance": `${distance}px`,
        "--marquee-duration": `${Math.max(MIN_DURATION_MS, Math.round(distance * MS_PER_PX))}ms`,
      } as CSSProperties)
    : undefined;

  return { ref, active, style };
}
