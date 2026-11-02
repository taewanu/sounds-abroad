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

function stubAudioElement(): HTMLAudioElement {
  const element = new Audio();
  vi.stubGlobal(
    "Audio",
    class {
      constructor() {
        return element;
      }
    },
  );
  return element;
}

test("setVolume writes the element's own volume", () => {
  const element = stubAudioElement();
  const level = 0.4;

  createBrowserAudioEngine().setVolume(level);

  expect(element.volume).toBe(level);
});

test("setMuted writes the element's own muted flag", () => {
  const element = stubAudioElement();

  createBrowserAudioEngine().setMuted(true);

  expect(element.muted).toBe(true);
});

test("playback plays the element without constructing an AudioContext", async () => {
  const AudioContext = vi.fn();
  vi.stubGlobal("AudioContext", AudioContext);
  const play = vi
    .spyOn(HTMLMediaElement.prototype, "play")
    .mockResolvedValue(undefined);

  await createBrowserAudioEngine().play();

  expect(play).toHaveBeenCalledOnce();
  expect(AudioContext).not.toHaveBeenCalled();
});
