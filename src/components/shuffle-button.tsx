"use client";

import { useEffect, useState } from "react";

import { countryByCode } from "@/lib/country-code";
import { globeChartStore, useGlobeChart } from "@/lib/globe-chart-store";

// "Surprise me": flings the globe to a fair random country and lands it, the
// same end-state as a manual fling (no autoplay — selection alone, like every
// other pick). The globe owns the draw because the anti-repeat memory lives
// there, so this only signals across the globe-chart store.
export function ShuffleButton() {
  // Recede under the rising sheet on the same rule as the country badge: at full
  // the sheet covers this corner, so inert + pointer-events follow read mode.
  const readMode = useGlobeChart((s) => s.readMode);

  // Announce the landed country to screen readers, since the change is otherwise
  // only visual. Keyed on the globe's shuffleLanded signal (the shuffle's own
  // pick), so a selection from another source — a fling settling, a list pick —
  // can't be mistaken for this shuffle's result. Announcing from the store
  // subscription (not a selector + effect) keeps setState in an external-update
  // callback and off the button's render path.
  const [announcement, setAnnouncement] = useState("");
  useEffect(() => {
    return globeChartStore.subscribe((state, prev) => {
      if (state.shuffleLanded === prev.shuffleLanded) return;
      if (!state.shuffleLanded) return;
      const country = countryByCode(state.shuffleLanded.code);
      if (country) setAnnouncement(`Now showing ${country.name}`);
    });
  }, []);

  const onShuffle = () => {
    globeChartStore.getState().requestShuffle();
  };

  return (
    <>
      <div
        inert={readMode}
        style={{
          transform:
            "translateY(calc(var(--sheet-cover, 0) * var(--badge-recede-rise, -64px)))",
          opacity: "calc(1 - var(--sheet-cover, 0))",
        }}
        className={`fixed top-[max(env(safe-area-inset-top),16px)] right-4 z-40 ${
          readMode ? "pointer-events-none" : ""
        }`}
      >
        <button
          type="button"
          onClick={onShuffle}
          aria-label="Surprise me with a random country"
          className="bg-aurora/90 text-void focus-visible:outline-aurora flex items-center justify-center rounded-full p-3 shadow-lg transition-transform hover:scale-[1.03] focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
          >
            <path d="M16 3h5v5" />
            <path d="M4 20 21 3" />
            <path d="M21 16v5h-5" />
            <path d="m15 15 6 6" />
            <path d="M4 4l5 5" />
          </svg>
        </button>
      </div>

      <div className="sr-only" role="status" aria-live="polite">
        {announcement}
      </div>
    </>
  );
}
