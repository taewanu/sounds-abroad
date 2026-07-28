"use client";

import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { ChartSheet, type SnapState } from "@/components/chart-sheet/sheet";
import { useChartTracks } from "@/components/chart-sheet/use-chart-tracks";
import { EdgeChevrons } from "@/components/globe/edge-chevrons";
import { markUsed } from "@/components/globe/edge-hint-record";
import { EdgeTapHint } from "@/components/globe/edge-tap-hint";
import { SkipFlash } from "@/components/globe/skip-flash";
import { MiniPlayer } from "@/components/mini-player";
import { TourHost } from "@/components/tour/tour-host";
import { useTourGateOpen } from "@/components/tour/use-tour-gate-open";
import { findAdjacentPlayable } from "@/lib/adjacent-playable";
import { track as trackEvent } from "@/lib/analytics";
import {
  DEFAULT_CHART_MODE,
  songsChartRows,
  withPlaying,
  type ChartMode,
} from "@/lib/chart-mode";
import { isPlaylistRef, SONGS_CHART, type ChartRef } from "@/lib/chart-ref";
import type { ChartFile, ChartTrack, Country } from "@/lib/chart-schema";
import {
  CHART_PARAM,
  chartFromUrl,
  chartPath,
  countryCodeFromPath,
  countryPath,
  MODE_PARAM,
  modeFromUrl,
} from "@/lib/chart-url";
import {
  backRollTarget,
  landingTrack,
  planChartContinuation,
  planRoll,
  playlistsAfter,
  recordAfterSelection,
  type RollRecord,
  type SeatOf,
} from "@/lib/end-of-chart-roll";
import { pickShuffleCountry } from "@/lib/fairness-draw";
import {
  type GlobeChartState,
  globeChartStore,
  useGlobeChart,
} from "@/lib/globe-chart-store";
import { randomCountryCode } from "@/lib/landing-code";
import { setSkipHandlers } from "@/lib/media-session";
import { sameTrack } from "@/lib/track-identity";
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
  return Object.hasOwn(countries, lower) ? lower : null;
}

export interface ChartScreenProps {
  charts: ChartFile;
}

const emptySubscribe = () => () => {};
const serverLandingSnapshot = () => null;

// The landing roll must happen once per visit and only in the browser: rolling
// during prerender would bake one pick into the cached HTML for every visitor.
function createLandingSnapshot(codes: readonly string[]) {
  let rolled: string | null = null;
  return () => (rolled ??= randomCountryCode(codes));
}

export function ChartScreen({ charts }: ChartScreenProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rawCc = searchParams.get("cc");
  const rawChart = searchParams.get(CHART_PARAM);
  const rawMode = searchParams.get(MODE_PARAM);
  // An explicit ?cc= outranks the path segment: legacy links carry the query,
  // and honouring it keeps them landing where they point even when they reach
  // the client unredirected; the canonical writer then relabels to the path.
  const urlCode =
    validateUrlCode(rawCc, charts.countries) ??
    validateUrlCode(countryCodeFromPath(pathname), charts.countries);
  const [clientLandingSnapshot] = useState(() =>
    createLandingSnapshot(Object.keys(charts.countries)),
  );
  const landingCode = useSyncExternalStore(
    emptySubscribe,
    clientLandingSnapshot,
    serverLandingSnapshot,
  );
  const countryCode = urlCode ?? landingCode;

  // Publish the resolved country to the globe. The globe is a layout backdrop,
  // so its own URL hooks never see a client-side country change; this page
  // child does, and forwards it across the globe-chart store.
  useEffect(() => {
    if (countryCode === null) return;
    globeChartStore.getState().setSelectedCountry(countryCode);
  }, [countryCode]);

  if (countryCode === null) return null;

  const urlChart = chartFromUrl(rawChart, charts.countries[countryCode]);
  // What the URL would have to carry to already name this chart, so the
  // canonical check fails for a bare `/`, an invalid code, a leftover ?cc=
  // query, or a chart parameter this country does not carry.
  const urlChartParam = isPlaylistRef(urlChart) ? urlChart : null;
  const urlMode = modeFromUrl(rawMode);
  // What the URL would have to carry to already name this mode: the default is
  // left unspelled, the same way the songs chart is, so a bare path stays
  // canonical.
  const urlModeParam = urlMode === DEFAULT_CHART_MODE ? null : urlMode;

  return (
    <AudioStoreProvider>
      <ChartScreenInner
        country={charts.countries[countryCode]}
        countryCode={countryCode}
        charts={charts}
        urlChart={urlChart}
        urlMode={urlMode}
        urlIsCanonical={
          rawCc === null &&
          pathname === countryPath(countryCode) &&
          rawChart === urlChartParam &&
          rawMode === urlModeParam
        }
      />
    </AudioStoreProvider>
  );
}

