"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { ChartSheet, type SnapState } from "@/components/chart-sheet/sheet";
import { MiniPlayer } from "@/components/mini-player";
import { pickAutoplayTrack } from "@/lib/autoplay";
import type { ChartFile, Country } from "@/lib/chart-schema";
import {
  AudioStoreProvider,
  useAudioStore,
  useAudioStoreApi,
} from "@/providers/audio-store-provider";

function validateUrlCode(
  raw: string | null,
  countries: ChartFile["countries"],
): string | null {
  if (raw === null) return null;
  const lower = raw.toLowerCase();
  return countries[lower] ? lower : null;
}

export interface ChartScreenProps {
  charts: ChartFile;
  defaultCountryCode: string;
}

export function ChartScreen({ charts, defaultCountryCode }: ChartScreenProps) {
  const searchParams = useSearchParams();
  const rawCc = searchParams.get("cc");
  const countryCode =
    validateUrlCode(rawCc, charts.countries) ?? defaultCountryCode;

  // Write the resolved code into the URL when it isn't already there (bare `/`,
  // an invalid cc, or a non-canonical case). replaceState relabels the URL with
  // no navigation, so there's no refetch or flicker; Next keeps it in sync with
  // useSearchParams, so the globe reads the same code.
  useEffect(() => {
    if (rawCc === countryCode) return;
    window.history.replaceState(null, "", `?cc=${countryCode}`);
  }, [rawCc, countryCode]);

  return (
    <AudioStoreProvider>
      <ChartScreenInner
        country={charts.countries[countryCode]}
        countryCode={countryCode}
        charts={charts}
      />
    </AudioStoreProvider>
  );
}

function ChartScreenInner({
  country,
  countryCode,
  charts,
}: {
  country: Country;
  countryCode: string;
  charts: ChartFile;
}) {
  const [snap, setSnap] = useState<SnapState>("peek");
  const [scrollSignal, setScrollSignal] = useState(0);
  const hasCurrentTrack = useAudioStore((s) => s.currentTrack !== null);
  const currentTrackRank = useAudioStore((s) => s.currentTrack?.rank ?? null);
  const endedSignal = useAudioStore((s) => s.endedSignal);
  const audioStore = useAudioStoreApi();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable ||
          target.closest(
            "button, a[href], [role='button'], [role='menuitem'], [role='switch'], [role='checkbox']",
          ))
      ) {
        return;
      }
      const { currentTrack, toggle } = audioStore.getState();
      if (currentTrack === null) return;
      e.preventDefault();
      toggle(currentTrack);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [audioStore]);

  // Advance within the source country, not the visible one. Ref-gated so
  // only an actual ended event triggers advance, never a dep-only re-run.
  const prevEndedRef = useRef(endedSignal);
  useEffect(() => {
    if (endedSignal === prevEndedRef.current) return;
    prevEndedRef.current = endedSignal;
    if (endedSignal === 0) return;
    const { currentTrack, currentCountryCode, toggle } = audioStore.getState();
    if (currentTrack === null || currentCountryCode === null) return;
    const source = charts.countries[currentCountryCode];
    if (!source) return;
    const startIdx = source.tracks.findIndex(
      (t) => t.previewUrl === currentTrack.previewUrl,
    );
    if (startIdx === -1) return;
    for (let i = startIdx + 1; i < source.tracks.length; i++) {
      if (source.tracks[i].previewUrl !== null) {
        toggle(source.tracks[i], currentCountryCode);
        return;
      }
    }
  }, [endedSignal, audioStore, charts.countries]);

  // Autoplay the landed country's top track, but only into un-chosen silence:
  // idle or a track that ended on its own, never over a deliberate pause. Keyed
  // on the resolved countryCode, so it fires once per selection (globe fling/tap
  // or the a11y list — all write ?cc=). Playback state is read imperatively,
  // never a dep, so a track ending can't bounce the effect into replaying the
  // same country. The ref-guard, seeded to the mounted code, skips the initial /
  // shared-link load and survives StrictMode's double-invoke (a boolean didMount
  // flag would not).
  const prevAutoplayCcRef = useRef(countryCode);
  useEffect(() => {
    if (countryCode === prevAutoplayCcRef.current) return;
    prevAutoplayCcRef.current = countryCode;
    const { isPlaying, userPaused, toggle } = audioStore.getState();
    if (isPlaying || userPaused) {
      return;
    }
    const track = pickAutoplayTrack(country);
    if (track) {
      toggle(track, countryCode);
    }
  }, [countryCode, country, audioStore]);

  // Hidden sheet has no on-screen affordance; the next pointerdown anywhere
  // restores it.
  useEffect(() => {
    if (snap !== "hidden") return;
    const handler = () => setSnap("peek");
    window.addEventListener("pointerdown", handler, { once: true });
    return () => window.removeEventListener("pointerdown", handler);
  }, [snap]);

  const handleMiniTap = useCallback(() => {
    const source = audioStore.getState().currentCountryCode;
    if (source && source !== countryCode) {
      window.history.pushState(null, "", `?cc=${source}`);
    }
    setSnap((s) => (s === "hidden" || s === "closed" ? "peek" : s));
    setScrollSignal((n) => n + 1);
  }, [audioStore, countryCode]);

  return (
    <>
      <ChartSheet
        country={country}
        countryCode={countryCode}
        snap={snap}
        onSnapChange={setSnap}
        currentTrackRank={currentTrackRank}
        hasMiniPlayer={hasCurrentTrack}
        scrollSignal={scrollSignal}
      />
      <MiniPlayer onTap={handleMiniTap} />
    </>
  );
}
