"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { track as trackEvent } from "@/lib/analytics";
import { SONGS_CHART, isPlaylistRef, type ChartRef } from "@/lib/chart-ref";
import type { ChartTrack, Country } from "@/lib/chart-schema";
import { PlaylistFileSchema } from "@/lib/chart-schema";

export interface ChartTracksState {
  /** The chart whose tracks are on screen. Never a chart still in flight. */
  ref: ChartRef;
  tracks: ChartTrack[];
  /** The chart the listener asked for, while it differs from the one shown. */
  pending: ChartRef | null;
  /** Charts whose track list would not load, so they stop offering themselves. */
  failed: ReadonlySet<ChartRef>;
  open: (next: ChartRef) => void;
  /** A playlist chart's tracks once they have been read, else null. */
  peek: (id: string) => ChartTrack[] | null;
  /** Reads a playlist chart's tracks, from the session cache where it can. */
  read: (id: string) => Promise<ChartTrack[]>;
}

async function readPlaylistTracks(id: string): Promise<ChartTrack[]> {
  const res = await fetch(`/api/playlist/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`playlist ${id}: ${res.status}`);
  return PlaylistFileSchema.parse(await res.json()).tracks;
}

/**
 * Holds which of a country's charts is on screen and fetches the rest on
 * demand.
 *
 * The songs chart is already in the payload, so opening it is synchronous;
 * a playlist chart costs one read, which browsing itself never pays
 * (ADR-0016). Track lists already read are kept for the session, so returning
 * to a chart is free.
 */
export function useChartTracks(
  countryCode: string,
  country: Country,
  /** The chart the URL asked for on arrival, opened once. */
  initialChart: ChartRef = SONGS_CHART,
): ChartTracksState {
  const [ref, setRef] = useState<ChartRef>(SONGS_CHART);
  const [pending, setPending] = useState<ChartRef | null>(
    initialChart === SONGS_CHART ? null : initialChart,
  );
  const [failed, setFailed] = useState<ReadonlySet<ChartRef>>(new Set());
  const [tracks, setTracks] = useState<ChartTrack[]>(country.tracks);

  // A new country opens on its songs chart: a playlist belongs to exactly one
  // country, so nothing about the old selection survives the move (ADR-0017).
  // Adjusted during render rather than in an effect, so the new country's chart
  // paints in the same pass instead of flashing the previous one.
  const [shownCountry, setShownCountry] = useState(countryCode);
  if (shownCountry !== countryCode) {
    setShownCountry(countryCode);
    setRef(SONGS_CHART);
    setTracks(country.tracks);
    setPending(null);
    setFailed(new Set());
  }

  // Session cache, keyed by playlist id. A ref rather than state: reading it
  // never needs to paint, and a Map in state would re-render every consumer on
  // each insert.
  const cache = useRef(new Map<string, ChartTrack[]>());

  // Which read is still wanted. Tapping a second chart before the first lands
  // must not let the first overwrite the list the listener has moved on from.
  // A token rather than an AbortController because an abandoned read still
  // fills the cache, so tapping back to it is instant instead of paying twice.
  const latestRequest = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const isStale = useCallback(
    (token: number) => !mounted.current || token !== latestRequest.current,
    [],
  );

  const peek = useCallback((id: string) => cache.current.get(id) ?? null, []);

  // The one read path, so a chart opened for display and one reached by
  // playback share both the fetch and the session cache.
  const read = useCallback(async (id: string) => {
    const cached = cache.current.get(id);
    if (cached) return cached;
    const fetched = await readPlaylistTracks(id);
    cache.current.set(id, fetched);
    return fetched;
  }, []);

  // Whether the axis is used at all, which is the evidence its daily crawl cost
  // is judged against. Reported on the ask rather than on the render, so a
  // chart the listener moved off before it landed still counts as asked for.
  const report = useCallback(
    (chart: ChartRef, loaded: boolean, cached: boolean) => {
      trackEvent("chart_opened", {
        country: countryCode,
        chart: isPlaylistRef(chart) ? "playlist" : "songs",
        loaded,
        cached,
      });
    },
    [countryCode],
  );

  // Reads a chart and takes it once it lands, unless the listener has since
  // asked for another.
  const commit = useCallback(
    (next: ChartRef, token: number) => {
      read(next)
        .then((fetched) => {
          report(next, true, false);
          if (isStale(token)) return;
          setPending(null);
          setRef(next);
          setTracks(fetched);
        })
        .catch(() => {
          report(next, false, false);
          if (isStale(token)) return;
          setPending(null);
          setFailed((prev) => new Set(prev).add(next));
        });
    },
    [isStale, read, report],
  );

  const open = useCallback(
    (next: ChartRef) => {
      if (next === ref) return;
      const token = ++latestRequest.current;

      if (next === SONGS_CHART) {
        report(SONGS_CHART, true, true);
        setPending(null);
        setRef(SONGS_CHART);
        setTracks(country.tracks);
        return;
      }

      const cached = cache.current.get(next);
      if (cached) {
        report(next, true, true);
        setPending(null);
        setRef(next);
        setTracks(cached);
        return;
      }

      setPending(next);
      commit(next, token);
    },
    [ref, country.tracks, commit, report],
  );

  // The chart a link named is already pending on the first render, seeded above,
  // so this only starts its read. Nothing is set synchronously here: commit
  // touches state only once the read has settled.
  const startedFromUrl = useRef(false);
  useEffect(() => {
    if (startedFromUrl.current) return;
    startedFromUrl.current = true;
    if (initialChart !== SONGS_CHART) {
      commit(initialChart, ++latestRequest.current);
    }
  }, [initialChart, commit]);

  return { ref, tracks, pending, failed, open, peek, read };
}
