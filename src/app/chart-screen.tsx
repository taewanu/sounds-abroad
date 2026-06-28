"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { ChartSheet, type SnapState } from "@/components/chart-sheet/sheet";
import { MiniPlayer } from "@/components/mini-player";
import { TourHost } from "@/components/tour/tour-host";
import type { ChartFile, Country } from "@/lib/chart-schema";
import { globeChartStore, useGlobeChart } from "@/lib/globe-chart-store";
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
  // no navigation, so there's no refetch or flicker.
  useEffect(() => {
    if (rawCc === countryCode) return;
    window.history.replaceState(null, "", `?cc=${countryCode}`);
  }, [rawCc, countryCode]);

  // Publish the resolved country to the globe. The globe is a layout backdrop,
  // so its own useSearchParams never sees a client-side ?cc= change; this page
  // child does, and forwards it across the globe-chart store.
  useEffect(() => {
    globeChartStore.getState().setSelectedCountry(countryCode);
  }, [countryCode]);

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
  const settleSignal = useGlobeChart((s) => s.settleSignal);
  // The gesture-driven selection (the tour's beat-1 signal). Not the countryCode
  // prop: that resolves from useSearchParams, which a replaceState-only globe
  // landing never re-triggers, so it wouldn't move on a fling.
  const selectedCountry = useGlobeChart((s) => s.selectedCountry);
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

  // full = read mode: tell the globe to suspend its spin so a leftover fling
  // can't settle a new country while the chart covers it.
  useEffect(() => {
    globeChartStore.getState().setReadMode(snap === "full");
  }, [snap]);

  // Release read mode if the chart unmounts (e.g. a route change) while at full,
  // so the globe in the layout isn't left suspended with no sheet over it.
  useEffect(() => {
    return () => globeChartStore.getState().setReadMode(false);
  }, []);

  // A globe landing resurfaces the result: raise a dismissed sheet to peek.
  // Ref-gated so only an actual settle (a bumped signal) triggers it, never a
  // dep-only re-run, and so the mount value never force-raises.
  const prevSettleRef = useRef(settleSignal);
  useEffect(() => {
    if (settleSignal === prevSettleRef.current) return;
    prevSettleRef.current = settleSignal;
    setSnap((s) => (s === "hidden" || s === "closed" ? "peek" : s));
  }, [settleSignal]);

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
      <TourHost
        snap={snap}
        hasCurrentTrack={hasCurrentTrack}
        // Fall back to the resolved route code until the globe publishes its
        // first selection: a null baseline would make the tour read the store
        // populating itself as the user's first flick.
        selectedCode={selectedCountry ?? countryCode}
      />
    </>
  );
}
