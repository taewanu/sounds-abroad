"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";

import { ChartSheet, type SnapState } from "@/components/chart-sheet/sheet";
import { MiniPlayer } from "@/components/mini-player";
import { ChartPickStore } from "@/lib/chart-pick-store";
import type { ChartFile, Country } from "@/lib/chart-schema";
import { COUNTRIES } from "@/lib/countries";
import {
  AudioStoreProvider,
  useAudioStore,
  useAudioStoreApi,
} from "@/providers/audio-store-provider";

const ALL_CODES = COUNTRIES.map((c) => c.code);

function validateUrlCode(raw: string | null): string | null {
  if (raw === null) return null;
  const lower = raw.toLowerCase();
  return ALL_CODES.includes(lower) ? lower : null;
}

export interface ChartScreenProps {
  charts: ChartFile;
  rng?: () => number;
}

export function ChartScreen({ charts, rng = Math.random }: ChartScreenProps) {
  const searchParams = useSearchParams();
  const validUrlCc = validateUrlCode(searchParams.get("cc"));

  const store = useMemo(() => new ChartPickStore(), []);
  const pick = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );

  useEffect(() => {
    if (validUrlCc !== null) return;
    store.initIfNeeded(ALL_CODES, rng);
  }, [store, validUrlCc, rng]);

  const code = validUrlCc ?? pick.code ?? null;
  const country = code !== null ? (charts.countries[code] ?? null) : null;

  if (country === null) return null;

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
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
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
