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

export interface AudioError {
  previewUrl: string | null;
}

export interface AudioState {
  currentTrack: Track | null;
  currentCountryCode: string | null;
  isPlaying: boolean;
  // True only after a deliberate user pause (chosen silence). Distinguishes
  // pause from idle/ended so autoplay-on-selection can respect a pause but
  // still fill the silence a country leaves when nothing was paused.
  userPaused: boolean;
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
          userPaused: false,
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

    return {
      currentTrack: null,
      currentCountryCode: null,
      isPlaying: false,
      userPaused: false,
      volume: 1,
      lastError: null,
      endedSignal: 0,
      toggle: (track, countryCode) => {
        const state = get();
        const a = getEngine();
        const isCurrent = state.currentTrack?.previewUrl === track.previewUrl;
        if (isCurrent && state.isPlaying) {
          a.pause();
          set({ isPlaying: false, userPaused: true });
          return;
        }
        if (isCurrent) {
          // Resume in place: reassigning src restarts at 0, so leave it and
          // just play. Keeps the preview position and the stored countryCode.
          void a.play();
          set({
            currentTrack: track,
            isPlaying: true,
            userPaused: false,
            lastError: null,
          });
          return;
        }
        a.src = track.previewUrl ?? "";
        void a.play();
        setNowPlaying(track);
        set({
          currentTrack: track,
          currentCountryCode: countryCode ?? null,
          isPlaying: true,
          userPaused: false,
          lastError: null,
        });
      },
      setVolume: (value) => {
        getEngine().setVolume(value);
        set({ volume: value });
      },
      pause: () => {
        // Pause without clearing currentTrack: the mini player stays (resumable)
        // and no `ended` fires (auto-advance halts). userPaused marks it chosen
        // silence so a later selection won't autoplay over it.
        getEngine().pause();
        set({ isPlaying: false, userPaused: true });
      },
      stop: () => {
        const a = getEngine();
        a.pause();
        clearNowPlaying();
        set({
          currentTrack: null,
          currentCountryCode: null,
          isPlaying: false,
          userPaused: false,
          lastError: null,
        });
      },
    };
  });
}
