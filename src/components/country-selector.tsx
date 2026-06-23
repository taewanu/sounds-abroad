"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { COUNTRIES } from "@/lib/countries";
import { countryByCode, validateCountryCode } from "@/lib/country-code";

// Alphabetical so the grid is predictable to scan and tab through; the globe's
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
// globe follows ?cc=, so selecting here drives the globe too. The grid stays
// open after a pick so you can keep hopping between countries.
export function CountrySelector() {
  const searchParams = useSearchParams();
  const currentCode = validateCountryCode(searchParams.get("cc"));
  const current = currentCode ? countryByCode(currentCode) : null;

  const [open, setOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const toggleRef = useRef<HTMLButtonElement>(null);
  const navId = useId();

  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) toggleRef.current?.focus();
  };

  const handleSelect = (code: string, name: string) => {
    // Same channel the gesture uses: replaceState keeps rapid hops out of
    // history. Stay open so the grid is still there to keep exploring.
    window.history.replaceState(null, "", `?cc=${code}`);
    setAnnouncement(`Now showing ${name}`);
  };

  // Escape closes and returns focus to the toggle — the one focus move a
  // disclosure needs. (No focus trap; tab order alone walks in and out.)
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      {/* Scrim: dims the globe, is the big easy tap-to-dismiss target, and
          intercepts the pointer so a dismiss tap never spins the globe. */}
      {open ? (
        <div
          data-testid="country-scrim"
          aria-hidden="true"
          onClick={() => close(false)}
          className="fixed inset-0 z-30 bg-[rgba(5,6,8,0.5)] backdrop-blur-[1px]"
        />
      ) : null}

      <div className="fixed top-[max(env(safe-area-inset-top),16px)] left-4 z-40">
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
          <span aria-hidden="true" className="text-base leading-none">
            {current ? flagEmoji(current.code) : "🌐"}
          </span>
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
          className="bg-night/95 border-fg-1/10 absolute top-[calc(100%+8px)] left-0 flex max-h-[58vh] w-[min(86vw,360px)] flex-col overflow-hidden rounded-2xl border shadow-lg backdrop-blur-lg"
        >
          <div className="border-fg-1/10 flex flex-none items-center justify-between border-b px-3 py-2">
            <span className="text-fg-3 text-[10px] font-medium tracking-wider uppercase">
              Jump to a country
            </span>
            <button
              type="button"
              onClick={() => close(true)}
              aria-label="Close country list"
              className="bg-orbit text-fg-2 hover:text-fg-1 focus-visible:outline-aurora flex h-6 w-6 items-center justify-center rounded-full text-xs leading-none focus-visible:outline-2 focus-visible:outline-offset-1"
            >
              ✕
            </button>
          </div>
          <ul className="flex flex-wrap content-start gap-1.5 overflow-y-auto p-2.5">
            {SORTED_COUNTRIES.map((c) => (
              <li key={c.code}>
                <button
                  type="button"
                  onClick={() => handleSelect(c.code, c.name)}
                  aria-current={c.code === currentCode ? "true" : undefined}
                  className="border-fg-1/15 bg-dusk text-fg-2 hover:text-fg-1 hover:border-fg-3 focus-visible:outline-aurora aria-[current=true]:border-aurora aria-[current=true]:bg-aurora/10 aria-[current=true]:text-fg-1 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-1"
                >
                  <span aria-hidden="true" className="text-sm leading-none">
                    {flagEmoji(c.code)}
                  </span>
                  <span className="whitespace-nowrap">{c.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div className="sr-only" role="status" aria-live="polite">
        {announcement}
      </div>
    </>
  );
}
