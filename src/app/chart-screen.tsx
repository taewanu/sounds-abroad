"use client";

import { useEffect, useState } from "react";
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
      <ChartScreenInner country={country} />
    </AudioStoreProvider>
  );
}

function ChartScreenInner({ country }: { country: Country }) {
  const [snap, setSnap] = useState<SnapState>("peek");
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

  useEffect(() => {
    if (endedSignal === 0) return;
    const { currentTrack, toggle } = audioStore.getState();
    if (currentTrack === null) return;
    const startIdx = country.tracks.findIndex(
      (t) => t.previewUrl === currentTrack.previewUrl,
    );
    if (startIdx === -1) return;
    for (let i = startIdx + 1; i < country.tracks.length; i++) {
      if (country.tracks[i].previewUrl !== null) {
        toggle(country.tracks[i]);
        return;
      }
    }
  }, [endedSignal, audioStore, country.tracks]);

  return (
    <>
      <ChartSheet
        country={country}
        snap={snap}
        onSnapChange={setSnap}
        currentTrackRank={currentTrackRank}
        canClose={hasCurrentTrack}
      />
      <MiniPlayer
        sheetClosed={snap === "closed"}
        onTap={() => setSnap("peek")}
      />
    </>
  );
}
