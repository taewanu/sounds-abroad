import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import {
  type AudioElementLike,
  type AudioState,
  createAudioStore,
} from "@/lib/audio-store";
import type { Track } from "@/lib/chart-schema";
import { AudioStoreContext } from "@/providers/audio-store-provider";

import { TrackRow } from "./track-row";

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

function renderTrackRow(track: Track, init?: Partial<AudioState>) {
  const store = createAudioStore(() => makeMockAudio());
  if (init) {
    store.setState(init);
  }
  const utils = render(
    <AudioStoreContext.Provider value={store}>
      <ul>
        <TrackRow track={track} />
      </ul>
    </AudioStoreContext.Provider>,
  );
  return { ...utils, store };
}

describe("TrackRow", () => {
  test("renders rank, name, artist, artwork", () => {
    const track = makeTrack({ rank: 5 });

    const { container } = renderTrackRow(track);

    expect(screen.getByText(String(track.rank))).toBeDefined();
    expect(screen.getByText(track.name)).toBeDefined();
    expect(screen.getByText(track.artist)).toBeDefined();
    const artwork = container.querySelector('[aria-hidden="true"]');
    expect(artwork?.getAttribute("style")).toContain(track.artworkUrl);
  });

  test("clicking the row triggers audio store toggle for this track", () => {
    const track = makeTrack();
    const { store } = renderTrackRow(track);

    fireEvent.click(screen.getByRole("button", { name: /preview/i }));

    expect(store.getState().currentTrack).toBe(track);
    expect(store.getState().isPlaying).toBe(true);
  });

  test("data-state reflects current vs idle, playing vs paused", () => {
    const track = makeTrack();
    const otherTrack = makeTrack({
      rank: 2,
      previewUrl: "https://example.com/other.m4a",
    });

    const { container, rerender, store } = renderTrackRow(track);

    expect(container.querySelector("[data-state]")).toBeNull();

    store.setState({ currentTrack: track, isPlaying: true });
    rerender(
      <AudioStoreContext.Provider value={store}>
        <ul>
          <TrackRow track={track} />
        </ul>
      </AudioStoreContext.Provider>,
    );
    expect(container.querySelector('[data-state="playing"]')).not.toBeNull();

    store.setState({ currentTrack: track, isPlaying: false });
    rerender(
      <AudioStoreContext.Provider value={store}>
        <ul>
          <TrackRow track={track} />
        </ul>
      </AudioStoreContext.Provider>,
    );
    expect(container.querySelector('[data-state="paused"]')).not.toBeNull();

    store.setState({ currentTrack: otherTrack, isPlaying: true });
    rerender(
      <AudioStoreContext.Provider value={store}>
        <ul>
          <TrackRow track={track} />
        </ul>
      </AudioStoreContext.Provider>,
    );
    expect(container.querySelector("[data-state]")).toBeNull();
  });

  test("disabled state when previewUrl is null: button disabled, label shown, click is no-op", () => {
    const track = makeTrack({ previewUrl: null });
    const { store } = renderTrackRow(track);

    const button = screen.getByRole("button", { name: /preview/i });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/No preview/)).toBeDefined();

    fireEvent.click(button);

    expect(store.getState().currentTrack).toBeNull();
    expect(store.getState().isPlaying).toBe(false);
  });

  test("Apple Music anchor: href, opens in new tab, noopener", () => {
    const track = makeTrack({ appleUrl: "https://music.apple.com/song/42" });

    renderTrackRow(track);

    const apple = screen.getByRole("link", { name: /Apple Music/i });
    expect(apple.getAttribute("href")).toBe(track.appleUrl);
    expect(apple.getAttribute("target")).toBe("_blank");
    expect(apple.getAttribute("rel")).toContain("noopener");
  });

  test("Spotify anchor: href, opens in new tab, noopener", () => {
    const track = makeTrack({
      spotifySearchUrl: "https://open.spotify.com/search/foo",
    });

    renderTrackRow(track);

    const spotify = screen.getByRole("link", { name: /Spotify/i });
    expect(spotify.getAttribute("href")).toBe(track.spotifySearchUrl);
    expect(spotify.getAttribute("target")).toBe("_blank");
    expect(spotify.getAttribute("rel")).toContain("noopener");
  });

  test("error message renders when lastError matches this track's previewUrl", () => {
    const track = makeTrack();

    renderTrackRow(track, {
      lastError: { previewUrl: track.previewUrl },
    });

    expect(screen.getByText(/Preview unavailable/)).toBeDefined();
  });

  test("error message hidden when lastError matches a different track", () => {
    const track = makeTrack();

    renderTrackRow(track, {
      lastError: { previewUrl: "https://example.com/other.m4a" },
    });

    expect(screen.queryByText(/Preview unavailable/)).toBeNull();
  });
});
