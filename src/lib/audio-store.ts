import * as Sentry from "@sentry/nextjs";
import { createStore } from "zustand/vanilla";

import type { Track } from "@/lib/chart-schema";

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
  isPlaying: boolean;
  lastError: AudioError | null;
  toggle: (track: Track) => void;
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
      audio.addEventListener("ended", () => set({ isPlaying: false }));
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
      isPlaying: false,
      lastError: null,
      toggle: (track) => {
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
        set({ currentTrack: track, isPlaying: true, lastError: null });
      },
      stop: () => {
        const a = getAudio();
        a.pause();
        set({ currentTrack: null, isPlaying: false, lastError: null });
      },
    };
  });
}
