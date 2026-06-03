import { assert, beforeEach, describe, expect, test, vi } from "vitest";

import type { Track } from "@/lib/chart-schema";

import { type AudioElementLike, createAudioStore } from "./audio-store";
import {
  clearNowPlaying,
  setActionHandlers,
  setNowPlaying,
  setPlaybackState,
} from "./media-session";

vi.mock("./media-session", () => ({
  setNowPlaying: vi.fn(),
  clearNowPlaying: vi.fn(),
  setPlaybackState: vi.fn(),
  setActionHandlers: vi.fn(),
}));

type EventType = "ended" | "error" | "play" | "pause";

interface MockAudio extends AudioElementLike {
  _trigger: (event: EventType) => void;
  _srcWrites: number;
}

function makeMockAudio(): MockAudio {
  const listeners: Partial<Record<EventType, Array<() => void>>> = {};
  let src = "";
  const audio: MockAudio = {
    get src() {
      return src;
    },
    set src(value: string) {
      audio._srcWrites++;
      src = value;
    },
    _srcWrites: 0,
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    addEventListener: vi.fn((type: EventType, listener: () => void) => {
      (listeners[type] ??= []).push(listener);
    }),
    removeEventListener: vi.fn(),
    _trigger: (event) => {
      (listeners[event] ?? []).forEach((l) => l());
    },
  };
  return audio;
}

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    rank: 1,
    name: "Test Track",
    artist: "Test Artist",
    previewUrl: "https://example.com/preview.m4a",
    artworkUrl: "https://example.com/art.jpg",
    appleUrl: "https://music.apple.com/x",
    spotifySearchUrl: "https://open.spotify.com/search/x",
    ...overrides,
  };
}

