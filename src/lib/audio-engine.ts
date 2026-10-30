export type AudioEventType = "ended" | "error" | "play" | "pause";

/**
 * The audio output the store drives. A seam: the store stays pure and
 * testable while the real implementation owns the browser audio output.
 */
export interface AudioEngine {
  src: string;
  /** False where the platform ignores element volume, leaving the level to the hardware. */
  readonly volumeAdjustable: boolean;
  play(): Promise<void>;
  pause(): void;
  setVolume(value: number): void;
  addEventListener(type: AudioEventType, listener: () => void): void;
  removeEventListener(type: AudioEventType, listener: () => void): void;
}

export type AudioEngineFactory = () => AudioEngine;

/**
 * Probes `:volume-locked` rather than writing and reading back, because a
 * locked element reports the written value until a later task restores it.
 */
function isVolumeLocked(element: HTMLMediaElement): boolean {
  try {
    return element.matches(":volume-locked");
  } catch (error) {
    // A browser that cannot parse the selector has no volume lock to report.
    if (error instanceof DOMException && error.name === "SyntaxError") {
      return false;
    }
    throw error;
  }
}

export function createBrowserAudioEngine(): AudioEngine {
  const element = new Audio();
  return {
    get src() {
      return element.src;
    },
    set src(value: string) {
      element.src = value;
    },
    volumeAdjustable: !isVolumeLocked(element),
    play: () => element.play(),
    pause: () => element.pause(),
    setVolume: (value) => {
      element.volume = value;
    },
    addEventListener: (type, listener) =>
      element.addEventListener(type, listener),
    removeEventListener: (type, listener) =>
      element.removeEventListener(type, listener),
  };
}
