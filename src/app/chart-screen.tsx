"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { ChartSheet, type SnapState } from "@/components/chart-sheet/sheet";
import { MiniPlayer } from "@/components/mini-player";
import type { ChartFile, Country } from "@/lib/chart-schema";
import { pickUnvisited } from "@/lib/pick-unvisited";
import { markVisited, readVisited, resetVisited } from "@/lib/visited-storage";
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
}

export function ChartScreen({ charts }: ChartScreenProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const validUrlCc = validateUrlCode(searchParams.get("cc"), charts.countries);

  useEffect(() => {
    if (validUrlCc !== null) {
      return;
    }

    const visited = readVisited();
    const result = pickUnvisited({
      allCodes: Object.keys(charts.countries),
      visited,
      rng: Math.random,
    });
    if (result.didReset) {
      resetVisited();
    }

    markVisited(result.code);
    router.replace(`/?cc=${result.code}`);
  }, [validUrlCc, router, charts.countries]);

  const country = validUrlCc && charts.countries[validUrlCc];
  if (!country) {
    return null;
  }

  return (
    <AudioStoreProvider>
      <ChartScreenInner
        country={country}
        countryCode={validUrlCc}
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
  const router = useRouter();
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
      router.push(`/?cc=${source}`);
    }
    setSnap((s) => (s === "hidden" || s === "closed" ? "peek" : s));
    setScrollSignal((n) => n + 1);
  }, [audioStore, countryCode, router]);

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
