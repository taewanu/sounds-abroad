import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import {
  type AudioElementLike,
  type AudioState,
  createAudioStore,
} from "@/lib/audio-store";
import type { Track } from "@/lib/chart-schema";
import { AudioStoreContext } from "@/providers/audio-store-provider";

import { MiniPlayer } from "./mini-player";

function makeMockAudio(): AudioElementLike {
  return {
    src: "",
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
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
    spotifySearchUrl: "https://open.spotify.com/search/Test%20Track",
    ...overrides,
  };
}

function renderMiniPlayer(
  props: { sheetClosed: boolean; onTap: () => void },
  init?: Partial<AudioState>,
) {
  const store = createAudioStore(() => makeMockAudio());
  if (init) {
    store.setState(init);
  }
  const utils = render(
    <AudioStoreContext.Provider value={store}>
      <MiniPlayer {...props} />
    </AudioStoreContext.Provider>,
  );
  return { ...utils, store };
}

describe("MiniPlayer", () => {
  test("renders nothing when currentTrack is null", () => {
    const { container } = renderMiniPlayer({
      sheetClosed: true,
      onTap: vi.fn(),
    });

    expect(container.firstChild).toBeNull();
  });

  test("renders nothing when sheet is not closed even if currentTrack set", () => {
    const track = makeTrack();

    const { container } = renderMiniPlayer(
      { sheetClosed: false, onTap: vi.fn() },
      { currentTrack: track },
    );

    expect(container.firstChild).toBeNull();
  });

  test("renders name, artist, artwork when currentTrack set and sheet closed", () => {
    const track = makeTrack({
      name: "Hot Track",
      artist: "Hot Artist",
      artworkUrl: "https://example.com/cover.jpg",
    });

    const { container } = renderMiniPlayer(
      { sheetClosed: true, onTap: vi.fn() },
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

    renderMiniPlayer({ sheetClosed: true, onTap }, { currentTrack: track });

    fireEvent.click(screen.getByRole("button", { name: /reopen chart/i }));

    expect(onTap).toHaveBeenCalledTimes(1);
  });

  test("play/pause button toggles audio store and reflects isPlaying", () => {
    const track = makeTrack({ name: "Hot Track" });

    const { store } = renderMiniPlayer(
      { sheetClosed: true, onTap: vi.fn() },
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
});
