"use client";

import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { track as trackEvent } from "@/lib/analytics";
import { songsChartRows, type ChartMode } from "@/lib/chart-mode";
import { SONGS_CHART, type ChartRef } from "@/lib/chart-ref";
import type { Country } from "@/lib/chart-schema";
import { selectGem } from "@/lib/select-gem";

import { ChartRail } from "./chart-rail";
import { CHART_PANEL_ID, chartTabId } from "./chart-tabs";
import { firstCommentaryRank } from "./first-commentary-rank";
import { GemCard } from "./gem-card";
import { ModeEmpty } from "./mode-empty";
import { ModeTabs } from "./mode-tabs";
import { TailUnread } from "./tail-unread";
import { TrackRow } from "./track-row";
import type { ChartTracksState } from "./use-chart-tracks";

export type SnapState = "hidden" | "closed" | "peek" | "full";

export interface ChartSheetProps {
  country: Country;
  // Which of the country's charts is on screen, its tracks, and how to move
  // between them. Held above the sheet because playback reads it too.
  chart: ChartTracksState;
  countryCode: string;
  // Held above the sheet for the same reason the chart selection is: playback
  // resolves against it.
  mode: ChartMode;
  onModeChange: (mode: ChartMode) => void;
  snap: SnapState;
  onSnapChange: (snap: SnapState) => void;
  currentTrackRank?: number | null;
  // Where playback sits. Ranks repeat across a country's charts as well as
  // across countries, so a rank alone cannot say whether the playing row is one
  // of the rows on screen.
  currentCountryCode?: string | null;
  currentChartRef?: ChartRef | null;
  hasMiniPlayer?: boolean;
  scrollSignal?: number;
  // Bumped on a skip / auto-advance (the step nonce). The auto-scroll follows an
  // indirect track change (a skip reveals the new row) but not a direct tap (the
  // tapped item is already under the finger), so it gates on this, not the raw
  // rank change, which can't tell the two apart.
  stepSignal?: number;
  // An outside ask (the mini-player's commentary badge) to open a row's focused
  // reader card; the nonce marks each ask so dep-only re-runs never re-focus.
  focusIntent?: { rank: number; nonce: number } | null;
}

// translateY as a fraction of the sheet's own height at each snap: full shows
// all of it, hidden pushes it fully below the viewport, peek leaves ~35% (the
// height the <ol> max-height clamp is tuned to).
export const SNAP_Y_PCT: Record<SnapState, number> = {
  full: 0,
  peek: 65,
  closed: 90,
  hidden: 100,
};

const SNAP_Y: Record<SnapState, string> = {
  full: `${SNAP_Y_PCT.full}%`,
  peek: `${SNAP_Y_PCT.peek}%`,
  closed: `${SNAP_Y_PCT.closed}%`,
  hidden: `${SNAP_Y_PCT.hidden}%`,
};

// True when the whole row sits inside the list's scroll viewport. Reveal-only
// auto-scroll uses this to leave an already-visible now-playing row untouched;
// only a partially- or fully-clipped row is scrolled into view. The 1px
// tolerance absorbs sub-pixel layout rounding so a hair's clip doesn't read as
// hidden and trigger a needless scroll.
function isRowFullyVisible(row: HTMLElement, viewport: HTMLElement): boolean {
  const r = row.getBoundingClientRect();
  const v = viewport.getBoundingClientRect();
  return r.top >= v.top - 1 && r.bottom <= v.bottom + 1;
}

// How long the row arrival runs in total: its own length plus the stagger across
// the rows that carry one. Mirrors chart-rows-in and ENTER_STAGGER_ROWS.
export const ROWS_ENTER_TOTAL_MS = 320 + 7 * 20;

const SNAP_ORDER: SnapState[] = ["full", "peek", "closed", "hidden"];

// Pointer travel (px) before a press becomes a drag, so a tap on the handle
// toggles cleanly instead of flickering the list clamp.
const DRAG_THRESHOLD_PX = 4;
// Release velocity (px/ms) projected this many ms ahead to pick the settle
// target, so a fast flick carries past the nearest stop.
const VELOCITY_PROJECTION_MS = 120;
const SETTLE_TRANSITION = "transform 0.34s cubic-bezier(0.22, 1, 0.36, 1)";
// The sheet is bottom-anchored at full height, so its top edge sits at its
// translateY in px (0 at full). The badge is fixed near the screen top (see
// country-selector.tsx: ~16px inset, ~48px tall), so the recede is keyed to that
// edge in absolute px, not a fraction of sheet height. As the edge rises into the
// badge the cover ramps 0→1: it starts a lead ahead of contact and finishes just
// above the badge's bottom, so the badge is gone before the grip reaches it. Tune
// with the LEAD/DONE offsets; mirror BADGE_BOTTOM_PX if the badge is restyled.
const BADGE_BOTTOM_PX = 64; // 16px top inset + ~48px tall
const RECEDE_LEAD_PX = 76; // begin fading this far before the edge meets the badge
const RECEDE_DONE_PX = 16; // finish fading this far above the badge's bottom
const COVER_START_PX = BADGE_BOTTOM_PX + RECEDE_LEAD_PX; // edge here → fade starts
const COVER_END_PX = BADGE_BOTTOM_PX - RECEDE_DONE_PX; // edge here → badge gone
const COVER_TRANSITION = "--sheet-cover 0.34s cubic-bezier(0.22, 1, 0.36, 1)";

