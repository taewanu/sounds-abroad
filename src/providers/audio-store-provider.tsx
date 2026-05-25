"use client";

import { createContext, type ReactNode, useContext, useState } from "react";
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