describe("createAudioStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("initial state: no track, not playing, no country", () => {
    const store = createAudioStore(() => makeMockAudio());

    expect(store.getState().currentTrack).toBeNull();
    expect(store.getState().isPlaying).toBe(false);
    expect(store.getState().currentCountryCode).toBeNull();
  });

  test("toggle plays a new track", () => {
    const audio = makeMockAudio();
    const store = createAudioStore(() => audio);
    const track = makeTrack({ previewUrl: "https://example.com/a.m4a" });

    store.getState().toggle(track);

    expect(audio.src).toBe(track.previewUrl);
    expect(audio.play).toHaveBeenCalledOnce();
    expect(store.getState().currentTrack).toBe(track);
    expect(store.getState().isPlaying).toBe(true);
  });

  test("toggle on same track while playing pauses (currentTrack preserved)", () => {
    const audio = makeMockAudio();
    const store = createAudioStore(() => audio);
    const track = makeTrack();
    store.getState().toggle(track);

    store.getState().toggle(track);

    expect(audio.pause).toHaveBeenCalledOnce();
    expect(store.getState().isPlaying).toBe(false);
    expect(store.getState().currentTrack).toBe(track);
  });

  test("toggle on different track while playing switches", () => {
    const audio = makeMockAudio();
    const store = createAudioStore(() => audio);
    const trackA = makeTrack({ previewUrl: "https://example.com/a.m4a" });
    const trackB = makeTrack({ previewUrl: "https://example.com/b.m4a" });
    store.getState().toggle(trackA);

    store.getState().toggle(trackB);

    expect(audio.src).toBe(trackB.previewUrl);
    expect(store.getState().currentTrack).toBe(trackB);
    expect(store.getState().isPlaying).toBe(true);
  });

  test("toggle on new track stores countryCode when provided", () => {
    const store = createAudioStore(() => makeMockAudio());
    const track = makeTrack();

    store.getState().toggle(track, "br");

    expect(store.getState().currentCountryCode).toBe("br");
  });

  test("toggle on new track without countryCode sets currentCountryCode to null", () => {
    const store = createAudioStore(() => makeMockAudio());
    const track = makeTrack();

    store.getState().toggle(track);

    expect(store.getState().currentCountryCode).toBeNull();
  });

  test("resume (toggle same track after pause) preserves countryCode", () => {
    const audio = makeMockAudio();
    const store = createAudioStore(() => audio);
    const track = makeTrack();
    store.getState().toggle(track, "br");
    store.getState().toggle(track); // pause
    assert(store.getState().isPlaying === false, "arrange: paused");

    store.getState().toggle(track); // resume without countryCode

    expect(store.getState().currentCountryCode).toBe("br");
    expect(store.getState().isPlaying).toBe(true);
  });

  test("stop clears currentCountryCode", () => {
    const store = createAudioStore(() => makeMockAudio());
    store.getState().toggle(makeTrack(), "br");

    store.getState().stop();

    expect(store.getState().currentCountryCode).toBeNull();
  });

  test("stop clears currentTrack and isPlaying", () => {
    const audio = makeMockAudio();
    const store = createAudioStore(() => audio);
    store.getState().toggle(makeTrack());

    store.getState().stop();

    expect(audio.pause).toHaveBeenCalledOnce();
    expect(store.getState().currentTrack).toBeNull();
    expect(store.getState().isPlaying).toBe(false);
  });

  test("pause stops playback but preserves currentTrack and countryCode", () => {
    const audio = makeMockAudio();
    const store = createAudioStore(() => audio);
    const track = makeTrack();
    store.getState().toggle(track, "br");

    store.getState().pause();

    expect(audio.pause).toHaveBeenCalledOnce();
    expect(store.getState().isPlaying).toBe(false);
    expect(store.getState().currentTrack).toBe(track);
    expect(store.getState().currentCountryCode).toBe("br");
  });

  test("pause does not increment endedSignal so auto-advance stays put", () => {
    const audio = makeMockAudio();
    const store = createAudioStore(() => audio);
    store.getState().toggle(makeTrack());

    store.getState().pause();

    expect(store.getState().endedSignal).toBe(0);
  });

  test("ended event: isPlaying false, currentTrack preserved", () => {
    const audio = makeMockAudio();
    const store = createAudioStore(() => audio);
    const track = makeTrack();
    store.getState().toggle(track);

    audio._trigger("ended");

    expect(store.getState().isPlaying).toBe(false);
    expect(store.getState().currentTrack).toBe(track);
  });

  test("ended event increments endedSignal so subscribers can auto-advance", () => {
    const audio = makeMockAudio();
    const store = createAudioStore(() => audio);
    store.getState().toggle(makeTrack());

    audio._trigger("ended");

    expect(store.getState().endedSignal).toBe(1);
  });

  test("endedSignal accumulates across consecutive ended events", () => {
    const audio = makeMockAudio();
    const store = createAudioStore(() => audio);
    const trackA = makeTrack();
    const trackB = makeTrack({ previewUrl: "https://example.com/b.m4a" });
    store.getState().toggle(trackA);
    audio._trigger("ended");
    store.getState().toggle(trackB);

    audio._trigger("ended");

    expect(store.getState().endedSignal).toBe(2);
  });

  test("error event: isPlaying false, currentTrack preserved", () => {
    const audio = makeMockAudio();
    const store = createAudioStore(() => audio);
    const track = makeTrack();
    store.getState().toggle(track);

    audio._trigger("error");

    expect(store.getState().isPlaying).toBe(false);
    expect(store.getState().currentTrack).toBe(track);
  });

  test("error event records lastError with the errored track's previewUrl", () => {
    const audio = makeMockAudio();
    const store = createAudioStore(() => audio);
    const track = makeTrack({ previewUrl: "https://example.com/broken.m4a" });
    store.getState().toggle(track);

    audio._trigger("error");

    expect(store.getState().lastError).toEqual({
      previewUrl: track.previewUrl,
    });
  });

  test("toggle clears lastError when switching tracks", () => {
    const audio = makeMockAudio();
    const store = createAudioStore(() => audio);
    const errored = makeTrack({ previewUrl: "https://example.com/broken.m4a" });
    const next = makeTrack({ previewUrl: "https://example.com/working.m4a" });
    store.getState().toggle(errored);
    audio._trigger("error");
    assert(
      store.getState().lastError !== null,
      "arrange: error event should set lastError",
    );

    store.getState().toggle(next);

    expect(store.getState().lastError).toBeNull();
  });

  test("stop clears lastError", () => {
    const audio = makeMockAudio();
    const store = createAudioStore(() => audio);
    const track = makeTrack();
    store.getState().toggle(track);
    audio._trigger("error");
    assert(
      store.getState().lastError !== null,
      "arrange: error event should set lastError",
    );

    store.getState().stop();

    expect(store.getState().lastError).toBeNull();
  });

  test("browser pause event syncs store (Layer 1)", () => {
    const audio = makeMockAudio();
    const store = createAudioStore(() => audio);
    const track = makeTrack();
    store.getState().toggle(track);

    audio._trigger("pause");

    expect(store.getState().isPlaying).toBe(false);
    expect(store.getState().currentTrack).toBe(track);
  });

  test("browser play event syncs store (Layer 1)", () => {
    const audio = makeMockAudio();
    const store = createAudioStore(() => audio);
    const track = makeTrack();
    store.getState().toggle(track);
    audio._trigger("pause");

    audio._trigger("play");

    expect(store.getState().isPlaying).toBe(true);
  });

  test("audio element is created lazily on first action", () => {
    const factory = vi.fn(() => makeMockAudio());
    createAudioStore(factory);

    expect(factory).not.toHaveBeenCalled();
  });

  test("audio element is reused across actions", () => {
    const factory = vi.fn(() => makeMockAudio());
    const store = createAudioStore(factory);

    store.getState().toggle(makeTrack({ previewUrl: "a" }));
    store.getState().toggle(makeTrack({ previewUrl: "b" }));
    store.getState().stop();

    expect(factory).toHaveBeenCalledOnce();
  });

  test("resume in place replays without rewriting src so the preview continues", () => {
    const audio = makeMockAudio();
    const store = createAudioStore(() => audio);
    const track = makeTrack();
    store.getState().toggle(track);
    store.getState().pause();

    store.getState().toggle(track);

    expect(audio._srcWrites).toBe(1);
    expect(audio.play).toHaveBeenCalledTimes(2);
    expect(store.getState().isPlaying).toBe(true);
  });

  test("toggle on a new track publishes now-playing metadata", () => {
    const store = createAudioStore(() => makeMockAudio());
    const track = makeTrack();

    store.getState().toggle(track);

    expect(setNowPlaying).toHaveBeenCalledWith(track);
  });

  test("resume in place does not republish metadata", () => {
    const store = createAudioStore(() => makeMockAudio());
    const track = makeTrack();
    store.getState().toggle(track);
    store.getState().pause();

    store.getState().toggle(track);

    expect(setNowPlaying).toHaveBeenCalledOnce();
  });

  test("stop clears now-playing metadata", () => {
    const store = createAudioStore(() => makeMockAudio());
    store.getState().toggle(makeTrack());

    store.getState().stop();

    expect(clearNowPlaying).toHaveBeenCalledOnce();
  });

  test("play event reports playing to the OS", () => {
    const audio = makeMockAudio();
    const store = createAudioStore(() => audio);
    store.getState().toggle(makeTrack());

    audio._trigger("play");

    expect(setPlaybackState).toHaveBeenCalledWith("playing");
  });

  test("pause event reports paused to the OS", () => {
    const audio = makeMockAudio();
    const store = createAudioStore(() => audio);
    store.getState().toggle(makeTrack());

    audio._trigger("pause");

    expect(setPlaybackState).toHaveBeenCalledWith("paused");
  });

  test("ended event reports none to the OS", () => {
    const audio = makeMockAudio();
    const store = createAudioStore(() => audio);
    store.getState().toggle(makeTrack());

    audio._trigger("ended");

    expect(setPlaybackState).toHaveBeenCalledWith("none");
  });

  test("registers OS transport handlers when the audio element is created", () => {
    const store = createAudioStore(() => makeMockAudio());

    store.getState().toggle(makeTrack());

    expect(setActionHandlers).toHaveBeenCalledOnce();
  });

  test("OS play handler resumes the current track in place", () => {
    const audio = makeMockAudio();
    const store = createAudioStore(() => audio);
    const track = makeTrack();
    store.getState().toggle(track);
    store.getState().pause();
    const { play } = vi.mocked(setActionHandlers).mock.calls[0][0];

    play();

    expect(store.getState().isPlaying).toBe(true);
    expect(audio._srcWrites).toBe(1);
  });

  test("OS pause handler pauses but keeps the current track", () => {
    const audio = makeMockAudio();
    const store = createAudioStore(() => audio);
    const track = makeTrack();
    store.getState().toggle(track);
    const { pause } = vi.mocked(setActionHandlers).mock.calls[0][0];

    pause();

    expect(audio.pause).toHaveBeenCalledOnce();
    expect(store.getState().isPlaying).toBe(false);
    expect(store.getState().currentTrack).toBe(track);
  });
});
