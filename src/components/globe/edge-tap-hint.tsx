"use client";

import { useEffect, useRef, useState } from "react";

import { SkipBackIcon } from "@/components/icons/skip-back";
import { SkipForwardIcon } from "@/components/icons/skip-forward";

import { hasSeenEdgeTapHint, markEdgeTapHintSeen } from "./seen-edge-tap-hint";

const VISIBLE_MS = 2600;

const CHIP_CLASS =
  "bg-void/70 text-fg-1 ring-fg-1/10 shadow-sheet flex h-11 w-11 items-center justify-center rounded-full opacity-80 ring-1 backdrop-blur-sm";

// One-time cue that the globe's left/right edges skip tracks while a preview
// plays. Pointer-transparent so it never intercepts the taps it teaches; shown
// once per device, then the seen flag persists. Entrance uses the shared
// tour-fade, which globals.css already drops under prefers-reduced-motion.
export function EdgeTapHint({ active }: { active: boolean }) {
  // Read the persisted flag once at mount, before any track plays, so it holds
  // the true prior-session value. Visibility is then derived from `active`, not
  // toggled on synchronously in an effect; only the auto-dismiss flips state,
  // from the timer callback.
  const [seenAtMount] = useState(() => hasSeenEdgeTapHint());
  const [dismissed, setDismissed] = useState(false);
  const armedRef = useRef(false);

  const visible = active && !seenAtMount && !dismissed;

  useEffect(() => {
    if (!visible || armedRef.current) return;
    armedRef.current = true;
    markEdgeTapHintSeen();
    const id = window.setTimeout(() => setDismissed(true), VISIBLE_MS);
    return () => window.clearTimeout(id);
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      aria-hidden
      className="tour-fade pointer-events-none fixed inset-y-0 right-0 left-0 z-40 flex items-center justify-between px-3"
    >
      <span className={CHIP_CLASS}>
        <SkipBackIcon className="h-5 w-5" />
      </span>
      <span className={CHIP_CLASS}>
        <SkipForwardIcon className="h-5 w-5" />
      </span>
    </div>
  );
}
