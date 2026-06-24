"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { useStore } from "zustand";

import {
  type AudioState,
  type AudioStoreApi,
  createAudioStore,
} from "@/lib/audio-store";

export const AudioStoreContext = createContext<AudioStoreApi | undefined>(
  undefined,
);

export function AudioStoreProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => createAudioStore());

  // Mobile audio starts locked: the AudioContext only resumes from inside a
  // user gesture. Arm it on the first pointer interaction (a fling's own
  // pointerdown counts) so the play that fires when the fling settles, detached
  // from the gesture, lands in a running context and is audible.
  useEffect(() => {
    const handler = () => store.getState().unlock();
    window.addEventListener("pointerdown", handler, { once: true });
    return () => window.removeEventListener("pointerdown", handler);
  }, [store]);

  return (
    <AudioStoreContext.Provider value={store}>
      {children}
    </AudioStoreContext.Provider>
  );
}

export function useAudioStore<T>(selector: (state: AudioState) => T): T {
  const store = useContext(AudioStoreContext);
  if (!store) {
    throw new Error("useAudioStore must be used within AudioStoreProvider");
  }
  return useStore(store, selector);
}

export function useAudioStoreApi(): AudioStoreApi {
  const store = useContext(AudioStoreContext);
  if (!store) {
    throw new Error("useAudioStoreApi must be used within AudioStoreProvider");
  }
  return store;
}
