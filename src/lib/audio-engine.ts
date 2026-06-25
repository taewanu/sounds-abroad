export type AudioEventType = "ended" | "error" | "play" | "pause";

/**
 * The audio output the store drives. A seam: the store stays pure and
 * testable while the real implementation owns the browser Web Audio graph.
 */
export interface AudioEngine {
  src: string;
  play(): Promise<void>;
  pause(): void;
  unlock(): Promise<void>;
  setVolume(value: number): void;
  addEventListener(type: AudioEventType, listener: () => void): void;
  removeEventListener(type: AudioEventType, listener: () => void): void;
}

export type AudioEngineFactory = () => AudioEngine;

/**
 * Volume drives a Web Audio GainNode, not HTMLMediaElement.volume: iOS WebKit
 * treats element volume as read-only (hardware-only), so routing the element
 * through an AudioContext is the only cross-platform path. The graph is
 * element -> source -> gain -> destination; later taps (an analyser) splice
 * into the same chain.
 */
export function createBrowserAudioEngine(): AudioEngine {
  const element = new Audio();
  // Anonymous CORS lets the cross-origin preview flow through Web Audio without
  // a silent-output penalty; it must be set before src.
  element.crossOrigin = "anonymous";

  const context = new AudioContext();
  // createMediaElementSource is once-per-element; tying it to this element here
  // means a track switch (reassigning element.src) never re-wires the graph.
  const source = context.createMediaElementSource(element);
  const gain = context.createGain();
  source.connect(gain).connect(context.destination);

  return {
    get src() {
      return element.src;
    },
    set src(value: string) {
      element.src = value;
    },
    play: async () => {
      // Once routed through the context, a suspended context means silence.
      // Resume inside the play gesture (iOS only starts audio on a gesture).
      if (context.state === "suspended") await context.resume();
      await element.play();
    },
    pause: () => element.pause(),
    unlock: async () => {
      // Resume the context inside a user gesture (a fling's pointerdown) so a
      // later, gesture-detached play (the fling settling ~1-2s after pointerup)
      // outputs sound instead of advancing the element into a suspended,
      // silent context. Idempotent: a no-op once the context is running.
      if (context.state === "suspended") await context.resume();
    },
    setVolume: (value) => {
      gain.gain.value = value;
    },
    addEventListener: (type, listener) =>
      element.addEventListener(type, listener),
    removeEventListener: (type, listener) =>
      element.removeEventListener(type, listener),
  };
}
