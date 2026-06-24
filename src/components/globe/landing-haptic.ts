// Fires a short tactile pulse when the globe lands on a country. Progressive
// enhancement: only devices that expose the Vibration API (Android Chrome) buzz;
// where it is absent (iOS Safari, desktop) this is a silent no-op and the visual
// settle remains the primary landing signal. The vibration motor needs a recent
// user gesture, so a tap or fling buzzes but a programmatic settle on load does
// not — which is the behaviour we want.
const LANDING_PULSE_MS = 10;

type Vibrator = { vibrate: (pattern: number | number[]) => boolean };

const supportsVibration = (
  nav: Navigator | undefined,
): nav is Navigator & Vibrator =>
  typeof nav !== "undefined" && typeof nav.vibrate === "function";

export function triggerLandingHaptic(
  nav: Navigator | undefined = typeof navigator === "undefined"
    ? undefined
    : navigator,
): void {
  if (!supportsVibration(nav)) return;
  nav.vibrate(LANDING_PULSE_MS);
}
