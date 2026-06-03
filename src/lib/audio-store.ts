import * as Sentry from "@sentry/nextjs";
import { createStore } from "zustand/vanilla";

import type { Track } from "@/lib/chart-schema";
import { clearNowPlaying, setNowPlaying } from "@/lib/media-session";

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
      audio.addEventListener("play", () => set({ isPlaying: true }));
      audio.addEventListener("pause", () => set({ isPlaying: false }));
      audio.addEventListener("ended", () =>
        set((state) => ({
          isPlaying: false,
          endedSignal: state.endedSignal + 1,
        })),
      );
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
        if (
          state.currentTrack?.previewUrl === track.previewUrl &&
          state.isPlaying
        ) {
          a.pause();
          set({ isPlaying: false });
          return;
        }
        a.src = track.previewUrl ?? "";
        void a.play();
        setNowPlaying(track);
        const isNewTrack = state.currentTrack?.previewUrl !== track.previewUrl;
        if (isNewTrack) {
          set({
            currentTrack: track,
            currentCountryCode: countryCode ?? null,
            isPlaying: true,
            lastError: null,
          });
        } else {
          set({ currentTrack: track, isPlaying: true, lastError: null });
        }
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
