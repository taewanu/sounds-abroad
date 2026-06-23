"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { COUNTRIES } from "@/lib/countries";
import { countryByCode, validateCountryCode } from "@/lib/country-code";

// Alphabetical so the list is predictable to scan and tab through; the globe's
// own COUNTRIES order is region-grouped for the gesture, not for reading.
const SORTED_COUNTRIES = COUNTRIES.toSorted((a, b) =>
  a.name.localeCompare(b.name),
);

// ISO 3166-1 alpha-2 → regional-indicator flag emoji. Decorative only (the
// country name carries the meaning); degrades to the letter pair on platforms
// without flag glyphs (e.g. Windows).
function flagEmoji(code: string): string {
  const offset = 0x1f1e6 - "a".charCodeAt(0);
  return String.fromCodePoint(
    code.charCodeAt(0) + offset,
    code.charCodeAt(1) + offset,
  );
}

// A keyboard- and screen-reader-first way to pick a country, equal to the globe
// gesture: a labeled landmark of named country buttons that write ?cc=. The
// globe follows ?cc=, so selecting here drives the globe too.
export function CountrySelector() {
  const searchParams = useSearchParams();
  const currentCode = validateCountryCode(searchParams.get("cc"));
  const current = currentCode ? countryByCode(currentCode) : null;

  const [open, setOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const navId = useId();

  const handleSelect = (code: string, name: string) => {
    // Same channel the gesture uses: replaceState keeps rapid hops out of
    // history. Stay open so the list is still there to keep exploring.
    window.history.replaceState(null, "", `?cc=${code}`);
    setAnnouncement(`Now showing ${name}`);
  };

  // Escape closes the list and returns focus to the toggle — the one focus move
  // a disclosure needs. (No focus trap; tab order alone walks in and out.)
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  // A pointer down anywhere outside dismisses the list, including grabbing the
  // globe to spin it.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <div
      ref={rootRef}
      className="fixed top-[max(env(safe-area-inset-top),16px)] left-4 z-40"
    >
      <button
        ref={toggleRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={navId}
        aria-label={
          current
            ? `Choose a country, currently showing ${current.name}`
            : "Choose a country"
        }
        className="bg-void/70 border-aurora/40 text-fg-1 text-small focus-visible:outline-aurora flex max-w-[60vw] items-center gap-2 rounded-full border px-3.5 py-2.5 font-medium backdrop-blur-md transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        {current ? (
          <span aria-hidden="true" className="text-base leading-none">
            {flagEmoji(current.code)}
          </span>
        ) : (
          <span aria-hidden="true" className="text-base leading-none">
            🌐
          </span>
        )}
        <span className="min-w-0 truncate">
          {current ? current.name : "Countries"}
        </span>
        <span
          aria-hidden="true"
          className={`text-fg-3 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        >
          ▾
        </span>
      </button>

      <nav
        id={navId}
        aria-label="Countries"
        hidden={!open}
        className="bg-night/95 border-fg-1/10 absolute top-[calc(100%+8px)] left-0 max-h-[60vh] w-[min(78vw,320px)] overflow-y-auto rounded-2xl border p-2 shadow-lg backdrop-blur-lg"
      >
        <ul className="flex flex-col gap-0.5">
          {SORTED_COUNTRIES.map((c) => (
            <li key={c.code}>
              <button
                type="button"
                onClick={() => handleSelect(c.code, c.name)}
                aria-current={c.code === currentCode ? "true" : undefined}
                className="text-fg-2 text-small hover:bg-orbit hover:text-fg-1 focus-visible:outline-aurora aria-[current=true]:bg-aurora/10 aria-[current=true]:text-fg-1 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2"
              >
                <span aria-hidden="true" className="text-base leading-none">
                  {flagEmoji(c.code)}
                </span>
                <span className="min-w-0 truncate">{c.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="sr-only" role="status" aria-live="polite">
        {announcement}
      </div>
    </div>
  );
}
