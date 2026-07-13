"use client";

import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";

import { ChartSheet, type SnapState } from "@/components/chart-sheet/sheet";
import { EdgeChevrons } from "@/components/globe/edge-chevrons";
import { markUsed } from "@/components/globe/edge-hint-record";
import { EdgeTapHint } from "@/components/globe/edge-tap-hint";
import { SkipFlash } from "@/components/globe/skip-flash";
import { MiniPlayer } from "@/components/mini-player";
import { TourHost } from "@/components/tour/tour-host";
import { findAdjacentPlayable } from "@/lib/adjacent-playable";
import type { ChartFile, Country } from "@/lib/chart-schema";
import {
  backRollTarget,
  planRoll,
  recordAfterSelection,
  type RollRecord,
} from "@/lib/end-of-chart-roll";
import { pickShuffleCountry } from "@/lib/fairness-draw";
import {
  type GlobeChartState,
  globeChartStore,
  useGlobeChart,
} from "@/lib/globe-chart-store";
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
  const [focusIntent, setFocusIntent] = useState<{
    rank: number;
    nonce: number;
  } | null>(null);
  const [skipFlash, setSkipFlash] = useState<{
    dir: 1 | -1;
    nonce: number;
  } | null>(null);
  // One counter for every skip cue (edge-tap, roll, back-roll): two counters
  // could collide on a nonce and swallow a flash, since SkipFlash replays only
  // on a nonce it hasn't seen.
  const flashNonceRef = useRef(0);
  const flashSkip = useCallback((dir: 1 | -1) => {
    flashNonceRef.current += 1;
    setSkipFlash({ dir, nonce: flashNonceRef.current });
  }, []);
  // The pending back-roll origin, or null when prev keeps its end-of-chart
  // clamp. State, not a ref: it drives the prev button's enabled state.
  const [rollRecord, setRollRecord] = useState<RollRecord | null>(null);
  const settleSignal = useGlobeChart((s) => s.settleSignal);
  // The gesture-driven selection (the tour's beat-1 signal). Not the countryCode
  // prop: that resolves from useSearchParams, which a replaceState-only globe
  // landing never re-triggers, so it wouldn't move on a fling.
  const selectedCountry = useGlobeChart((s) => s.selectedCountry);
  const currentTrack = useAudioStore((s) => s.currentTrack);
  const currentCountryCode = useAudioStore((s) => s.currentCountryCode);
  const hasCurrentTrack = currentTrack !== null;
  const currentTrackRank = currentTrack?.rank ?? null;
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
  // dep-only re-run, and so the mount value never force-raises. An end-of-chart
  // roll arms suppressResurfaceRef first, so its own settle continues playback
  // without reopening a sheet the listener closed.
  const prevSettleRef = useRef(settleSignal);
  const suppressResurfaceRef = useRef(false);
  useEffect(() => {
    if (settleSignal === prevSettleRef.current) return;
    prevSettleRef.current = settleSignal;
    if (suppressResurfaceRef.current) {
      suppressResurfaceRef.current = false;
      return;
    }
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

  // The badge rides the same reopen path as a strip tap, then asks the sheet to
  // expand the now-playing row's commentary card. The rank is the playing
  // track's rank in its source country, which is the country the reopen lands
  // on.
  const handleCommentaryTap = useCallback(() => {
    const { currentTrack } = audioStore.getState();
    if (currentTrack === null) return;
    handleMiniTap();
    setFocusIntent((prev) => ({
      rank: currentTrack.rank,
      nonce: (prev?.nonce ?? 0) + 1,
    }));
  }, [audioStore, handleMiniTap]);

  // Step within the source country, not the visible one. Reads live audio
  // state so the callback survives track changes; it re-forms only when the
  // roll record turns over. Past the last playable, next rolls into a fresh
  // fairness-drawn country instead of clamping; prev at a rolled-in chart's
  // first playable rolls back to the origin. Every next/prev surface routes
  // through here, so all of them inherit the roll.
  const step = useCallback(
    (dir: 1 | -1): "adjacent" | "rolled" | "backRolled" | null => {
      const { currentTrack, currentCountryCode, toggle, signalStep } =
        audioStore.getState();
      if (currentTrack === null || currentCountryCode === null) return null;
      const source = charts.countries[currentCountryCode];
      if (!source) return null;
      const adj = findAdjacentPlayable(source.tracks, currentTrack, dir);
      // Publish the direction after each real change, so every surface that
      // steps (buttons, swipe, media keys, edge-tap, auto-advance, and a roll)
      // feeds the one directional mini-player cue with no per-surface wiring.
      if (adj) {
        toggle(adj, currentCountryCode);
        signalStep(dir);
        return "adjacent";
      }
      if (dir === 1) {
        const { visited, selectedCountry, setSelectedCountry } =
          globeChartStore.getState();
        const landing = planRoll(
          charts.countries,
          currentCountryCode,
          (exclude) => pickShuffleCountry(visited, exclude),
        );
        if (!landing) return null;
        // Playback first (same task as the triggering gesture or ended event),
        // then the record, then the landing side effects. The record must be
        // queued before setSelectedCountry so the selection subscription reads
        // the landing as the roll's own, not a manual pick to clear on. Arm the
        // resurface guard before the selection so the roll's settle continues
        // playback without reopening a dismissed sheet, but only when the code
        // actually changes: a no-op selection produces no settle, so an armed
        // flag would linger and swallow a later unrelated resurface.
        toggle(landing.track, landing.code);
        setRollRecord({
          originCountryCode: currentCountryCode,
          originTrack: currentTrack,
          rolledToCode: landing.code,
        });
        if (landing.code !== selectedCountry)
          suppressResurfaceRef.current = true;
        setSelectedCountry(landing.code);
        window.history.replaceState(null, "", `?cc=${landing.code}`);
        signalStep(dir);
        flashSkip(1);
        return "rolled";
      }
      const back = backRollTarget(
        rollRecord,
        charts.countries,
        currentTrack,
        currentCountryCode,
      );
      if (!back) return null;
      toggle(back.track, back.countryCode);
      setRollRecord(null);
      const store = globeChartStore.getState();
      if (back.countryCode !== store.selectedCountry)
        suppressResurfaceRef.current = true;
      store.setSelectedCountry(back.countryCode);
      window.history.replaceState(null, "", `?cc=${back.countryCode}`);
      signalStep(dir);
      flashSkip(-1);
      return "backRolled";
    },
    [audioStore, charts.countries, rollRecord, flashSkip],
  );
  const goPrev = useCallback(() => step(-1), [step]);
  const goNext = useCallback(() => step(1), [step]);

  // A track ending advances through the same step as the buttons, swipe, media
  // keys, and edge-tap, so every "next track" shares one adjacency rule and,
  // past the last playable, the same roll into a fresh country. A direct store
  // subscription (not a selector + effect) because the ended signal is an
  // external event to react to, not state this screen renders; the signal diff
  // means only an actual ended event advances, never a resubscribe. step is an
  // Effect Event so its dep churn (it re-forms on every rollRecord change) never
  // tears down and re-subscribes the store listener.
  const advanceOnEnded = useEffectEvent(() => step(1));
  useEffect(() => {
    return audioStore.subscribe((state, prev) => {
      if (state.endedSignal !== prev.endedSignal) advanceOnEnded();
    });
  }, [audioStore]);

  const canPrev = useMemo(() => {
    if (currentTrack === null || currentCountryCode === null) return false;
    const source = charts.countries[currentCountryCode];
    if (
      source &&
      findAdjacentPlayable(source.tracks, currentTrack, -1) !== null
    ) {
      return true;
    }
    return (
      backRollTarget(
        rollRecord,
        charts.countries,
        currentTrack,
        currentCountryCode,
      ) !== null
    );
  }, [currentTrack, currentCountryCode, charts.countries, rollRecord]);
  // Next never dead-ends while listening: past the last playable the step
  // rolls into a fresh country, and if even the bounded redraws fail it
  // no-ops, so the button need not predict the draw.
  const canNext = hasCurrentTrack && currentCountryCode !== null;

  // Skip lives here, not in the audio store: routing prev/next needs the chart
  // data to find the adjacent playable track, which the store doesn't hold.
  useEffect(() => {
    setSkipHandlers({ previoustrack: goPrev, nexttrack: goNext });
  }, [goPrev, goNext]);

  // Mirror the listening gate to the globe so an edge-tap on the layout-backdrop
  // globe knows a track is loaded and skips instead of selecting a country. The
  // globe sits outside the audio provider, so it can't read currentTrack; this
  // crosses the same seam selectedCountry already does.
  useEffect(() => {
    globeChartStore.getState().setListening(hasCurrentTrack);
    return () => globeChartStore.getState().setListening(false);
  }, [hasCurrentTrack]);

  // A globe edge-tap raises a skip-intent; the chart owns adjacency, so it runs
  // the shared step and flashes only on a real track change. Reacting inside the
  // change callback (the pattern for an external system) spares the screen a
  // re-render per skip. A roll or back-roll fires its own cue inside step, so
  // only a plain adjacent move flashes here. The same signal watches
  // selectedCountry: any selection that isn't the roll's own landing discards
  // the back-roll record, which is how a manual country pick clears it. An
  // Effect Event captures the latest step/flashSkip so the store listener
  // subscribes once for the screen's life, never re-subscribing on their churn.
  const onGlobeSignal = useEffectEvent(
    (state: GlobeChartState, prev: GlobeChartState) => {
      if (state.skipIntent.nonce !== prev.skipIntent.nonce) {
        // The gesture itself proves the edge skip is learned, so the teaching
        // affordances retire even when step clamps at the end of the chart,
        // matching the hint's own dismiss-on-gesture rule.
        markUsed();
        if (step(state.skipIntent.dir) === "adjacent") {
          flashSkip(state.skipIntent.dir);
        }
      }
      if (state.selectedCountry !== prev.selectedCountry) {
        setRollRecord((record) =>
          recordAfterSelection(record, state.selectedCountry),
        );
      }
    },
  );
  useEffect(() => globeChartStore.subscribe(onGlobeSignal), []);

  return (
    <>
      <ChartSheet
        country={country}
        countryCode={countryCode}
        snap={snap}
        onSnapChange={setSnap}
        currentTrackRank={currentTrackRank}
        currentCountryCode={currentCountryCode}
        hasMiniPlayer={hasCurrentTrack}
        scrollSignal={scrollSignal}
        focusIntent={focusIntent}
      />
      <MiniPlayer
        onTap={handleMiniTap}
        onCommentary={handleCommentaryTap}
        onPrev={goPrev}
        onNext={goNext}
        canPrev={canPrev}
        canNext={canNext}
      />
      {/* Only while the globe is visible: at full the sheet covers it, so
          showing the hint there would burn one of its capped displays unseen. */}
      <EdgeTapHint active={hasCurrentTrack && snap !== "full"} snap={snap} />
      <EdgeChevrons
        active={hasCurrentTrack && snap !== "full"}
        sheetSnap={snap}
      />
      <SkipFlash skip={skipFlash} sheetSnap={snap} />
      <TourHost
        snap={snap}
        currentTrackKey={currentTrack?.previewUrl ?? null}
        // Fall back to the resolved route code until the globe publishes its
        // first selection: a null baseline would make the tour read the store
        // populating itself as the user's first flick.
        selectedCode={selectedCountry ?? countryCode}
      />
    </>
  );
}
