import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import type { AudioEngine } from "@/lib/audio-engine";
import { type AudioState, createAudioStore } from "@/lib/audio-store";
import type { Commentary, Track } from "@/lib/chart-schema";
import { AudioStoreContext } from "@/providers/audio-store-provider";

import { MiniPlayer, type MiniPlayerProps } from "./mini-player";

function makeMockAudio(): AudioEngine {
  return {
    src: "",
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    setVolume: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
}

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    rank: 1,
    name: "Test Track",
    artist: "Test Artist",
    previewUrl: "https://example.com/preview.m4a",
    artworkUrl: "https://example.com/artwork.jpg",
    appleUrl: "https://music.apple.com/track/1",
    spotifyUrl: "https://open.spotify.com/search/Test%20Track",
    ...overrides,
  };
}

function makeCommentary(): Commentary {
  return {
    lead: "Test lead",
    tag: "test-tag",
    claim: "what-it-is",
    sources: ["https://example.com/source"],
    generatedAt: "2026-04-25T03:00:00Z",
  };
}

function renderMiniPlayer(
  props: Partial<MiniPlayerProps> = {},
  init?: Partial<AudioState>,
) {
  const store = createAudioStore(() => makeMockAudio());
  if (init) {
    store.setState(init);
  }
  const fullProps: MiniPlayerProps = {
    onTap: vi.fn(),
    onCommentary: vi.fn(),
    onPrev: vi.fn(),
    onNext: vi.fn(),
    canPrev: true,
    canNext: true,
    ...props,
  };
  const utils = render(
    <AudioStoreContext.Provider value={store}>
      <MiniPlayer {...fullProps} />
    </AudioStoreContext.Provider>,
  );
  return { ...utils, store, props: fullProps };
}

