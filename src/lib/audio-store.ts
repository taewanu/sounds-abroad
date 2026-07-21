import * as Sentry from "@sentry/nextjs";
import { createStore } from "zustand/vanilla";

import { type AnalyticsEvent, track as trackEvent } from "@/lib/analytics";
import {
  type AudioEngine,
  type AudioEngineFactory,
  createBrowserAudioEngine,
} from "@/lib/audio-engine";
import type { ChartTrack } from "@/lib/chart-schema";
import {
  clearNowPlaying,
  setActionHandlers,
  setNowPlaying,
  setPlaybackState,
} from "@/lib/media-session";
import { sameTrack } from "@/lib/track-identity";

export interface AudioError {
  previewUrl: string | null;
}

export interface AudioState {
  currentTrack: ChartTrack | null;
  currentCountryCode: string | null;
  isPlaying: boolean;
  volume: number;
  lastError: AudioError | null;
  endedSignal: number;
  // The most recent skip's direction, nonced so a repeated direction still
  // reads as a fresh change. Null until the first skip, so a mount or a
  // non-skip track change never carries a direction.
  lastStep: { dir: 1 | -1; nonce: number } | null;
  // `source` marks a fresh user selection (track row, gem card) so a
  // track_played event fires only for those, not for skips (which route through
  // step() with no source and are covered by next_executed) or pause/resume.
  toggle: (
    track: ChartTrack,
    countryCode?: string,
    source?: AnalyticsEvent["track_played"]["source"],
  ) => void;
  signalStep: (dir: 1 | -1) => void;
  setVolume: (value: number) => void;
  pause: () => void;
  stop: () => void;
}

export type AudioStoreApi = ReturnType<typeof createAudioStore>;

export function createAudioStore(
  factory: AudioEngineFactory = createBrowserAudioEngine,
) {
  let engine: AudioEngine | null = null;
  // Monotonic id per play() attempt. A rejection only owns the state if its
  // token still matches; a newer attempt (even one on a track that shares this
  // previewUrl, e.g. two preview-less tracks) supersedes it.
  let playToken = 0;

  return createStore<AudioState>()((set, get) => {
    function getEngine(): AudioEngine {
      if (engine) return engine;
      engine = factory();
      // Layer 1: sync store with browser-initiated play/pause.
      // Covers background-tab auto-pause, AirPods disconnect, media keys.
      // Each transition also mirrors to the OS so the now-playing UI tracks
      // live state (drives the Dynamic Island waveform), browser-driven or not.
      engine.addEventListener("play", () => {
        set({ isPlaying: true });
        setPlaybackState("playing");
      });
      engine.addEventListener("pause", () => {
        set({ isPlaying: false });
        setPlaybackState("paused");
      });
      engine.addEventListener("ended", () => {
        const finished = get().currentTrack;
        set((state) => ({
          isPlaying: false,
          endedSignal: state.endedSignal + 1,
        }));
        setPlaybackState("none");
        if (finished) {
          trackEvent("preview_completed", {
            country: get().currentCountryCode ?? "unknown",
            rank: finished.rank,
          });
        }
      });
      engine.addEventListener("error", () => {
        const previewUrl = get().currentTrack?.previewUrl ?? null;
        set({ isPlaying: false, lastError: { previewUrl } });
        Sentry.addBreadcrumb({
          category: "audio",
          level: "warning",
          message: "preview audio error",
          data: { previewUrl },
        });
        trackEvent("preview_playback_failed", {
          country: get().currentCountryCode ?? "unknown",
          reason: previewUrl ? "load_error" : "empty_preview_url",
        });
      });
      // OS transport buttons (lock screen / Dynamic Island) drive the same
      // store actions as the in-app controls.
      setActionHandlers({
        play: () => {
          const track = get().currentTrack;
          if (track) get().toggle(track);
        },
        pause: () => get().pause(),
      });
      return engine;
    }

    // play() rejects when playback can't start. AbortError means a newer action
    // interrupted this play (rapid track-switch); it's benign, and the newer
    // action owns the resulting state, so leave state untouched. A stale
    // rejection (the track was already switched) must not clobber the live
    // track either. Otherwise mirror the engine's error listener: clear
    // isPlaying, record lastError, breadcrumb, and tell the OS it's paused.
    function handlePlayRejection(track: ChartTrack, token: number) {
      return (error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        if (token !== playToken) return;
        const previewUrl = track.previewUrl ?? null;
        set({ isPlaying: false, lastError: { previewUrl } });
        setPlaybackState("paused");
        Sentry.addBreadcrumb({
          category: "audio",
          level: "warning",
          message: "preview audio play rejected",
          data: { previewUrl },
        });
        trackEvent("preview_playback_failed", {
          country: get().currentCountryCode ?? "unknown",
          reason: previewUrl ? "play_rejected" : "empty_preview_url",
          errorName: error instanceof DOMException ? error.name : undefined,
        });
      };
    }

    return {
      currentTrack: null,
      currentCountryCode: null,
      isPlaying: false,
      volume: 1,
      lastError: null,
      endedSignal: 0,
      lastStep: null,
      signalStep: (dir) =>
        set((state) => ({
          lastStep: { dir, nonce: (state.lastStep?.nonce ?? 0) + 1 },
        })),
      toggle: (track, countryCode, source) => {
        const state = get();
        const a = getEngine();
        // Same song in a different country is a context switch, not a resume:
        // identity is the stable song key, and the country must match too. An
        // omitted countryCode (OS transport resume) keeps the stored context.
        const isCurrent =
          sameTrack(state.currentTrack, track) &&
          (countryCode === undefined ||
            state.currentCountryCode === countryCode);
        if (isCurrent && state.isPlaying) {
          a.pause();
          set({ isPlaying: false });
          trackEvent("preview_paused", {
            country: state.currentCountryCode ?? "unknown",
            rank: track.rank,
          });
          return;
        }
        if (isCurrent) {
          // Resume in place: reassigning src restarts at 0, so leave it and
          // just play. Keeps the preview position and the stored countryCode.
          void a.play().catch(handlePlayRejection(track, ++playToken));
          set({ currentTrack: track, isPlaying: true, lastError: null });
          return;
        }
        a.src = track.previewUrl ?? "";
        void a.play().catch(handlePlayRejection(track, ++playToken));
        setNowPlaying(track);
        set({
          currentTrack: track,
          currentCountryCode: countryCode ?? null,
          isPlaying: true,
          lastError: null,
        });
        if (source) {
          trackEvent("track_played", {
            country: countryCode ?? "unknown",
            source,
          });
        }
      },
      setVolume: (value) => {
        getEngine().setVolume(value);
        set({ volume: value });
      },
      pause: () => {
        // Pause without clearing currentTrack, used on deeplink handoff so the
        // mini player stays (resumable) and no `ended` fires (auto-advance halts).
        getEngine().pause();
        set({ isPlaying: false });
      },
      stop: () => {
        const a = getEngine();
        a.pause();
        clearNowPlaying();
        set({
          currentTrack: null,
          currentCountryCode: null,
          isPlaying: false,
          lastError: null,
        });
      },
    };
  });
}
