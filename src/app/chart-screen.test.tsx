import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { CHARTS, CODE_BR, CODE_US, COUNTRY_US } from "@/lib/__fixtures__";
import type { AudioEngine } from "@/lib/audio-engine";
import type { ChartFile } from "@/lib/chart-schema";
import { globeChartStore } from "@/lib/globe-chart-store";

const mockSearchParams = vi.hoisted(() => ({
  value: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams.value,
}));

// A controllable stand-in for the browser audio engine so the component tree
// can play and end a track under happy-dom, which has no AudioContext.
const audioEngine = vi.hoisted(() => {
  let listeners: Partial<Record<string, Array<() => void>>> = {};
  return {
    reset() {
      listeners = {};
    },
    create(): AudioEngine {
      let src = "";
      return {
        get src() {
          return src;
        },
        set src(value: string) {
          src = value;
        },
        play: () => Promise.resolve(),
        pause: () => {},
        setVolume: () => {},
        addEventListener: (type, listener) => {
          (listeners[type] ??= []).push(listener);
        },
        removeEventListener: () => {},
      };
    },
    end() {
      (listeners.ended ?? []).forEach((listener) => listener());
    },
  };
});

vi.mock("@/lib/audio-engine", () => ({
  createBrowserAudioEngine: () => audioEngine.create(),
}));

import { ChartScreen } from "./chart-screen";

// A chart whose middle track has no preview, so the correct next track from #1
// is #3. Any "next" that walks a bare index would land on the unplayable #2.
const ADJ_CODE = "zz";
const ADJACENCY_CHARTS: ChartFile = {
  lastUpdated: "2026-04-25T03:00:00Z",
  countries: {
    [ADJ_CODE]: {
      name: "Chart under test",
      valid: true,
      tracks: [
        {
          rank: 1,
          name: "Playable head",
          artist: "Head artist",
          previewUrl: "https://example.com/head.m4a",
          artworkUrl: "https://example.com/head.jpg",
          appleUrl: "https://music.apple.com/x/head",
          spotifyUrl: "https://open.spotify.com/x/head",
        },
        {
          rank: 2,
          name: "Unplayable gap",
          artist: "Gap artist",
          previewUrl: null,
          artworkUrl: "https://example.com/gap.jpg",
          appleUrl: "https://music.apple.com/x/gap",
          spotifyUrl: "https://open.spotify.com/x/gap",
        },
        {
          rank: 3,
          name: "Playable tail",
          artist: "Tail artist",
          previewUrl: "https://example.com/tail.m4a",
          artworkUrl: "https://example.com/tail.jpg",
          appleUrl: "https://music.apple.com/x/tail",
          spotifyUrl: "https://open.spotify.com/x/tail",
        },
      ],
    },
  },
};

function playingRank(container: HTMLElement): string | null {
  return (
    container
      .querySelector('li[data-state="playing"]')
      ?.getAttribute("data-rank") ?? null
  );
}

// Render the chart, start the head track, run one "advance" gesture, and report
// the rank left playing.
function advanceFromHead(advance: () => void): string | null {
  audioEngine.reset();
  const { container, unmount } = render(
    <ChartScreen charts={ADJACENCY_CHARTS} defaultCountryCode={ADJ_CODE} />,
  );
  fireEvent.click(
    screen.getByRole("button", {
      name: "Play preview of Playable head by Head artist",
    }),
  );
  advance();
  const rank = playingRank(container);
  unmount();
  return rank;
}

describe("ChartScreen", () => {
  let replaceState: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockSearchParams.value = new URLSearchParams();
    replaceState = vi
      .spyOn(window.history, "replaceState")
      .mockImplementation(() => {});
  });

  afterEach(() => {
    replaceState.mockRestore();
  });

  test("renders the chart for a valid ?cc= without touching the URL", () => {
    mockSearchParams.value = new URLSearchParams(`cc=${CODE_US}`);

    render(<ChartScreen charts={CHARTS} defaultCountryCode={CODE_BR} />);

    expect(
      screen.getAllByText(COUNTRY_US.tracks[0].name).length,
    ).toBeGreaterThan(0);
    expect(replaceState).not.toHaveBeenCalled();
  });

  test("falls back to defaultCountryCode and writes it to the URL when ?cc= is absent", () => {
    render(<ChartScreen charts={CHARTS} defaultCountryCode={CODE_US} />);

    expect(
      screen.getAllByText(COUNTRY_US.tracks[0].name).length,
    ).toBeGreaterThan(0);
    expect(replaceState).toHaveBeenCalledWith(null, "", `?cc=${CODE_US}`);
  });

  test("falls back to defaultCountryCode for an invalid ?cc=", () => {
    mockSearchParams.value = new URLSearchParams("cc=xx");

    render(<ChartScreen charts={CHARTS} defaultCountryCode={CODE_US} />);

    expect(
      screen.getAllByText(COUNTRY_US.tracks[0].name).length,
    ).toBeGreaterThan(0);
    expect(replaceState).toHaveBeenCalledWith(null, "", `?cc=${CODE_US}`);
  });

  test("canonicalizes an uppercase ?cc= in the URL", () => {
    mockSearchParams.value = new URLSearchParams(`cc=${CODE_US.toUpperCase()}`);

    render(<ChartScreen charts={CHARTS} defaultCountryCode={CODE_BR} />);

    expect(
      screen.getAllByText(COUNTRY_US.tracks[0].name).length,
    ).toBeGreaterThan(0);
    expect(replaceState).toHaveBeenCalledWith(null, "", `?cc=${CODE_US}`);
  });
});

