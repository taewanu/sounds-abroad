import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import type { AudioEngine } from "@/lib/audio-engine";
import { type AudioState, createAudioStore } from "@/lib/audio-store";
import type { Commentary, Track } from "@/lib/chart-schema";
import { AudioStoreContext } from "@/providers/audio-store-provider";

import { TrackRow } from "./track-row";

const trackEvent = vi.hoisted(() => vi.fn());
vi.mock("@/lib/analytics", () => ({ track: trackEvent }));

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

function renderTrackRow(
  track: Track,
  init?: Partial<AudioState>,
  countryCode = "kr",
) {
  const store = createAudioStore(() => makeMockAudio());
  if (init) {
    store.setState(init);
  }
  const utils = render(
    <AudioStoreContext.Provider value={store}>
      <ul>
        <TrackRow track={track} countryCode={countryCode} />
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

  test("clicking the row stores countryCode as source on the audio store", () => {
    const track = makeTrack();
    const { store } = renderTrackRow(track, undefined, "br");

    fireEvent.click(screen.getByRole("button", { name: /preview/i }));

    expect(store.getState().currentCountryCode).toBe("br");
  });

  test("data-state reflects current vs idle, playing vs paused", () => {
    const track = makeTrack();
    const otherTrack = makeTrack({
      rank: 2,
      appleUrl: "https://music.apple.com/track/2?i=2",
      previewUrl: "https://example.com/other.m4a",
    });

    const { container, rerender, store } = renderTrackRow(track);

    expect(container.querySelector("[data-state]")).toBeNull();

    store.setState({
      currentTrack: track,
      isPlaying: true,
      currentCountryCode: "kr",
    });
    rerender(
      <AudioStoreContext.Provider value={store}>
        <ul>
          <TrackRow track={track} countryCode="kr" />
        </ul>
      </AudioStoreContext.Provider>,
    );
    expect(container.querySelector('[data-state="playing"]')).not.toBeNull();

    store.setState({
      currentTrack: track,
      isPlaying: false,
      currentCountryCode: "kr",
    });
    rerender(
      <AudioStoreContext.Provider value={store}>
        <ul>
          <TrackRow track={track} countryCode="kr" />
        </ul>
      </AudioStoreContext.Provider>,
    );
    expect(container.querySelector('[data-state="paused"]')).not.toBeNull();

    store.setState({
      currentTrack: otherTrack,
      isPlaying: true,
      currentCountryCode: "kr",
    });
    rerender(
      <AudioStoreContext.Provider value={store}>
        <ul>
          <TrackRow track={track} countryCode="kr" />
        </ul>
      </AudioStoreContext.Provider>,
    );
    expect(container.querySelector("[data-state]")).toBeNull();
  });

  test("data-state idle when same previewUrl plays in a different country", () => {
    const track = makeTrack();
    const { container } = renderTrackRow(
      track,
      { currentTrack: track, isPlaying: true, currentCountryCode: "a" },
      "b",
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
      spotifyUrl: "https://open.spotify.com/search/foo",
    });

    renderTrackRow(track);

    const spotify = screen.getByRole("link", { name: /Spotify/i });
    expect(spotify.getAttribute("href")).toBe(track.spotifyUrl);
    expect(spotify.getAttribute("target")).toBe("_blank");
    expect(spotify.getAttribute("rel")).toContain("noopener");
  });

  test("clicking Apple Music pauses the preview but keeps the track", () => {
    const track = makeTrack();
    const { store } = renderTrackRow(track, {
      currentTrack: track,
      isPlaying: true,
      currentCountryCode: "kr",
    });

    fireEvent.click(screen.getByRole("link", { name: /Apple Music/i }));

    expect(store.getState().isPlaying).toBe(false);
    expect(store.getState().currentTrack).toBe(track);
  });

  test("clicking Spotify pauses the preview but keeps the track", () => {
    const track = makeTrack();
    const { store } = renderTrackRow(track, {
      currentTrack: track,
      isPlaying: true,
      currentCountryCode: "kr",
    });

    fireEvent.click(screen.getByRole("link", { name: /Spotify/i }));

    expect(store.getState().isPlaying).toBe(false);
    expect(store.getState().currentTrack).toBe(track);
  });

  test("a resolved Spotify link reports the tap as landing on the track", () => {
    const track = makeTrack({
      spotifyUrl: "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT",
    });

    renderTrackRow(track);
    fireEvent.click(screen.getByRole("link", { name: /Spotify/i }));

    expect(trackEvent).toHaveBeenCalledWith(
      "deeplink_out",
      expect.objectContaining({ platform: "spotify", destination: "track" }),
    );
  });

  test("an unresolved Spotify link reports the tap as landing on a search", () => {
    const track = makeTrack({
      spotifyUrl: "https://open.spotify.com/search/Test%20Track",
    });

    renderTrackRow(track);
    fireEvent.click(screen.getByRole("link", { name: /Spotify/i }));

    expect(trackEvent).toHaveBeenCalledWith(
      "deeplink_out",
      expect.objectContaining({ platform: "spotify", destination: "search" }),
    );
  });

  test("a track carrying no Spotify link falls back to a search for it", () => {
    const track = makeTrack({ name: "Ice Cream", artist: "연준" });
    delete (track as { spotifyUrl?: string }).spotifyUrl;

    renderTrackRow(track);

    const spotify = screen.getByRole("link", { name: /Spotify/i });
    expect(spotify.getAttribute("href")).toBe(
      "https://open.spotify.com/search/Ice%20Cream%20%EC%97%B0%EC%A4%80",
    );
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

describe("TrackRow commentary card", () => {
  const COMMENTARY = {
    lead: "A new entry climbing fast this week.",
    detail: "Brief context on why the track is rising.",
    tag: "new entry",
    claim: "why-charting",
    sources: [
      "https://www.billboard.com/charts",
      "https://pitchfork.com/reviews",
    ],
    generatedAt: "2026-04-25T03:00:00Z",
  } satisfies Commentary;

  test("renders no affordance when commentary is absent", () => {
    const track = makeTrack();

    const { container } = renderTrackRow(track);

    expect(container.querySelector("[aria-expanded]")).toBeNull();
    expect(screen.queryByRole("button", { expanded: false })).toBeNull();
  });

  test("collapsed: shows tag + lead, panel starts inert", () => {
    const track = makeTrack({ commentary: COMMENTARY });

    renderTrackRow(track);

    const toggle = screen.getByRole("button", { expanded: false });
    expect(toggle.textContent).toContain(COMMENTARY.lead);
    expect(screen.getByText(COMMENTARY.tag)).toBeDefined();
    const panel = document.getElementById(
      toggle.getAttribute("aria-controls")!,
    );
    expect(panel?.hasAttribute("inert")).toBe(true);
  });

  test("tapping the teaser expands: aria-expanded flips and the panel un-inerts", () => {
    const track = makeTrack({ commentary: COMMENTARY });

    renderTrackRow(track);
    const toggle = screen.getByRole("button", { expanded: false });
    fireEvent.click(toggle);

    expect(screen.getByRole("button", { expanded: true })).toBeDefined();
    const panel = document.getElementById(
      toggle.getAttribute("aria-controls")!,
    );
    expect(panel?.hasAttribute("inert")).toBe(false);
  });

  test("expanded: shows detail and sources as bare hostnames", () => {
    const track = makeTrack({ commentary: COMMENTARY });

    renderTrackRow(track);
    fireEvent.click(screen.getByRole("button", { expanded: false }));

    expect(screen.getByText(COMMENTARY.detail)).toBeDefined();
    const source = screen.getByRole("link", { name: "billboard.com" });
    expect(source.getAttribute("href")).toBe(COMMENTARY.sources[0]);
    expect(source.getAttribute("target")).toBe("_blank");
    expect(source.getAttribute("rel")).toContain("noopener");
  });

  test("minimal commentary (no detail) still renders the teaser and sources", () => {
    const track = makeTrack({
      commentary: {
        lead: "A long-running chart favorite.",
        tag: "mainstay",
        claim: "what-it-is",
        sources: ["https://npr.org/music"],
        generatedAt: "2026-04-25T03:00:00Z",
      },
    });

    renderTrackRow(track);
    const toggle = screen.getByRole("button", { expanded: false });
    expect(toggle.textContent).toContain("A long-running chart favorite.");

    fireEvent.click(toggle);

    expect(screen.getByRole("link", { name: "npr.org" })).toBeDefined();
  });
});

describe("TrackRow commentary focus card", () => {
  const COMMENTARY = {
    lead: "A drill-inflected breakout dominating the charts for three weeks.",
    detail: "It crossed over from underground clubs after a viral challenge.",
    tag: "why it's here",
    claim: "why-charting",
    sources: ["https://www.billboard.com/charts"],
    generatedAt: "2026-04-25T03:00:00Z",
  } satisfies Commentary;

  function renderFocusRow(over: { focused?: boolean; dimmed?: boolean } = {}) {
    const store = createAudioStore(() => makeMockAudio());
    const onOpenCommentary = vi.fn();
    const onCloseCommentary = vi.fn();
    const utils = render(
      <AudioStoreContext.Provider value={store}>
        <ul>
          <TrackRow
            track={makeTrack({ commentary: COMMENTARY })}
            countryCode="kr"
            focused={over.focused ?? false}
            dimmed={over.dimmed ?? false}
            onOpenCommentary={onOpenCommentary}
            onCloseCommentary={onCloseCommentary}
          />
        </ul>
      </AudioStoreContext.Provider>,
    );
    return { ...utils, onOpenCommentary, onCloseCommentary };
  }

  test("closed: the teaser opens the card; the reveal stays collapsed", () => {
    const { container, onOpenCommentary } = renderFocusRow({ focused: false });

    const teaser = screen.getByRole("button", { expanded: false });
    expect(teaser.textContent).toContain(COMMENTARY.lead);
    // The reveal is always mounted (so it can animate closed too), but is not
    // opened while the teaser is closed.
    expect(container.querySelector(".commentary-reveal[data-open]")).toBeNull();

    fireEvent.click(teaser);

    expect(onOpenCommentary).toHaveBeenCalledTimes(1);
  });

  test("focused: shows the detail and sources, and the teaser closes it", () => {
    const { onCloseCommentary } = renderFocusRow({ focused: true });

    expect(screen.getByText(COMMENTARY.detail)).toBeDefined();
    expect(screen.getByRole("link", { name: "billboard.com" })).toBeDefined();

    fireEvent.click(screen.getByRole("button", { expanded: true }));

    expect(onCloseCommentary).toHaveBeenCalledTimes(1);
  });

  test("focused: the row is tagged as the commentary card for outside-click", () => {
    const { container } = renderFocusRow({ focused: true });

    expect(container.querySelector("[data-commentary-card]")).not.toBeNull();
  });

  test("dimmed: the row recedes and is inert to pointers", () => {
    const { container } = renderFocusRow({ dimmed: true });

    const li = container.querySelector("li");
    expect(li?.className).toContain("opacity-40");
    expect(li?.className).toContain("pointer-events-none");
    expect(li?.hasAttribute("inert")).toBe(true);
  });
});