function ChartScreenInner({
  country,
  countryCode,
  charts,
  urlChart,
  urlMode,
  urlIsCanonical,
}: {
  country: Country;
  countryCode: string;
  charts: ChartFile;
  urlChart: ChartRef;
  urlMode: ChartMode;
  urlIsCanonical: boolean;
}) {
  // Every country the payload carries, for the deeper rows to be read ahead
  // against. Memoized because it is an effect dependency and a fresh array each
  // render would restart the read.
  const chartedCodes = useMemo(
    () => Object.keys(charts.countries),
    [charts.countries],
  );
  // Which of the country's charts is open. Held here rather than in the sheet
  // because playback resolves against it too.
  const chart = useChartTracks(countryCode, country, urlChart, chartedCodes);

  // Keeps the URL naming what is on screen, so a chart can be linked to and a
  // reload restores one. replaceState relabels without navigating, so switching
  // charts costs no refetch. Written here rather than beside the country alone,
  // because a bare country-path write would drop the chart the listener is
  // reading.
  const chartRef = chart.ref;
  const chartFailed = chart.failed.has(urlChart);
  // Which question the songs chart is answering. Held here, not in the sheet,
  // because next and prev step against the same rows the screen shows: were the
  // list and the step walk to read different modes, a step could land on a row
  // the mode has filtered off screen. Seeded from the URL so a shared link or a
  // reload reads in the mode it names, then carried in the URL alongside the
  // chart so switching it neither navigates nor refetches the eager payload.
  const [mode, setMode] = useState<ChartMode>(urlMode);
  // What the URL already says. A ref, not the search params, because
  // replaceState leaves those stale, so after the first write they would keep
  // reporting the arrival query.
  const urlSays = useRef<string | null>(
    urlIsCanonical ? chartPath(countryCode, urlChart, urlMode) : null,
  );
  // Whether the chart the arrival URL named has been honoured. Until it is, the
  // displayed chart is still the songs chart, and writing would drop the very
  // chart being read.
  const arrivalHonoured = useRef(urlChart === SONGS_CHART);
  useEffect(() => {
    if (!arrivalHonoured.current) {
      if (chartRef !== urlChart && !chartFailed) return;
      arrivalHonoured.current = true;
    }
    const want = chartPath(countryCode, chartRef, mode);
    if (urlSays.current === want) return;
    urlSays.current = want;
    window.history.replaceState(null, "", want);
  }, [urlChart, chartFailed, chartRef, countryCode, mode]);
  const { peek: peekChart, read: readChart, open: openChart, peekTail } = chart;

  // Follows the mode on screen while the listener is looking at the playing
  // chart, and holds where they left it once they are not.
  const currentMode = useAudioStore((s) => s.currentMode);

  // The rows next and prev walk, assembled the same way the sheet lists them so
  // stepping reaches every row a listener can see and no row they cannot.
  // Located by country and chart together, the country being browsed need not be
  // the one playing. `current` is put back where the mode filtered it away.
  const tracksOf = useCallback(
    (
      code: string,
      ref: ChartRef,
      current: ChartTrack | null = null,
    ): ChartTrack[] | null => {
      if (isPlaylistRef(ref)) return peekChart(ref);
      const eager = charts.countries[code]?.tracks ?? null;
      if (eager === null) return null;
      // The reading playback was started in, not the one on screen: the two part
      // company the moment the listener browses elsewhere, and what they are
      // hearing should not be re-ordered by what they are looking at. Falls back
      // to the mode on screen before anything has played.
      return withPlaying(
        songsChartRows(currentMode ?? mode, eager, peekTail(code)),
        current,
      );
    },
    [charts.countries, peekChart, peekTail, currentMode, mode],
  );

  // What a country offers a roll in one mode. Curried on the mode because a
  // step reads the mode playback carries while a render reads the one on
  // screen, and the two part company whenever the listener browses elsewhere.
  const seatIn = useCallback(
    (asked: ChartMode): SeatOf =>
      (code) =>
        landingTrack(charts.countries[code], asked, peekTail(code)),
    [charts.countries, peekTail],
  );

  // What is on screen, for the deferred half of a continuation to read at the
  // moment it commits rather than at the moment it started.
  const onScreenRef = useRef({ countryCode, chartRef: chart.ref });
  useEffect(() => {
    onScreenRef.current = { countryCode, chartRef: chart.ref };
  }, [countryCode, chart.ref]);
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
  const currentChartRef = useAudioStore((s) => s.currentChartRef);

  const setCurrentMode = useAudioStore((s) => s.setCurrentMode);
  const viewingPlayingChart =
    currentCountryCode === countryCode && currentChartRef === chart.ref;
  useEffect(() => {
    if (viewingPlayingChart && currentMode !== mode) setCurrentMode(mode);
  }, [viewingPlayingChart, currentMode, mode, setCurrentMode]);
  const lastStep = useAudioStore((s) => s.lastStep);
  const hasCurrentTrack = currentTrack !== null;
  const currentTrackRank = currentTrack?.rank ?? null;
  const audioStore = useAudioStoreApi();

  // The mode a step stamps onto where it lands. From a ref because a step fires
  // long after the render that formed its handler.
  const modeRef = useRef(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  const heardIn = useCallback(
    (): ChartMode => audioStore.getState().currentMode ?? modeRef.current,
    [audioStore],
  );
  const tourGateOpen = useTourGateOpen();

  // Only while the globe is visible: at full the sheet covers it, so a cue there
  // would burn one of the hint's capped displays unseen. The tour gate is the
  // third term because playback can start from a row tap the tour never asked
  // for, which would otherwise teach the edge skip over the tour's own lesson.
  const edgeCuesActive = hasCurrentTrack && snap !== "full" && tourGateOpen;

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
    // Return to what is playing, whole: the country, the chart within it, and
    // the mode it is heard in. The URL is written only when the shown chart is
    // not already the playing one, so a tap while looking at it just reopens the
    // sheet without a spurious history entry. The scroll signal then reveals the
    // now-restored row.
    //
    // Each axis is restored where it lives rather than left to the URL to carry:
    // the country through the path the screen resolves from, the mode through
    // the state that holds it, and the chart through the sheet's own open. The
    // URL names a chart only on arrival, so a write this late reaches nothing.
    const { currentCountryCode, currentChartRef, currentMode } =
      audioStore.getState();
    if (currentCountryCode && currentChartRef) {
      const onPlayingChart =
        currentCountryCode === countryCode && currentChartRef === chartRef;
      if (!onPlayingChart) {
        window.history.pushState(
          null,
          "",
          chartPath(
            currentCountryCode,
            currentChartRef,
            currentMode ?? DEFAULT_CHART_MODE,
          ),
        );
      }
      if (currentMode) setMode(currentMode);
      // Only within the country already on screen. A tap that also moves country
      // lands on that country's songs chart, which the sheet resets to anyway,
      // and its playlists belong to a country this screen has not read yet.
      if (currentCountryCode === countryCode && currentChartRef !== chartRef) {
        openChart(currentChartRef);
      }
    }
    setSnap((s) => (s === "hidden" || s === "closed" ? "peek" : s));
    setScrollSignal((n) => n + 1);
  }, [audioStore, countryCode, chartRef, openChart]);

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

  // Roll out of a country into a fresh fairness-drawn one, the behaviour past
  // the last chart a country can offer.
  const rollOutOfCountry = useCallback(
    (
      fromCode: string,
      fromRef: ChartRef,
      fromTrack: ChartTrack,
    ): "rolled" | null => {
      const { toggle, signalStep } = audioStore.getState();
      const { visited, selectedCountry, setSelectedCountry } =
        globeChartStore.getState();
      const landing = planRoll(fromCode, seatIn(heardIn()), (exclude) =>
        pickShuffleCountry(visited, exclude),
      );
      if (!landing) return null;
      // Playback first (same task as the triggering gesture or ended event),
      // then the record, then the landing side effects. The record must be
      // queued before setSelectedCountry so the selection subscription reads
      // the landing as the roll's own, not a manual pick to clear on. Arm the
      // resurface guard before the selection so the roll's settle continues
      // playback without reopening a dismissed sheet, but only when the code
      // actually changes: a no-op selection produces no settle, so an armed
      // flag would linger and swallow a later unrelated resurface. A draw lands
      // on the country's songs chart, the one every country has and the one a
      // fresh country opens on.
      toggle(landing.track, {
        countryCode: landing.code,
        chartRef: SONGS_CHART,
        mode: heardIn(),
      });
      setRollRecord({
        originCountryCode: fromCode,
        originChartRef: fromRef,
        originTrack: fromTrack,
        rolledToCode: landing.code,
      });
      if (landing.code !== selectedCountry) suppressResurfaceRef.current = true;
      setSelectedCountry(landing.code);
      // Spelled here rather than left to the sync effect: this screen's country
      // comes from the URL, which the store selection alone does not touch, so
      // a landing would otherwise go unrecorded there. Routed through the
      // shared path so the chart is dropped rather than silently left behind,
      // while the mode carries, so a roll in only here lands in only here.
      window.history.replaceState(
        null,
        "",
        chartPath(landing.code, SONGS_CHART, heardIn()),
      );
      signalStep(1);
      flashSkip(1);
      trackEvent("next_executed", {
        country: fromCode,
        direction: "next",
        outcome: "rolled",
        from_rank: fromTrack.rank,
      });
      return "rolled";
    },
    [audioStore, flashSkip, heardIn, seatIn],
  );

  // Continue into the next chart of the same country, reading candidates in
  // published order until one can play. The read is why this is the one step
  // outcome that settles asynchronously; a country whose charts are all spent
  // falls through to the cross-country roll, so listening still never
  // dead-ends (ADR-0017).
  const continueWithinCountry = useCallback(
    async (fromCode: string, fromRef: ChartRef, fromTrack: ChartTrack) => {
      const refs = playlistsAfter(charts.countries[fromCode], fromRef);
      const landing = await planChartContinuation(refs, readChart);
      const { currentTrack, currentCountryCode, currentChartRef, toggle } =
        audioStore.getState();
      // The listener may have chosen something else while the read was in
      // flight; committing then would pull them out of it.
      if (
        !sameTrack(currentTrack, fromTrack) ||
        currentCountryCode !== fromCode ||
        currentChartRef !== fromRef
      ) {
        return;
      }
      if (!landing) {
        rollOutOfCountry(fromCode, fromRef, fromTrack);
        return;
      }
      toggle(landing.track, {
        countryCode: fromCode,
        chartRef: landing.ref,
        mode: heardIn(),
      });
      audioStore.getState().signalStep(1);
      flashSkip(1);
      trackEvent("next_executed", {
        country: fromCode,
        direction: "next",
        outcome: "continued",
        from_rank: fromTrack.rank,
      });

      // Bring the chart that took over on screen, but only for a listener who
      // was reading the one it continues from: anyone browsing elsewhere chose
      // that, and playback is theirs to hear, not to be moved by.
      const displayed = onScreenRef.current;
      if (
        displayed.countryCode === fromCode &&
        displayed.chartRef === fromRef
      ) {
        openChart(landing.ref);
      }
    },
    [
      audioStore,
      heardIn,
      charts.countries,
      readChart,
      openChart,
      flashSkip,
      rollOutOfCountry,
    ],
  );

  // Step within the chart being played, not the one on screen. Reads live audio
  // state so the callback survives track changes; it re-forms only when the
  // roll record turns over. Past the last playable, next continues into the
  // country's next chart and then into a fresh fairness-drawn country instead
  // of clamping; prev at a rolled-in chart's first playable rolls back to the
  // origin. Every next/prev surface routes through here, so all of them inherit
  // the roll.
  const step = useCallback(
    (
      dir: 1 | -1,
    ): "adjacent" | "rolled" | "backRolled" | "continued" | null => {
      const {
        currentTrack,
        currentCountryCode,
        currentChartRef,
        toggle,
        signalStep,
      } = audioStore.getState();
      if (
        currentTrack === null ||
        currentCountryCode === null ||
        currentChartRef === null
      ) {
        return null;
      }
      const playing = tracksOf(
        currentCountryCode,
        currentChartRef,
        currentTrack,
      );
      if (!playing) return null;
      const adj = findAdjacentPlayable(playing, currentTrack, dir);
      // Publish the direction after each real change, so every surface that
      // steps (buttons, swipe, media keys, edge-tap, auto-advance, and a roll)
      // feeds the one directional mini-player cue with no per-surface wiring.
      if (adj) {
        toggle(adj, {
          countryCode: currentCountryCode,
          chartRef: currentChartRef,
          mode: heardIn(),
        });
        signalStep(dir);
        trackEvent("next_executed", {
          country: currentCountryCode,
          direction: dir === 1 ? "next" : "prev",
          outcome: "adjacent",
          from_rank: currentTrack.rank,
        });
        return "adjacent";
      }
      if (dir === 1) {
        if (
          playlistsAfter(charts.countries[currentCountryCode], currentChartRef)
            .length > 0
        ) {
          void continueWithinCountry(
            currentCountryCode,
            currentChartRef,
            currentTrack,
          );
          return "continued";
        }
        return rollOutOfCountry(
          currentCountryCode,
          currentChartRef,
          currentTrack,
        );
      }
      const back = backRollTarget(
        rollRecord,
        currentTrack,
        currentCountryCode,
        currentChartRef,
        seatIn(heardIn()),
      );
      if (!back) return null;
      toggle(back.track, {
        countryCode: back.countryCode,
        chartRef: back.chartRef,
        mode: heardIn(),
      });
      setRollRecord(null);
      const store = globeChartStore.getState();
      if (back.countryCode !== store.selectedCountry)
        suppressResurfaceRef.current = true;
      store.setSelectedCountry(back.countryCode);
      window.history.replaceState(
        null,
        "",
        chartPath(back.countryCode, SONGS_CHART, heardIn()),
      );
      signalStep(dir);
      flashSkip(-1);
      trackEvent("next_executed", {
        country: currentCountryCode,
        direction: "prev",
        outcome: "back_rolled",
        from_rank: currentTrack.rank,
      });
      return "backRolled";
    },
    [
      audioStore,
      heardIn,
      charts.countries,
      rollRecord,
      flashSkip,
      tracksOf,
      seatIn,
      continueWithinCountry,
      rollOutOfCountry,
    ],
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
    if (
      currentTrack === null ||
      currentCountryCode === null ||
      currentChartRef === null
    ) {
      return false;
    }
    const playing = tracksOf(currentCountryCode, currentChartRef, currentTrack);
    if (playing && findAdjacentPlayable(playing, currentTrack, -1) !== null) {
      return true;
    }
    return (
      backRollTarget(
        rollRecord,
        currentTrack,
        currentCountryCode,
        currentChartRef,
        seatIn(currentMode ?? mode),
      ) !== null
    );
  }, [
    currentTrack,
    currentCountryCode,
    currentChartRef,
    rollRecord,
    tracksOf,
    seatIn,
    currentMode,
    mode,
  ]);
  // Next never dead-ends while listening: past the last playable the step
  // continues into the country's next chart and then into a fresh country, and
  // if even the bounded redraws fail it no-ops, so the button need not predict
  // the draw.
  const canNext = hasCurrentTrack && currentCountryCode !== null;

  // The plain adjacent tracks, for the mini-player's swipe rail preview. Null at
  // a chart end, where the step moves to another chart rather than a neighbour
  // (that target isn't previewed: it's a bigger context change on commit).
  const [prevTrack, nextTrack] = useMemo(() => {
    if (
      currentTrack === null ||
      currentCountryCode === null ||
      currentChartRef === null
    ) {
      return [null, null] as const;
    }
    const playing = tracksOf(currentCountryCode, currentChartRef, currentTrack);
    if (!playing) return [null, null] as const;
    return [
      findAdjacentPlayable(playing, currentTrack, -1),
      findAdjacentPlayable(playing, currentTrack, 1),
    ] as const;
  }, [currentTrack, currentCountryCode, currentChartRef, tracksOf]);

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

  // Mirror the mode to the globe for the same reason: the globe writes the
  // country URL on every settle and can't read the query back, so without this
  // a fling landing would relabel to the default mode and drop the one the
  // listener is reading in.
  useEffect(() => {
    globeChartStore.getState().setChartMode(mode);
  }, [mode]);

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
        chart={chart}
        countryCode={countryCode}
        mode={mode}
        onModeChange={setMode}
        snap={snap}
        onSnapChange={setSnap}
        currentTrackRank={currentTrackRank}
        currentCountryCode={currentCountryCode}
        currentChartRef={currentChartRef}
        hasMiniPlayer={hasCurrentTrack}
        scrollSignal={scrollSignal}
        stepSignal={lastStep?.nonce ?? 0}
        focusIntent={focusIntent}
      />
      <MiniPlayer
        onTap={handleMiniTap}
        onCommentary={handleCommentaryTap}
        onPrev={goPrev}
        onNext={goNext}
        canPrev={canPrev}
        canNext={canNext}
        prevTrack={prevTrack}
        nextTrack={nextTrack}
      />
      <EdgeTapHint active={edgeCuesActive} snap={snap} />
      <EdgeChevrons active={edgeCuesActive} sheetSnap={snap} />
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
