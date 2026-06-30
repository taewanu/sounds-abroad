"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { ChartSheet, type SnapState } from "@/components/chart-sheet/sheet";
import { EdgeTapHint } from "@/components/globe/edge-tap-hint";
import { MiniPlayer } from "@/components/mini-player";
import { TourHost } from "@/components/tour/tour-host";
import { findAdjacentPlayable } from "@/lib/adjacent-playable";
import type { ChartFile, Country } from "@/lib/chart-schema";
import { globeChartStore, useGlobeChart } from "@/lib/globe-chart-store";
import { setSkipHandlers } from "@/lib/media-session";
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
  const currentTrack = useAudioStore((s) => s.currentTrack);
  const currentCountryCode = useAudioStore((s) => s.currentCountryCode);
  const hasCurrentTrack = currentTrack !== null;
  const currentTrackRank = currentTrack?.rank ?? null;
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
    const next = findAdjacentPlayable(
      source.tracks,
      currentTrack.previewUrl,
      1,
    );
    if (next) toggle(next, currentCountryCode);
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

  // Step within the source country, not the visible one. Reads live store state
  // so the callbacks stay stable across track changes.
  const step = useCallback(
    (dir: 1 | -1) => {
      const { currentTrack, currentCountryCode, toggle } =
        audioStore.getState();
      if (currentTrack === null || currentCountryCode === null) return;
      const source = charts.countries[currentCountryCode];
      if (!source) return;
      const adj = findAdjacentPlayable(
        source.tracks,
        currentTrack.previewUrl,
        dir,
      );
      if (adj) toggle(adj, currentCountryCode);
    },
    [audioStore, charts.countries],
  );
  const goPrev = useCallback(() => step(-1), [step]);
  const goNext = useCallback(() => step(1), [step]);

  const canPrev = useMemo(() => {
    if (currentTrack === null || currentCountryCode === null) return false;
    const source = charts.countries[currentCountryCode];
    return source
      ? findAdjacentPlayable(source.tracks, currentTrack.previewUrl, -1) !==
          null
      : false;
  }, [currentTrack, currentCountryCode, charts.countries]);
  const canNext = useMemo(() => {
    if (currentTrack === null || currentCountryCode === null) return false;
    const source = charts.countries[currentCountryCode];
    return source
      ? findAdjacentPlayable(source.tracks, currentTrack.previewUrl, 1) !== null
      : false;
  }, [currentTrack, currentCountryCode, charts.countries]);

  // Skip lives here, not in the audio store: routing prev/next needs the chart
  // data to find the adjacent playable track, which the store doesn't hold.
  useEffect(() => {
    setSkipHandlers({ previoustrack: goPrev, nexttrack: goNext });
  }, [goPrev, goNext]);

  // Mirror the listening gate and the shared step to the globe so an edge-tap on
  // the layout-backdrop globe routes through the same prev/next. The globe sits
  // outside the audio provider, so it can't read currentTrack or call step
  // directly; this crosses the same seam selectedCountry already does.
  useEffect(() => {
    globeChartStore.getState().setListening(hasCurrentTrack);
    return () => globeChartStore.getState().setListening(false);
  }, [hasCurrentTrack]);
  useEffect(() => {
    globeChartStore.getState().setSkip(step);
    return () => globeChartStore.getState().setSkip(() => {});
  }, [step]);

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
      <MiniPlayer
        onTap={handleMiniTap}
        onPrev={goPrev}
        onNext={goNext}
        canPrev={canPrev}
        canNext={canNext}
      />
      <EdgeTapHint active={hasCurrentTrack} />
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
