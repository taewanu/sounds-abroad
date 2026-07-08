import { createSeenFlag } from "@/lib/create-seen-flag";

// First-run gate for the onboarding tour, persisted across sessions (unlike the
// per-session visited set). The commentary hint subscribes to this flag so it
// can arm once the tour is dismissed mid-session, not just at its own mount.
export const tourSeen = createSeenFlag("sounds-abroad:tour-seen:v1");