describe("ChartScreen globe coupling", () => {
  beforeEach(() => {
    mockSearchParams.value = new URLSearchParams(`cc=${CODE_US}`);
    globeChartStore.setState({
      readMode: false,
      settleSignal: 0,
      selectedCountry: null,
    });
    vi.spyOn(window.history, "replaceState").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("publishes the resolved ?cc= country to the globe", () => {
    mockSearchParams.value = new URLSearchParams(`cc=${CODE_US}`);

    render(<ChartScreen charts={CHARTS} defaultCountryCode={CODE_BR} />);

    expect(globeChartStore.getState().selectedCountry).toBe(CODE_US);
  });

  test("publishes the default country to the globe when ?cc= is absent", () => {
    mockSearchParams.value = new URLSearchParams();

    render(<ChartScreen charts={CHARTS} defaultCountryCode={CODE_BR} />);

    expect(globeChartStore.getState().selectedCountry).toBe(CODE_BR);
  });

  test("publishes read mode to the globe at full and clears it back at peek", () => {
    render(<ChartScreen charts={CHARTS} defaultCountryCode={CODE_BR} />);

    expect(globeChartStore.getState().readMode).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Expand chart" }));
    expect(globeChartStore.getState().readMode).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Collapse chart" }));
    expect(globeChartStore.getState().readMode).toBe(false);
  });

  test("a settle raises a dismissed sheet back to peek", () => {
    render(<ChartScreen charts={CHARTS} defaultCountryCode={CODE_BR} />);
    const sheet = screen.getByTestId("chart-sheet");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(sheet.dataset.snap).toBe("closed");

    act(() => {
      globeChartStore.getState().signalSettle();
    });
    expect(sheet.dataset.snap).toBe("peek");
  });

  test("a settle leaves an open sheet where it is", () => {
    render(<ChartScreen charts={CHARTS} defaultCountryCode={CODE_BR} />);
    const sheet = screen.getByTestId("chart-sheet");

    expect(sheet.dataset.snap).toBe("peek");
    act(() => {
      globeChartStore.getState().signalSettle();
    });
    expect(sheet.dataset.snap).toBe("peek");
  });

  test("releases read mode when the chart unmounts", () => {
    const { unmount } = render(
      <ChartScreen charts={CHARTS} defaultCountryCode={CODE_BR} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Expand chart" }));
    expect(globeChartStore.getState().readMode).toBe(true);

    unmount();
    expect(globeChartStore.getState().readMode).toBe(false);
  });

  test("a settle never starts audio on its own", () => {
    render(<ChartScreen charts={CHARTS} defaultCountryCode={CODE_BR} />);

    act(() => {
      globeChartStore.getState().signalSettle();
    });

    // The mini player only mounts once a track plays; its absence after a settle
    // shows the landing selected a country without starting audio.
    expect(screen.queryByRole("button", { name: "Reopen chart" })).toBeNull();
  });
});

describe("ChartScreen auto-advance", () => {
  beforeEach(() => {
    mockSearchParams.value = new URLSearchParams(`cc=${ADJ_CODE}`);
    audioEngine.reset();
    vi.spyOn(window.history, "replaceState").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("a track ending advances to the next playable track, skipping one with no preview", () => {
    const { container } = render(
      <ChartScreen charts={ADJACENCY_CHARTS} defaultCountryCode={ADJ_CODE} />,
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Play preview of Playable head by Head artist",
      }),
    );
    expect(playingRank(container)).toBe("1");

    act(() => {
      audioEngine.end();
    });

    expect(playingRank(container)).toBe("3");
  });

  test("auto-advance lands on the track that pressing Next lands on", () => {
    const viaEnded = advanceFromHead(() => {
      act(() => {
        audioEngine.end();
      });
    });
    const viaNext = advanceFromHead(() => {
      fireEvent.click(screen.getByRole("button", { name: "Next track" }));
    });

    expect(viaEnded).toBe("3");
    expect(viaEnded).toBe(viaNext);
  });
});
