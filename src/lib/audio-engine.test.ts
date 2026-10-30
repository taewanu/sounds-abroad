import { afterEach, expect, test, vi } from "vitest";

import { createBrowserAudioEngine } from "./audio-engine";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test("volume is not adjustable where the element matches :volume-locked", () => {
  vi.spyOn(Element.prototype, "matches").mockImplementation(
    (selector) => selector === ":volume-locked",
  );

  expect(createBrowserAudioEngine().volumeAdjustable).toBe(false);
});

test("volume is adjustable where the element does not match :volume-locked", () => {
  vi.spyOn(Element.prototype, "matches").mockReturnValue(false);

  expect(createBrowserAudioEngine().volumeAdjustable).toBe(true);
});

test("volume is adjustable where the selector does not parse", () => {
  vi.spyOn(Element.prototype, "matches").mockImplementation(() => {
    throw new DOMException("':volume-locked' is not valid", "SyntaxError");
  });

  expect(createBrowserAudioEngine().volumeAdjustable).toBe(true);
});

test("an unexpected failure reading the lock is not swallowed", () => {
  const failure = new TypeError("unexpected");
  vi.spyOn(Element.prototype, "matches").mockImplementation(() => {
    throw failure;
  });

  expect(() => createBrowserAudioEngine()).toThrow(failure);
});

test("setVolume writes the element's own volume", () => {
  const setVolume = vi.spyOn(HTMLMediaElement.prototype, "volume", "set");
  const level = 0.4;

  createBrowserAudioEngine().setVolume(level);

  expect(setVolume).toHaveBeenCalledWith(level);
});

test("playback never constructs an AudioContext", async () => {
  const AudioContext = vi.fn();
  vi.stubGlobal("AudioContext", AudioContext);
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);

  await createBrowserAudioEngine().play();

  expect(AudioContext).not.toHaveBeenCalled();
});
