import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import type { AudioEngine } from "@/lib/audio-engine";
import { type AudioState, createAudioStore } from "@/lib/audio-store";
import { AudioStoreContext } from "@/providers/audio-store-provider";

import { VolumeControl } from "./volume-control";

function makeMockAudio(): AudioEngine {
  return {
    src: "",
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    unlock: vi.fn().mockResolvedValue(undefined),
    setVolume: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
}

function renderVolumeControl(init?: Partial<AudioState>) {
  const store = createAudioStore(() => makeMockAudio());
  if (init) {
    store.setState(init);
  }
  const utils = render(
    <AudioStoreContext.Provider value={store}>
      <VolumeControl />
    </AudioStoreContext.Provider>,
  );
  return { ...utils, store };
}

describe("VolumeControl", () => {
  test("renders the trigger and keeps the slider hidden until opened", () => {
    renderVolumeControl();

    expect(screen.getByRole("button", { name: /volume/i })).toBeDefined();
    expect(screen.queryByRole("slider")).toBeNull();
  });

  test("clicking the trigger reveals the slider", () => {
    renderVolumeControl();

    fireEvent.click(screen.getByRole("button", { name: /volume/i }));

    expect(screen.getByRole("slider")).toBeDefined();
    expect(
      screen
        .getByRole("button", { name: /volume/i })
        .getAttribute("aria-expanded"),
    ).toBe("true");
  });

  test("the slider reflects the stored volume", () => {
    renderVolumeControl({ volume: 0.5 });

    fireEvent.click(screen.getByRole("button", { name: /volume/i }));

    expect((screen.getByRole("slider") as HTMLInputElement).value).toBe("0.5");
  });

  test("dragging the slider drives the volume", () => {
    const { store } = renderVolumeControl({ volume: 1 });
    fireEvent.click(screen.getByRole("button", { name: /volume/i }));

    fireEvent.change(screen.getByRole("slider"), { target: { value: "0.3" } });

    expect(store.getState().volume).toBe(0.3);
  });

  test("Escape closes the popover", () => {
    renderVolumeControl();
    fireEvent.click(screen.getByRole("button", { name: /volume/i }));

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("slider")).toBeNull();
  });

  test("a tap outside closes the popover", () => {
    renderVolumeControl();
    fireEvent.click(screen.getByRole("button", { name: /volume/i }));

    fireEvent.pointerDown(document.body);

    expect(screen.queryByRole("slider")).toBeNull();
  });

  test("a second trigger tap closes the popover", () => {
    renderVolumeControl();
    const trigger = screen.getByRole("button", { name: /volume/i });
    fireEvent.click(trigger);

    fireEvent.click(trigger);

    expect(screen.queryByRole("slider")).toBeNull();
  });

  test("the popover includes a mute toggle", () => {
    renderVolumeControl();

    fireEvent.click(screen.getByRole("button", { name: /volume/i }));

    expect(screen.getByRole("button", { name: "Mute" })).toBeDefined();
  });

  test("muting drops the volume to zero", () => {
    const { store } = renderVolumeControl({ volume: 0.6 });
    fireEvent.click(screen.getByRole("button", { name: /volume/i }));

    fireEvent.click(screen.getByRole("button", { name: "Mute" }));

    expect(store.getState().volume).toBe(0);
  });

  test("unmuting restores the level held before muting", () => {
    const { store } = renderVolumeControl({ volume: 0.6 });
    fireEvent.click(screen.getByRole("button", { name: /volume/i }));
    fireEvent.click(screen.getByRole("button", { name: "Mute" }));

    fireEvent.click(screen.getByRole("button", { name: "Unmute" }));

    expect(store.getState().volume).toBe(0.6);
  });
});
