import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import type { AudioEngine } from "@/lib/audio-engine";
import { type AudioState, createAudioStore } from "@/lib/audio-store";
import { SONGS_CHART } from "@/lib/chart-ref";
import type { Commentary, Track } from "@/lib/chart-schema";
import type { GemTier } from "@/lib/select-gem";
import { AudioStoreContext } from "@/providers/audio-store-provider";

import { GemCard } from "./gem-card";

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
    rank: 3,
    name: "Test Gem",
    artist: "Test Artist",
    previewUrl: "https://example.com/preview.m4a",
    artworkUrl: "https://example.com/artwork.jpg",
    appleUrl: "https://music.apple.com/track/1",
    spotifyUrl: "https://open.spotify.com/search/Test%20Gem",
    spread: 1,
    ...overrides,
  };
}

function renderGemCard(
  track: Track,
  tier: GemTier = "entirely their own",
  init?: Partial<AudioState>,
  countryCode = "kr",
) {
  const store = createAudioStore(() => makeMockAudio());
  if (init) {
    store.setState(init);
  }
  const utils = render(
    <AudioStoreContext.Provider value={store}>
      <GemCard track={track} tier={tier} countryCode={countryCode} />
    </AudioStoreContext.Provider>,
  );
  return { ...utils, store };
}

describe("GemCard", () => {
  test("renders as an accessible region labeled Local Gem", () => {
    renderGemCard(makeTrack());

    expect(screen.getByRole("region", { name: /local gem/i })).toBeDefined();
  });

  test("renders the track name, artist, and tier label", () => {
    const track = makeTrack({ name: "Local Anthem", artist: "Local Band" });

    renderGemCard(track, "a local favorite");

    expect(screen.getByText("Local Anthem")).toBeDefined();
    expect(screen.getByText("Local Band")).toBeDefined();
    expect(screen.getByText(/a local favorite/i)).toBeDefined();
  });

  test("clicking the play control toggles the gem track on the audio store", () => {
    const track = makeTrack();
    const { store } = renderGemCard(
      track,
      "entirely their own",
      undefined,
      "br",
    );

    fireEvent.click(screen.getByRole("button", { name: /play/i }));

    expect(store.getState().currentTrack).toBe(track);
    expect(store.getState().isPlaying).toBe(true);
    expect(store.getState().currentCountryCode).toBe("br");
  });

  test("clicking again pauses a gem that's already playing", () => {
    const track = makeTrack();
    const { store } = renderGemCard(track, "entirely their own", {
      currentTrack: track,
      isPlaying: true,
      currentCountryCode: "kr",
      currentChartRef: SONGS_CHART,
    });

    fireEvent.click(screen.getByRole("button", { name: /pause/i }));

    expect(store.getState().isPlaying).toBe(false);
  });

  test("play control is disabled with no toggle when there's no preview", () => {
    const track = makeTrack({ previewUrl: null });
    const { store } = renderGemCard(track);

    const button = screen.getByRole("button", { name: /play/i });
    expect((button as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(button);

    expect(store.getState().currentTrack).toBeNull();
  });

  test("shows the now-playing badge only while this gem is the current, playing track", () => {
    const track = makeTrack();
    const { container } = renderGemCard(track, "entirely their own", {
      currentTrack: track,
      isPlaying: true,
      currentCountryCode: "kr",
      currentChartRef: SONGS_CHART,
    });

    expect(container.querySelector(".eq")).not.toBeNull();
    expect(container.querySelector(".eq[data-paused]")).toBeNull();
  });

  test("marks the now-playing badge paused when the current gem is paused", () => {
    const track = makeTrack();
    const { container } = renderGemCard(track, "entirely their own", {
      currentTrack: track,
      isPlaying: false,
      currentCountryCode: "kr",
      currentChartRef: SONGS_CHART,
    });

    expect(container.querySelector(".eq[data-paused]")).not.toBeNull();
  });

  test("shows no now-playing badge when a different track is current", () => {
    const track = makeTrack();
    const other = makeTrack({
      appleUrl: "https://music.apple.com/track/2?i=2",
      previewUrl: "https://example.com/other.m4a",
    });
    const { container } = renderGemCard(track, "entirely their own", {
      currentTrack: other,
      isPlaying: true,
      currentCountryCode: "kr",
      currentChartRef: SONGS_CHART,
    });

    expect(container.querySelector(".eq")).toBeNull();
  });

  test("shows no now-playing badge when the same previewUrl plays in a different country", () => {
    const track = makeTrack();
    const { container } = renderGemCard(
      track,
      "entirely their own",
      {
        currentTrack: track,
        isPlaying: true,
        currentCountryCode: "br",
        currentChartRef: SONGS_CHART,
      },
      "kr",
    );

    expect(container.querySelector(".eq")).toBeNull();
  });

  test("error message renders when lastError matches the gem's previewUrl", () => {
    const track = makeTrack();

    renderGemCard(track, "entirely their own", {
      lastError: { previewUrl: track.previewUrl },
    });

    expect(screen.getByText(/Preview unavailable/)).toBeDefined();
  });

  test("error message hidden when lastError matches a different track", () => {
    const track = makeTrack();

    renderGemCard(track, "entirely their own", {
      lastError: { previewUrl: "https://example.com/other.m4a" },
    });

    expect(screen.queryByText(/Preview unavailable/)).toBeNull();
  });
});

describe("GemCard tier strength meter", () => {
  test.each([
    ["entirely their own", 3],
    ["a local favorite", 2],
    ["their most local pick today", 1],
  ] as const)('tier "%s" lights %i dot(s)', (tier, litCount) => {
    const { container } = renderGemCard(makeTrack(), tier);

    expect(container.querySelectorAll("[data-lit]")).toHaveLength(litCount);
  });
});

describe("GemCard commentary", () => {
  const COMMENTARY = {
    lead: "Barely charts anywhere else.",
    detail: "A homegrown favorite that hasn't spread beyond this market.",
    tag: "hidden gem",
    claim: "what-it-is",
    sources: ["https://www.billboard.com/charts"],
    generatedAt: "2026-04-25T03:00:00Z",
  } satisfies Commentary;

  test("reuses the shared commentary panel when the gem has commentary", () => {
    const track = makeTrack({ commentary: COMMENTARY });

    renderGemCard(track);

    const toggle = screen.getByRole("button", { expanded: false });
    expect(toggle.textContent).toContain(COMMENTARY.lead);

    fireEvent.click(toggle);

    expect(screen.getByText(COMMENTARY.detail)).toBeDefined();
  });

  test("renders no commentary affordance when the gem has none", () => {
    const track = makeTrack();

    renderGemCard(track);

    expect(screen.queryByRole("button", { expanded: false })).toBeNull();
  });
});
