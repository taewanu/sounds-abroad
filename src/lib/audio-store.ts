import * as Sentry from "@sentry/nextjs";
import { createStore } from "zustand/vanilla";

import {
  type AudioEngine,
  type AudioEngineFactory,
  createBrowserAudioEngine,
} from "@/lib/audio-engine";
import type { Track } from "@/lib/chart-schema";
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
  currentTrack: Track | null;
  currentCountryCode: string | null;
  isPlaying: boolean;
  volume: number;
  lastError: AudioError | null;
  endedSignal: number;
  toggle: (track: Track, countryCode?: string) => void;
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
        set((state) => ({
          isPlaying: false,
          endedSignal: state.endedSignal + 1,
        }));
        setPlaybackState("none");
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
    function handlePlayRejection(track: Track, token: number) {
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
      };
    }

    return {
      currentTrack: null,
      currentCountryCode: null,
      isPlaying: false,
      volume: 1,
      lastError: null,
      endedSignal: 0,
      toggle: (track, countryCode) => {
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