// Mirror MiniPlayer's rendered height: pt-3 (12px) + h-12 artwork (48px)
// + pb-[max(env(safe-area-inset-bottom), 12px)]. Tracks the iOS safe-area
// inset so the sheet doesn't sit under the mini on notched devices.
const MINI_PLAYER_GAP = "calc(60px + max(env(safe-area-inset-bottom), 12px))";

const SHEET_STYLE_WITH_MINI = {
  bottom: MINI_PLAYER_GAP,
  height: `calc(100dvh - ${MINI_PLAYER_GAP})`,
} as const;
const SHEET_STYLE_NO_MINI = { bottom: 0, height: "100dvh" } as const;

// Nearest snap to a projected position, restricted to one step from the current
// snap so every stop is a required waypoint (a drag can't skip peek).
function nextSnap(
  current: SnapState,
  projectedPx: number,
  height: number,
): SnapState {
  const projectedPct = (projectedPx / height) * 100;
  const idx = SNAP_ORDER.indexOf(current);
  const candidates: SnapState[] = [current];
  if (idx > 0) candidates.push(SNAP_ORDER[idx - 1]);
  if (idx < SNAP_ORDER.length - 1) candidates.push(SNAP_ORDER[idx + 1]);

  let nearest: SnapState = current;
  let minDist = Infinity;
  for (const s of candidates) {
    const dist = Math.abs(SNAP_Y_PCT[s] - projectedPct);
    if (dist < minDist) {
      minDist = dist;
      nearest = s;
    }
  }
  return nearest;
}

