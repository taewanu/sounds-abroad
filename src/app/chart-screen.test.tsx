import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  CHARTS,
  CODE_BR,
  CODE_KR,
  CODE_US,
  COUNTRY_BR,
  COUNTRY_US,
} from "@/lib/__fixtures__";
import { pickAutoplayTrack } from "@/lib/autoplay";

const mockSearchParams = vi.hoisted(() => ({
  value: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams.value,
}));

// A single mock engine the audio store drives. `src` and `play` are the
// observable surface; listeners aren't fired (the store sets isPlaying
// synchronously inside toggle, which is what the gate reads).
const engine = vi.hoisted(() => {
  const listeners: Record<string, Array<() => void>> = {};
  return {
    src: "",
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    setVolume: vi.fn(),
    addEventListener: (type: string, listener: () => void) => {
      (listeners[type] ??= []).push(listener);
    },
    removeEventListener: () => {},
    reset() {
      this.src = "";
      this.play.mockClear();
      for (const key of Object.keys(listeners)) delete listeners[key];
    },
  };
});

vi.mock("@/lib/audio-engine", () => ({
  createBrowserAudioEngine: () => engine,
}));

vi.mock("@/lib/media-session", () => ({
  setNowPlaying: vi.fn(),
  clearNowPlaying: vi.fn(),
  setPlaybackState: vi.fn(),
  setActionHandlers: vi.fn(),
}));

import { ChartScreen } from "./chart-screen";

describe("ChartScreen", () => {
  let replaceState: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockSearchParams.value = new URLSearchParams();
    engine.reset();
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

    expect(screen.getByText(COUNTRY_US.tracks[0].name)).toBeDefined();
    expect(replaceState).not.toHaveBeenCalled();
  });

  test("falls back to defaultCountryCode and writes it to the URL when ?cc= is absent", () => {
    render(<ChartScreen charts={CHARTS} defaultCountryCode={CODE_US} />);

    expect(screen.getByText(COUNTRY_US.tracks[0].name)).toBeDefined();
    expect(replaceState).toHaveBeenCalledWith(null, "", `?cc=${CODE_US}`);
  });

  test("falls back to defaultCountryCode for an invalid ?cc=", () => {
    mockSearchParams.value = new URLSearchParams("cc=xx");

    render(<ChartScreen charts={CHARTS} defaultCountryCode={CODE_US} />);

    expect(screen.getByText(COUNTRY_US.tracks[0].name)).toBeDefined();
    expect(replaceState).toHaveBeenCalledWith(null, "", `?cc=${CODE_US}`);
  });

  test("canonicalizes an uppercase ?cc= in the URL", () => {
    mockSearchParams.value = new URLSearchParams(`cc=${CODE_US.toUpperCase()}`);

    render(<ChartScreen charts={CHARTS} defaultCountryCode={CODE_BR} />);

    expect(screen.getByText(COUNTRY_US.tracks[0].name)).toBeDefined();
    expect(replaceState).toHaveBeenCalledWith(null, "", `?cc=${CODE_US}`);
  });

  test("does not autoplay on the initial load", () => {
    mockSearchParams.value = new URLSearchParams(`cc=${CODE_US}`);

    render(<ChartScreen charts={CHARTS} defaultCountryCode={CODE_BR} />);

    expect(engine.play).not.toHaveBeenCalled();
  });

  test("autoplays the landed country's top track on a selection change", () => {
    mockSearchParams.value = new URLSearchParams(`cc=${CODE_US}`);
    const { rerender } = render(
      <ChartScreen charts={CHARTS} defaultCountryCode={CODE_BR} />,
    );

    mockSearchParams.value = new URLSearchParams(`cc=${CODE_BR}`);
    rerender(<ChartScreen charts={CHARTS} defaultCountryCode={CODE_BR} />);

    const expected = pickAutoplayTrack(COUNTRY_BR);
    if (!expected) throw new Error("fixture BR has no playable top track");
    expect(engine.play).toHaveBeenCalledTimes(1);
    expect(engine.src).toBe(expected.previewUrl);
  });

  test("does not autoplay over a track that is already playing", () => {
    mockSearchParams.value = new URLSearchParams(`cc=${CODE_US}`);
    const { rerender } = render(
      <ChartScreen charts={CHARTS} defaultCountryCode={CODE_BR} />,
    );

    mockSearchParams.value = new URLSearchParams(`cc=${CODE_BR}`);
    rerender(<ChartScreen charts={CHARTS} defaultCountryCode={CODE_BR} />);

    mockSearchParams.value = new URLSearchParams(`cc=${CODE_KR}`);
    rerender(<ChartScreen charts={CHARTS} defaultCountryCode={CODE_BR} />);

    expect(engine.play).toHaveBeenCalledTimes(1);
  });

  test("does not autoplay over a deliberately paused track", () => {
    const top = pickAutoplayTrack(COUNTRY_BR);
    if (!top) throw new Error("fixture BR has no playable top track");
    mockSearchParams.value = new URLSearchParams(`cc=${CODE_US}`);
    const { rerender } = render(
      <ChartScreen charts={CHARTS} defaultCountryCode={CODE_BR} />,
    );

    mockSearchParams.value = new URLSearchParams(`cc=${CODE_BR}`);
    rerender(<ChartScreen charts={CHARTS} defaultCountryCode={CODE_BR} />);
    fireEvent.click(
      screen.getByRole("button", { name: `Pause preview of ${top.name}` }),
    );

    mockSearchParams.value = new URLSearchParams(`cc=${CODE_KR}`);
    rerender(<ChartScreen charts={CHARTS} defaultCountryCode={CODE_BR} />);

    expect(engine.play).toHaveBeenCalledTimes(1);
  });
});
