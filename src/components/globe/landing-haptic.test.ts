import { expect, test, vi } from "vitest";

import { triggerLandingHaptic } from "./landing-haptic";

test("triggerLandingHaptic buzzes once on a device that supports vibration", () => {
  const vibrate = vi.fn(() => true);
  const nav = { vibrate } as unknown as Navigator;

  triggerLandingHaptic(nav);

  expect(vibrate).toHaveBeenCalledTimes(1);
  expect(vibrate).toHaveBeenCalledWith(expect.any(Number));
});

test("triggerLandingHaptic is a no-op when the Vibration API is absent", () => {
  const nav = {} as Navigator;

  expect(() => triggerLandingHaptic(nav)).not.toThrow();
});

test("triggerLandingHaptic is a no-op with no navigator (server render)", () => {
  expect(() => triggerLandingHaptic(undefined)).not.toThrow();
});