export function ChartSheet({
  country,
  chart,
  countryCode,
  mode,
  onModeChange,
  snap,
  onSnapChange,
  currentTrackRank = null,
  currentCountryCode = null,
  currentChartRef = null,
  hasMiniPlayer = false,
  scrollSignal = 0,
  stepSignal = 0,
  focusIntent = null,
}: ChartSheetProps) {
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const olRef = useRef<HTMLOListElement | null>(null);

  // Both derive from the songs chart rather than the open one. Commentary and
  // spread are carried by the songs axis alone, so a playlist chart has neither
  // a hinted row nor a gem to open with (ADR-0017).
  const onSongsChart = chart.ref === SONGS_CHART;
  const hasRail = (country.playlists?.length ?? 0) > 0;

  // Whether what is playing sits outside the list on screen. Only while it is
  // inside does the playing rank name a row here; from any other chart, that
  // rank belongs to an unrelated row of the one being browsed.
  const otherChartPlaying =
    currentCountryCode !== null &&
    (currentCountryCode !== countryCode || currentChartRef !== chart.ref);

  // A playlist chart travels whole and carries no spread, so it is shown as it
  // arrived; the songs chart is assembled to the mode.
  const onlyHereMode = onSongsChart && mode === "only_here";
  const rows = useMemo(
    () =>
      onSongsChart
        ? songsChartRows(mode, chart.tracks, chart.tail)
        : chart.tracks,
    [onSongsChart, mode, chart.tracks, chart.tail],
  );

  // Only the songs chart has more to fetch, and only until it has been fetched
  // or has failed. The sentinel sits under the last row, so reading that far is
  // the ask: no button, and nothing fetched for a listener who never gets there.
  const tailReachable =
    onSongsChart && chart.tail === null && !chart.tailFailed;
  const tailSentinelRef = useRef<HTMLLIElement | null>(null);
  const { readTail } = chart;
  useEffect(() => {
    const el = tailSentinelRef.current;
    if (!tailReachable || !el) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) readTail();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [tailReachable, readTail, chart.ref]);

  // Being in Only here is the ask for the rest of the chart. An effect, not the
  // switch handler: the mode outlives a country change, so arriving already in
  // it is the other way in. Idempotent per country.
  useEffect(() => {
    if (onlyHereMode && tailReachable) readTail();
  }, [onlyHereMode, tailReachable, readTail]);

  // Recorded on the ask, so a mode whose rows never landed still counts. Landing
  // on a country is already chart_opened, so only a switch is a mode opening.
  const openMode = useCallback(
    (next: ChartMode) => {
      if (next === mode) return;
      onModeChange(next);
      trackEvent("chart_mode_opened", { country: countryCode, mode: next });
    },
    [mode, onModeChange, countryCode],
  );

  // The chart stops short of what it names, the rest having failed to load.
  const tailUnread = onSongsChart && chart.tailFailed;

  // An answer, but only from a whole chart: still arriving, an empty list is one
  // still loading; never arrived, the mode would answer for a hundred rows from
  // the twenty five it has.
  const modeIsEmpty =
    onlyHereMode && rows.length === 0 && !chart.tailPending && !tailUnread;

  // Until the rest lands, Only here is filtering a quarter of the chart, which
  // would otherwise read as a short answer rather than an unfinished one.
  const waitingMode: ChartMode | null =
    onlyHereMode && chart.tailPending ? "only_here" : null;

  // Only a list that arrived at once moves: one the listener waited for has
  // already been announced by the wait, and a fresh country by the globe.
  const [shownList, setShownList] = useState({
    countryCode,
    chartRef: chart.ref,
    mode,
  });
  const [rowsEntering, setRowsEntering] = useState(false);
  // Remembered rather than read off `pending`, which is null again by the time
  // the chart it was waiting for is the one on screen.
  const [waitedForList, setWaitedForList] = useState(false);
  if (chart.pending !== null && !waitedForList) setWaitedForList(true);
  if (
    shownList.countryCode !== countryCode ||
    shownList.chartRef !== chart.ref ||
    shownList.mode !== mode
  ) {
    setRowsEntering(shownList.countryCode === countryCode && !waitedForList);
    setWaitedForList(false);
    setShownList({ countryCode, chartRef: chart.ref, mode });
  }

  // Cleared once the rows have landed: left on, it would animate the deeper rows
  // appended to this same list later, which arrive rather than replace.
  useEffect(() => {
    if (!rowsEntering) return;
    const id = setTimeout(() => setRowsEntering(false), ROWS_ENTER_TOTAL_MS);
    return () => clearTimeout(id);
  }, [rowsEntering]);

  // One key per chart, so the list remounts whenever the tracks under it are
  // replaced rather than reusing rows across two unrelated rankings. The mode is
  // part of it: the two modes are different rankings of the same chart, so the
  // list starts at the top rather than holding a scroll position measured
  // against rows that are no longer there.
  const listKey = `${countryCode}:${chart.ref}:${mode}`;

  // The one row eligible for the commentary discovery pulse, recomputed per
  // country (the <ol> remounts on country change, resetting the hint).
  const hintRank = useMemo(
    () => (onSongsChart ? firstCommentaryRank(country.tracks) : null),
    [onSongsChart, country.tracks],
  );

  // selectGem returns null for an empty track list (a failed crawl with no
  // carried-forward snapshot can leave a country with none, and that country
  // is reachable via both a random landing and a direct ?cc=); otherwise it
  // always returns a gem, so the card renders on every landing with real
  // tracks, regardless of how it was reached.
  //
  // Not in Only here: the gem's weakest tier stands in when nothing on the chart
  // is exclusive, which is the very claim that mode makes, so the two contradict
  // each other on screen. Loudest where it matters least, over an empty list.
  const gemSelection = useMemo(
    () => (onSongsChart && !onlyHereMode ? selectGem(country.tracks) : null),
    [onSongsChart, onlyHereMode, country.tracks],
  );

  // Lifts the peek max-height clamp so the list fills the sheet while it's
  // dragged; only toggled at gesture start/end, never per frame.
  const [isDragging, setIsDragging] = useState(false);

  // A commentary track opened into its focused reader card, by rank; one at a
  // time. A focus is scoped to the country it opened in: reset it when the
  // country changes by adjusting state during render, not in an effect (which
  // would flag a cascading setState, and would leave the focus latent to re-open
  // on return to that country).
  const [focusedRank, setFocusedRank] = useState<number | null>(null);
  const [focusCountry, setFocusCountry] = useState(countryCode);
  // Fire commentary_opened when a card opens or switches, never on close.
  const prevFocusedRef = useRef<number | null>(null);
  useEffect(() => {
    const prev = prevFocusedRef.current;
    prevFocusedRef.current = focusedRank;
    if (focusedRank !== null && focusedRank !== prev) {
      trackEvent("commentary_opened", {
        country: countryCode,
        rank: focusedRank,
      });
    }
  }, [focusedRank, countryCode]);
  if (focusCountry !== countryCode) {
    setFocusCountry(countryCode);
    setFocusedRank(null);
  }

  // Apply an outside focus ask during render (the same idiom as the reset
  // above, placed after it so it wins on the same pass). Ranks repeat across
  // charts, so the intent targets its row only once the chart on screen is the
  // playing one; until then the nonce stays unconsumed, so the focus lands
  // after the change instead of being clobbered by its reset. The badge
  // toggles: a fresh ask for the row already focused closes it, so the
  // mini-player button both opens and dismisses its own card.
  const [consumedFocusNonce, setConsumedFocusNonce] = useState(0);
  if (
    focusIntent !== null &&
    focusIntent.nonce !== consumedFocusNonce &&
    !otherChartPlaying
  ) {
    setConsumedFocusNonce(focusIntent.nonce);
    setFocusedRank((cur) =>
      cur === focusIntent.rank ? null : focusIntent.rank,
    );
  }

  // While a card is focused, dismiss on Escape or a click outside it (a dimmed
  // sibling, the sheet chrome). Dismiss on click, not pointerdown: closing
  // un-dims the siblings, so a pointerdown-close would restore a sibling's
  // pointer-events before its click landed and play that track. A dimmed
  // sibling stays pointer-events-none through the whole click, so the click
  // targets the list behind it (never the row's play button) and only closes.
  useEffect(() => {
    if (focusedRank === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFocusedRank(null);
    };
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      // Keep the card open for clicks on the card itself, and for anything
      // outside the sheet (the mini-player and other persistent chrome): only a
      // click on the sheet's own dimmed area collapses it.
      if (target?.closest("[data-commentary-card]")) return;
      if (!sheetRef.current?.contains(target)) return;
      setFocusedRank(null);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("click", onClick, true);
    };
  }, [focusedRank]);

  // The sheet's own long-lived Escape-collapse listener reads focus via this ref
  // (the file's ref-for-listeners pattern), so an Escape that closes a focused
  // card doesn't also collapse the sheet: the card takes the first Escape, a
  // second collapses.
  const focusedRankRef = useRef(focusedRank);
  useEffect(() => {
    focusedRankRef.current = focusedRank;
  }, [focusedRank]);

  // When a card opens, its grown height can push its own top above the list
  // viewport; nudge it into view so the read starts at the top, not mid-card.
  // Only when clipped (so an already-visible card never yanks); rAF so the grown
  // card is measured, not the pre-open row.
  useEffect(() => {
    if (focusedRank === null) return;
    const id = requestAnimationFrame(() => {
      const ol = olRef.current;
      const row = ol?.querySelector<HTMLElement>(
        `[data-rank="${focusedRank}"]`,
      );
      if (!ol || !row) return;
      // Leave a small margin above the card so its top outline clears the
      // viewport edge instead of sitting flush against it (clipped on mobile).
      const MARGIN_PX = 12;
      const delta =
        row.getBoundingClientRect().top -
        ol.getBoundingClientRect().top -
        MARGIN_PX;
      if (delta < 0) ol.scrollBy({ top: delta, behavior: "smooth" });
    });
    return () => cancelAnimationFrame(id);
  }, [focusedRank]);

  // Mount-time snap, captured once. React writes this transform for SSR/first
  // paint and never reconciles it (it never changes across renders), so the
  // gesture and settle code own the transform imperatively from then on. Do not
  // change this to SNAP_Y[snap]: a per-render value would make React rewrite the
  // transform every render and fight the imperative writes.
  const [initialSnap] = useState(snap);

  // Transient gesture state — refs so per-frame updates never re-render.
  const curYRef = useRef(0); // current translateY (px)
  const heightRef = useRef(0); // sheet height (px), cached at drag start
  const pressedRef = useRef(false); // pointer down, drag not yet committed
  const draggingRef = useRef(false); // committed to driving the sheet
  const canHandoffRef = useRef(false); // gesture began in the scrolled list at full
  const startYRef = useRef(0); // pointer Y at press (threshold reference)
  const baseYRef = useRef(0); // pointer Y at the drag baseline
  const baseTransRef = useRef(0); // translateY at the drag baseline
  const lastYRef = useRef(0);
  const lastTRef = useRef(0);
  const velRef = useRef(0);

  // Kept in refs so the long-lived touch listeners read the latest value
  // without re-attaching when the prop or snap changes.
  const snapRef = useRef(snap);
  useEffect(() => {
    snapRef.current = snap;
  }, [snap]);
  const onSnapChangeRef = useRef(onSnapChange);
  useEffect(() => {
    onSnapChangeRef.current = onSnapChange;
  }, [onSnapChange]);

  const sheetHeight = useCallback(
    () => sheetRef.current?.offsetHeight || window.innerHeight,
    [],
  );

  const snapPx = useCallback(
    (s: SnapState) => (SNAP_Y_PCT[s] / 100) * sheetHeight(),
    [sheetHeight],
  );

  // Drive the transform directly on the node. A MotionValue binding did not
  // apply reliably mid-gesture on iOS; direct writes also keep per-frame
  // updates off the React render path.
  const setY = useCallback((px: number) => {
    curYRef.current = px;
    const el = sheetRef.current;
    if (el) el.style.transform = `translateY(${px}px)`;
    const cover = Math.min(
      1,
      Math.max(0, (COVER_START_PX - px) / (COVER_START_PX - COVER_END_PX)),
    );
    document.documentElement.style.setProperty("--sheet-cover", String(cover));
  }, []);

  const applySnap = useCallback(
    (s: SnapState, animate: boolean) => {
      const el = sheetRef.current;
      if (el) el.style.transition = animate ? SETTLE_TRANSITION : "none";
      // Drive the badge's recede with the same easing, so it settles in step.
      document.documentElement.style.transition = animate
        ? COVER_TRANSITION
        : "none";
      setY(snapPx(s));
    },
    [setY, snapPx],
  );

  // Rubber-band past the top (full) and bottom (hidden) edges.
  const withResistance = useCallback((px: number) => {
    const max = heightRef.current;
    if (px < 0) return px * 0.25;
    if (px > max) return max + (px - max) * 0.25;
    return px;
  }, []);

  const trackVelocity = useCallback((y: number, t: number) => {
    const dt = t - lastTRef.current;
    if (dt > 0) velRef.current = (y - lastYRef.current) / dt;
    lastYRef.current = y;
    lastTRef.current = t;
  }, []);

  // Live translateY in px, read from the rendered matrix so grabbing the sheet
  // mid-settle picks up its actual position instead of the snap target.
  const readCurrentY = useCallback((): number => {
    const el = sheetRef.current;
    if (!el || typeof DOMMatrixReadOnly === "undefined") return curYRef.current;
    const transform = getComputedStyle(el).transform;
    if (!transform || transform === "none") return curYRef.current;
    try {
      return new DOMMatrixReadOnly(transform).m42;
    } catch {
      return curYRef.current;
    }
  }, []);

  const moveDrag = useCallback(
    (pointerY: number) => {
      setY(
        withResistance(baseTransRef.current + (pointerY - baseYRef.current)),
      );
    },
    [setY, withResistance],
  );

  // Commit a press to a drag: freeze the sheet at its current position and
  // baseline the gesture there so it tracks the finger without jumping.
  const commitDrag = useCallback(
    (pointerY: number) => {
      const el = sheetRef.current;
      const currentY = readCurrentY();
      if (el) el.style.transition = "none";
      // Drop the badge's settle easing too, so it tracks the finger 1:1.
      document.documentElement.style.transition = "none";
      heightRef.current = el?.offsetHeight || window.innerHeight;
      baseYRef.current = pointerY;
      baseTransRef.current = currentY;
      setY(currentY);
      pressedRef.current = false;
      draggingRef.current = true;
      document.body.style.userSelect = "none";
      setIsDragging(true);
    },
    [readCurrentY, setY],
  );

  const endDrag = useCallback(() => {
    const projected = curYRef.current + velRef.current * VELOCITY_PROJECTION_MS;
    const next = nextSnap(snapRef.current, projected, heightRef.current);
    draggingRef.current = false;
    canHandoffRef.current = false;
    setIsDragging(false);
    if (next === snapRef.current) {
      // Same snap: no prop change to drive the settle effect, so settle here.
      applySnap(next, true);
    } else {
      onSnapChangeRef.current(next);
    }
  }, [applySnap]);

  // Per-move handler shared by touch and pointer. Returns true once the gesture
  // owns the move so the caller can preventDefault.
  const dragMove = useCallback(
    (pointerY: number, t: number): boolean => {
      trackVelocity(pointerY, t);
      if (draggingRef.current) {
        moveDrag(pointerY);
        return true;
      }
      if (
        pressedRef.current &&
        Math.abs(pointerY - startYRef.current) > DRAG_THRESHOLD_PX
      ) {
        commitDrag(pointerY);
        moveDrag(pointerY);
        return true;
      }
      return false;
    },
    [trackVelocity, moveDrag, commitDrag],
  );

  // Arm a press as a drag candidate (threshold decides if it becomes a drag).
  const armPress = useCallback((pointerY: number, t: number) => {
    startYRef.current = pointerY;
    lastYRef.current = pointerY;
    lastTRef.current = t;
    velRef.current = 0;
    pressedRef.current = true;
    draggingRef.current = false;
  }, []);

  const endGesture = useCallback(() => {
    document.body.style.userSelect = "";
    pressedRef.current = false;
    if (draggingRef.current) endDrag();
    else canHandoffRef.current = false;
  }, [endDrag]);

  // Settle to the current snap on prop change, and re-place when the mini-player
  // toggles the sheet height. The first run jumps without a transition so the
  // server-rendered position isn't animated on mount.
  const didMountRef = useRef(false);
  useEffect(() => {
    applySnap(snap, didMountRef.current);
    didMountRef.current = true;
  }, [snap, hasMiniPlayer, applySnap]);

  // The badge reads --sheet-cover off :root and outlives this sheet (it's a
  // layout backdrop). Clear it on unmount so a route change at full doesn't
  // strand the badge hidden behind a sheet that's no longer there.
  useEffect(() => {
    return () => {
      const root = document.documentElement;
      root.style.removeProperty("transition");
      root.style.setProperty("--sheet-cover", "0");
    };
  }, []);

  // The transform is in px, so it does not track height changes on its own.
  // Re-place the sheet at its current snap when the viewport resizes (rotation,
  // desktop resize) so the partial snaps do not drift; no animation, and never
  // while a drag owns the transform.
  useEffect(() => {
    const onResize = () => {
      if (!draggingRef.current) applySnap(snapRef.current, false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [applySnap]);

  // Touch controller. Attached imperatively so touchmove is non-passive and can
  // preventDefault to interrupt native scroll at the hand-off boundary.
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;

    const onTouchStart = (e: TouchEvent) => {
      // Ignore secondary touches while a gesture is already active so a stray
      // second finger can't reset an in-progress drag.
      if (pressedRef.current || draggingRef.current || canHandoffRef.current) {
        return;
      }
      const t = e.touches[0];
      if (
        snapRef.current === "full" &&
        olRef.current?.contains(e.target as Node)
      ) {
        // Full + list: let it scroll natively and watch for the hand-off, so a
        // downward pull past the top continues into a sheet collapse.
        lastYRef.current = t.clientY;
        lastTRef.current = e.timeStamp;
        velRef.current = 0;
        canHandoffRef.current = true;
        pressedRef.current = false;
        draggingRef.current = false;
      } else {
        armPress(t.clientY, e.timeStamp);
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      const cy = e.touches[0].clientY;
      // Native scroll phase: take the gesture over once the list is at the top
      // and the finger is still pulling down. The baseline reset in commitDrag
      // keeps the sheet from jumping.
      if (canHandoffRef.current && !draggingRef.current) {
        const pullingDown = cy - lastYRef.current > 0;
        trackVelocity(cy, e.timeStamp);
        const list = olRef.current;
        if ((!list || list.scrollTop <= 0) && pullingDown) {
          commitDrag(cy);
          e.preventDefault();
          moveDrag(cy);
        }
        return;
      }
      if (dragMove(cy, e.timeStamp)) e.preventDefault();
    };

    const onTouchEnd = () => endGesture();

    sheet.addEventListener("touchstart", onTouchStart, { passive: true });
    sheet.addEventListener("touchmove", onTouchMove, { passive: false });
    sheet.addEventListener("touchend", onTouchEnd, { passive: true });
    sheet.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      sheet.removeEventListener("touchstart", onTouchStart);
      sheet.removeEventListener("touchmove", onTouchMove);
      sheet.removeEventListener("touchend", onTouchEnd);
      sheet.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [armPress, commitDrag, dragMove, moveDrag, trackVelocity, endGesture]);

  // Pointer (mouse/pen) drag for desktop, where there's no native touch scroll
  // to hand off from. Touch goes through the listeners above. Window listeners
  // with no pointer capture so a tap still fires the handle button's click.
  const handlePointerDown = useCallback(
    (e: ReactPointerEvent) => {
      if (e.pointerType === "touch") return;
      const list = olRef.current;
      if (list && list.contains(e.target as Node) && list.scrollTop > 0) return;
      armPress(e.clientY, e.timeStamp);
      const onMove = (ev: PointerEvent) => {
        dragMove(ev.clientY, ev.timeStamp);
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        endGesture();
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [armPress, dragMove, endGesture],
  );

  const handleToggle = useCallback(() => {
    onSnapChange(snap === "peek" ? "full" : "peek");
  }, [snap, onSnapChange]);

  // Escape collapses the sheet. Radix's Dialog owned this before; with the
  // Dialog removed for its focus trap we listen on the window directly.
  // Mirror the file's long-lived-listener pattern (see the touch controller):
  // read the latest values from refs so this attaches once, not per render.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Leave Escape to the focused control when it owns a field-local cancel
      // (a range/text input, a select), matching the Space handler's guard.
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      // A focused commentary card owns Escape first; only once it's closed does
      // Escape collapse the sheet.
      if (focusedRankRef.current !== null) return;
      // Already collapsed or off-screen: nothing to close, so skip the write.
      const currentSnap = snapRef.current;
      if (currentSnap === "closed" || currentSnap === "hidden") return;
      onSnapChangeRef.current("closed");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const prevSnapRef = useRef(snap);
  const prevSignalRef = useRef(scrollSignal);
  const prevStepRef = useRef(stepSignal);
  const prevListKeyRef = useRef(listKey);

  useEffect(() => {
    const wasMin =
      prevSnapRef.current === "closed" || prevSnapRef.current === "hidden";
    const signalChanged = prevSignalRef.current !== scrollSignal;
    const stepChanged = prevStepRef.current !== stepSignal;
    // The <ol> is keyed by the chart, so opening another one remounts the list.
    const listSwapped = prevListKeyRef.current !== listKey;
    prevSnapRef.current = snap;
    prevListKeyRef.current = listKey;
    // Hold both asks while another chart's track plays, the same idiom as the
    // focus nonce above: a reopen tap and an end-of-chart roll each land their
    // signal a render before the route swaps the displayed country over, so
    // consuming one now would leave the pass where the two finally align with
    // nothing to act on. The reopen would need a second tap; the roll would
    // never reveal the row it just landed on. Every other bail still consumes
    // both, so a held ask can't outlive its own change and fire against a later
    // unrelated one.
    if (!otherChartPlaying) {
      prevSignalRef.current = scrollSignal;
      prevStepRef.current = stepSignal;
    }
    if (snap === "closed" || snap === "hidden") return;
    if (currentTrackRank === null) return;
    // The now-playing row only exists in the displayed list when the playing
    // chart is the one on screen. Ranks repeat across charts, so a mismatch
    // would scroll to an unrelated row of the browsed chart; skip until they
    // align (null = nothing playing, already handled above).
    if (otherChartPlaying) return;
    // Reveal the row on an INDIRECT change only: a reopen (raised from
    // minimized, or a mini-player tap that bumped the signal), or a skip /
    // auto-advance (a bumped step). A DIRECT tap changes the rank with no step,
    // and the tapped item is already under the finger, so the list never yanks
    // to it (which for the gem hero would scroll to its ranked-row duplicate).
    // A step to an already-visible neighbour still holds, gated below.
    const isReopen = wasMin || signalChanged;
    if (!isReopen && !stepChanged) return;

    const scrollToRow = () => {
      const ol = olRef.current;
      const el = ol?.querySelector<HTMLElement>(
        `[data-rank="${currentTrackRank}"]`,
      );
      if (!ol || !el) return;
      if (!isReopen && isRowFullyVisible(el, ol)) return;
      el.scrollIntoView({
        block: snap === "peek" ? "start" : "center",
        behavior: "smooth",
      });
    };

    // One frame so the new snap/country is in the DOM before the query; a second
    // when the list remounted, because the row exists a frame before the
    // remounted list's layout settles and measuring there lands wrong.
    let frame = 0;
    const waitFrames = (n: number, run: () => void) => {
      frame = requestAnimationFrame(
        n <= 1 ? run : () => waitFrames(n - 1, run),
      );
    };
    waitFrames(listSwapped ? 2 : 1, scrollToRow);
    return () => cancelAnimationFrame(frame);
  }, [
    snap,
    currentTrackRank,
    scrollSignal,
    stepSignal,
    listKey,
    otherChartPlaying,
  ]);

  return (
    // Rendered in place, not portaled: the sheet must be in the server HTML so
    // it (not the client-only globe) anchors first paint. Safe because it is a
    // fixed overlay after the globe layer with no clipping or transformed
    // ancestor; restore a portal if an ancestor ever gains overflow/transform.
    // A plain <section>, not a Radix Dialog: Dialog's FocusScope hardcodes a Tab
    // loop with no opt-out even at modal={false}, trapping keyboard and SR-focus
    // users in the sheet. Only Dialog.Title semantics and Escape-to-collapse
    // were ever used; both are reproduced here without the trap.
    <section
      ref={sheetRef}
      aria-labelledby="chart-sheet-title"
      data-snap={snap}
      data-testid="chart-sheet"
      onPointerDown={handlePointerDown}
      style={{
        ...(hasMiniPlayer ? SHEET_STYLE_WITH_MINI : SHEET_STYLE_NO_MINI),
        transform: `translateY(${SNAP_Y[initialSnap]})`,
        willChange: "transform",
      }}
      // Explicit z so the edge-tap hint can bracket the sheet: its aurora rails
      // sit below (a lower z) and its sheet-dim above, reproducing the backdrop
      // sandwich. Stays under the mini-player (z-50) and the tour overlay (z-60).
      className="group bg-void text-fg-1 border-fg-1/10 shadow-sheet fixed inset-x-0 z-20 flex flex-col rounded-t-2xl border-t"
    >
      <div className="shrink-0 touch-none">
        <button
          type="button"
          onClick={handleToggle}
          aria-label={snap === "full" ? "Collapse chart" : "Expand chart"}
          className="bg-fg-1/15 rounded-pill mx-auto mt-3 mb-2 block h-1.5 w-12"
        />
        <h2 id="chart-sheet-title" className="text-h3 px-6 pb-3 font-semibold">
          {country.name}
        </h2>
        <ChartRail
          playlists={country.playlists ?? []}
          current={chart.ref}
          pending={chart.pending}
          failed={chart.failed}
          onOpen={chart.open}
        />
        {/* Only the songs axis bakes a spread per track, so only its chart can
            be read either way; a playlist chart has one reading and no toggle.
            Kept mounted while it leaves, a removed row having nothing to
            collapse; 1fr to 0fr because auto heights do not animate. */}
        <div
          data-gone={!onSongsChart || undefined}
          // Out of reach as well as out of sight while it is gone: it stays in
          // the tree only so it can collapse, and a control nobody can see must
          // not still answer to a keyboard or a screen reader.
          aria-hidden={!onSongsChart || undefined}
          inert={!onSongsChart}
          className="grid grid-rows-[1fr] transition-[grid-template-rows,opacity] duration-[280ms] ease-[var(--ease-spring)] data-[gone]:grid-rows-[0fr] data-[gone]:opacity-0 motion-reduce:transition-none"
        >
          <div className="min-h-0 overflow-hidden">
            <ModeTabs current={mode} waiting={waitingMode} onOpen={openMode} />
          </div>
        </div>
      </div>
      {/* Native list scroll is enabled only at full (touch-pan-y); at the
          partial snaps a vertical drag drives the sheet instead, so the list
          is touch-none there. */}
      <ol
        // The panel the chart rail's tabs control, but only where a rail
        // rendered: a panel with no tabs would announce a relationship that is
        // not there. Focusable so one tab off the rail lands on the list itself
        // rather than on whichever control happens to come first.
        id={hasRail ? CHART_PANEL_ID : undefined}
        role={hasRail ? "tabpanel" : undefined}
        aria-labelledby={hasRail ? chartTabId(chart.ref) : undefined}
        tabIndex={hasRail ? 0 : undefined}
        key={listKey}
        ref={olRef}
        data-peek={(snap === "peek" && !isDragging) || undefined}
        // The chart on screen is on its way out; its rows recede and breathe
        // until the next one lands, or until a failed read leaves it in place.
        data-chart-waiting={
          chart.pending !== null || waitingMode !== null || undefined
        }
        data-rows-entering={rowsEntering || undefined}
        // The peek clamp sizes the list against the header above it, so it has
        // to know whether a rail and a mode row are there. Declared rather than
        // measured: each is one row of fixed height.
        style={
          {
            "--rail-h": hasRail ? "46px" : "0px",
            "--mode-h": onSongsChart ? "45px" : "0px",
          } as CSSProperties
        }
        className="chart-list min-h-0 flex-1 touch-none overflow-y-auto overscroll-y-contain px-4 pb-12 [-ms-overflow-style:none] [scrollbar-width:none] group-data-[snap=full]:touch-pan-y data-[peek]:max-h-[calc(35dvh-62px-var(--rail-h)-var(--mode-h))] [&::-webkit-scrollbar]:hidden"
      >
        {gemSelection ? (
          <li
            // Recede with the rest of the list while a track's card is focused,
            // and go inert so its play / commentary can't fire (or, being outside
            // the card, collapse it) mid-read.
            className={
              focusedRank !== null
                ? "pointer-events-none opacity-40 transition-opacity duration-[240ms] ease-[var(--ease-out)] motion-reduce:transition-none"
                : undefined
            }
            inert={focusedRank !== null}
          >
            <GemCard
              track={gemSelection.gem}
              tier={gemSelection.tier}
              countryCode={countryCode}
            />
          </li>
        ) : null}
        {modeIsEmpty ? (
          <ModeEmpty
            countryName={country.name}
            playlist={country.playlists?.[0] ?? null}
            onOpenPlaylist={chart.open}
          />
        ) : null}
        {rows.map((track, index) => (
          <TrackRow
            key={track.rank}
            track={track}
            enterIndex={index}
            countryCode={countryCode}
            chartRef={chart.ref}
            mode={mode}
            isHintTarget={track.rank === hintRank}
            focused={track.rank === focusedRank}
            dimmed={focusedRank !== null && track.rank !== focusedRank}
            onOpenCommentary={() => setFocusedRank(track.rank)}
            onCloseCommentary={() => setFocusedRank(null)}
          />
        ))}
        {tailUnread ? <TailUnread /> : null}
        {tailReachable ? (
          <li
            ref={tailSentinelRef}
            data-testid="chart-tail-sentinel"
            aria-hidden
            className="h-px"
          />
        ) : null}
      </ol>
    </section>
  );
}
