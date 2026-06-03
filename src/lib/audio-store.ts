import * as Sentry from "@sentry/nextjs";
import { createStore } from "zustand/vanilla";

import type { Track } from "@/lib/chart-schema";
import {
  clearNowPlaying,
  setActionHandlers,
  setNowPlaying,
  setPlaybackState,
} from "@/lib/media-session";

export interface AudioElementLike {
  src: string;
  play(): Promise<void>;
  pause(): void;
  addEventListener(
    type: "ended" | "error" | "play" | "pause",
    listener: () => void,
  ): void;
  removeEventListener(
    type: "ended" | "error" | "play" | "pause",
    listener: () => void,
  ): void;
}

export type AudioElementFactory = () => AudioElementLike;

const defaultAudioFactory: AudioElementFactory = () => new Audio();

export interface AudioError {
  previewUrl: string | null;
}

export interface AudioState {
  currentTrack: Track | null;
  currentCountryCode: string | null;
  isPlaying: boolean;
  lastError: AudioError | null;
  endedSignal: number;
  toggle: (track: Track, countryCode?: string) => void;
  pause: () => void;
  stop: () => void;
}

export type AudioStoreApi = ReturnType<typeof createAudioStore>;

export function createAudioStore(
  factory: AudioElementFactory = defaultAudioFactory,
) {
  let audio: AudioElementLike | null = null;

  return createStore<AudioState>()((set, get) => {
    function getAudio(): AudioElementLike {
      if (audio) return audio;
      audio = factory();
      // Layer 1 (S5): sync store with browser-initiated play/pause.
      // Covers background-tab auto-pause, AirPods disconnect, media keys.
      // Each transition also mirrors to the OS so the now-playing UI tracks
      // live state (drives the Dynamic Island waveform), browser-driven or not.
      audio.addEventListener("play", () => {
        set({ isPlaying: true });
        setPlaybackState("playing");
      });
      audio.addEventListener("pause", () => {
        set({ isPlaying: false });
        setPlaybackState("paused");
      });
      audio.addEventListener("ended", () => {
        set((state) => ({
          isPlaying: false,
          endedSignal: state.endedSignal + 1,
        }));
        setPlaybackState("none");
      });
      audio.addEventListener("error", () => {
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
      return audio;
    }

    return {
      currentTrack: null,
      currentCountryCode: null,
      isPlaying: false,
      lastError: null,
      endedSignal: 0,
      toggle: (track, countryCode) => {
        const state = get();
        const a = getAudio();
        const isCurrent = state.currentTrack?.previewUrl === track.previewUrl;
        if (isCurrent && state.isPlaying) {
          a.pause();
          set({ isPlaying: false });
          return;
        }
        if (isCurrent) {
          // Resume in place: reassigning src restarts at 0, so leave it and
          // just play. Keeps the preview position and the stored countryCode.
          void a.play();
          set({ currentTrack: track, isPlaying: true, lastError: null });
          return;
        }
        a.src = track.previewUrl ?? "";
        void a.play();
        setNowPlaying(track);
        set({
          currentTrack: track,
          currentCountryCode: countryCode ?? null,
          isPlaying: true,
          lastError: null,
        });
      },
      pause: () => {
        // Pause without clearing currentTrack, used on deeplink handoff so the
        // mini player stays (resumable) and no `ended` fires (auto-advance halts).
        getAudio().pause();
        set({ isPlaying: false });
      },
      stop: () => {
        const a = getAudio();
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