describe("MiniPlayer", () => {
  test("renders nothing when currentTrack is null", () => {
    const { container } = renderMiniPlayer({ onTap: vi.fn() });

    expect(container.firstChild).toBeNull();
  });

  test("renders whenever currentTrack is set, regardless of sheet state", () => {
    const track = makeTrack();

    const { container } = renderMiniPlayer(
      { onTap: vi.fn() },
      { currentTrack: track },
    );

    expect(container.firstChild).not.toBeNull();
    expect(screen.getByText(track.name)).toBeDefined();
  });

  test("renders name, artist, artwork when currentTrack set", () => {
    const track = makeTrack({
      name: "Hot Track",
      artist: "Hot Artist",
      artworkUrl: "https://example.com/cover.jpg",
    });

    const { container } = renderMiniPlayer(
      { onTap: vi.fn() },
      { currentTrack: track },
    );

    expect(screen.getByText("Hot Track")).toBeDefined();
    expect(screen.getByText("Hot Artist")).toBeDefined();
    const artwork = container.querySelector('[aria-hidden="true"]');
    expect(artwork?.getAttribute("style")).toContain(track.artworkUrl);
  });

  test("tap on main area fires onTap callback", () => {
    const track = makeTrack();
    const onTap = vi.fn();

    renderMiniPlayer({ onTap }, { currentTrack: track });

    fireEvent.click(screen.getByRole("button", { name: /reopen chart/i }));

    expect(onTap).toHaveBeenCalledTimes(1);
  });

  test("play/pause button toggles audio store and reflects isPlaying", () => {
    const track = makeTrack({ name: "Hot Track" });

    const { store } = renderMiniPlayer(
      { onTap: vi.fn() },
      { currentTrack: track, isPlaying: false },
    );

    const playButton = screen.getByRole("button", {
      name: /play preview of Hot Track/i,
    });

    fireEvent.click(playButton);

    expect(store.getState().isPlaying).toBe(true);
    expect(
      screen.getByRole("button", { name: /pause preview of Hot Track/i }),
    ).toBeDefined();
  });

  test("renders the volume control", () => {
    renderMiniPlayer({ onTap: vi.fn() }, { currentTrack: makeTrack() });

    expect(screen.getByRole("button", { name: /volume/i })).toBeDefined();
  });

  test("next button fires onNext", () => {
    const onNext = vi.fn();

    renderMiniPlayer({ onNext }, { currentTrack: makeTrack() });

    fireEvent.click(screen.getByRole("button", { name: /next track/i }));

    expect(onNext).toHaveBeenCalledTimes(1);
  });

  test("prev button fires onPrev", () => {
    const onPrev = vi.fn();

    renderMiniPlayer({ onPrev }, { currentTrack: makeTrack() });

    fireEvent.click(screen.getByRole("button", { name: /previous track/i }));

    expect(onPrev).toHaveBeenCalledTimes(1);
  });

  test("next button is disabled when canNext is false", () => {
    renderMiniPlayer({ canNext: false }, { currentTrack: makeTrack() });

    const nextButton = screen.getByRole("button", { name: /next track/i });
    expect((nextButton as HTMLButtonElement).disabled).toBe(true);
  });

  test("prev button is disabled when canPrev is false", () => {
    renderMiniPlayer({ canPrev: false }, { currentTrack: makeTrack() });

    const prevButton = screen.getByRole("button", { name: /previous track/i });
    expect((prevButton as HTMLButtonElement).disabled).toBe(true);
  });

  test("swipe left fires onNext and suppresses the tap", () => {
    const onNext = vi.fn();
    const onTap = vi.fn();

    renderMiniPlayer({ onNext, onTap }, { currentTrack: makeTrack() });

    const area = screen.getByRole("button", { name: /reopen chart/i });
    fireEvent.pointerDown(area, { clientX: 200, clientY: 10 });
    fireEvent.pointerUp(area, { clientX: 40, clientY: 10 });
    fireEvent.click(area);

    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onTap).not.toHaveBeenCalled();
  });

  test("swipe right fires onPrev and suppresses the tap", () => {
    const onPrev = vi.fn();
    const onTap = vi.fn();

    renderMiniPlayer({ onPrev, onTap }, { currentTrack: makeTrack() });

    const area = screen.getByRole("button", { name: /reopen chart/i });
    fireEvent.pointerDown(area, { clientX: 40, clientY: 10 });
    fireEvent.pointerUp(area, { clientX: 200, clientY: 10 });
    fireEvent.click(area);

    expect(onPrev).toHaveBeenCalledTimes(1);
    expect(onTap).not.toHaveBeenCalled();
  });

  test("commentary badge is absent when the track carries no commentary", () => {
    renderMiniPlayer({}, { currentTrack: makeTrack() });

    expect(
      screen.queryByRole("button", { name: /why this track is trending/i }),
    ).toBeNull();
  });

  test("commentary badge is absent when commentary is explicitly null", () => {
    renderMiniPlayer({}, { currentTrack: makeTrack({ commentary: null }) });

    expect(
      screen.queryByRole("button", { name: /why this track is trending/i }),
    ).toBeNull();
  });

  test("commentary badge fires onCommentary, not onTap", () => {
    const onCommentary = vi.fn();
    const onTap = vi.fn();
    const track = makeTrack({ commentary: makeCommentary() });

    renderMiniPlayer({ onCommentary, onTap }, { currentTrack: track });

    fireEvent.click(
      screen.getByRole("button", { name: /why this track is trending/i }),
    );

    expect(onCommentary).toHaveBeenCalledTimes(1);
    expect(onTap).not.toHaveBeenCalled();
  });

  test("a forward skip marks the incoming content with the forward cue", () => {
    const outgoing = makeTrack({
      appleUrl: "https://music.apple.com/x/album?i=101",
    });
    const incoming = makeTrack({
      rank: 2,
      appleUrl: "https://music.apple.com/x/album?i=102",
    });
    const { container, store } = renderMiniPlayer(
      {},
      { currentTrack: outgoing },
    );

    act(() => {
      store.setState({ currentTrack: incoming });
      store.getState().signalStep(1);
    });

    const cue = container.querySelector("[data-track-change]");
    expect(cue?.getAttribute("data-track-change")).toBe("next");
  });

  test("a backward skip marks the incoming content with the backward cue", () => {
    const outgoing = makeTrack({
      rank: 2,
      appleUrl: "https://music.apple.com/x/album?i=102",
    });
    const incoming = makeTrack({
      appleUrl: "https://music.apple.com/x/album?i=101",
    });
    const { container, store } = renderMiniPlayer(
      {},
      { currentTrack: outgoing },
    );

    act(() => {
      store.setState({ currentTrack: incoming });
      store.getState().signalStep(-1);
    });

    const cue = container.querySelector("[data-track-change]");
    expect(cue?.getAttribute("data-track-change")).toBe("prev");
  });

  test("a track change without a step stays cue-free", () => {
    const outgoing = makeTrack({
      appleUrl: "https://music.apple.com/x/album?i=101",
    });
    const incoming = makeTrack({
      rank: 2,
      appleUrl: "https://music.apple.com/x/album?i=102",
    });
    const { container, store } = renderMiniPlayer(
      {},
      { currentTrack: outgoing },
    );

    act(() => {
      store.setState({ currentTrack: incoming });
    });

    expect(container.querySelector("[data-track-change]")).toBeNull();
  });

  test("mounting with a step already recorded never animates", () => {
    const track = makeTrack({
      appleUrl: "https://music.apple.com/x/album?i=101",
    });

    const { container } = renderMiniPlayer(
      {},
      { currentTrack: track, lastStep: { dir: 1, nonce: 5 } },
    );

    expect(container.querySelector("[data-track-change]")).toBeNull();
  });

  test("a short press below the swipe threshold still taps", () => {
    const onNext = vi.fn();
    const onPrev = vi.fn();
    const onTap = vi.fn();

    renderMiniPlayer({ onNext, onPrev, onTap }, { currentTrack: makeTrack() });

    const area = screen.getByRole("button", { name: /reopen chart/i });
    fireEvent.pointerDown(area, { clientX: 100, clientY: 10 });
    fireEvent.pointerUp(area, { clientX: 110, clientY: 10 });
    fireEvent.click(area);

    expect(onTap).toHaveBeenCalledTimes(1);
    expect(onNext).not.toHaveBeenCalled();
    expect(onPrev).not.toHaveBeenCalled();
  });
});
