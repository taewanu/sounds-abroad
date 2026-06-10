# Context

Domain glossary for Sounds Abroad. Each term has one project-specific meaning; the _Avoid_ line lists words that blur it. Use these terms as defined when naming concepts in issues, plans, tests, and reviews.

## Roadmap

**Version (V1, V2, V2.1, …)**:
A sequential release scope: what's in scope when the project declares itself done for that release. V1 = the first public launch of the music-discovery app, the scope captured in the V1 handoff doc and delivered across Phases 1 to 6 (there is no single "V1 PRD" issue; the per-Phase PRDs roll up to it). V2 = the post-launch backlog of candidate refinements (full-state sheet body-drag, EQ bars, MediaSession transport controls, lakes overlay). Point releases (V2.1, …) carry follow-on fixes. Architecturally divergent paths (toolchain in ADR 0001, public-repo + cron baseline in ADR 0002) are not a Version by themselves; they are decided in ADRs and land in whichever Version adopts them.
_Avoid_: generation; milestone (a GitHub milestone tracks a Phase, not a Version); reserving V2 as a catch-all "someday" bucket.

**Phase (`phase-1`, `phase-2`, …)**:
A themed band of work on the path to a Version, tracked as a GitHub milestone and closed with an annotated git tag `phase-N`. A Phase bundles the several PRs that share one theme (e.g. `phase-4` = the 3D globe; `phase-5` = globe to sheet integration + V1 launch polish). It is not a single PR and not a time window. Multiple Phases compose into a Version (Phases 1 to 6 compose V1). Phase numbers run as one global counter that never resets across Versions; a Version opens at whatever the next number is (V2 opens at Phase 7). Scope a Phase to its Version with path notation, the container on the left: `V2/Phase 7`, read "Phase 7 within V2".
_Avoid_: stage, iteration, sprint; equating a Phase with a single PR; resetting Phase numbers per Version; the `·` separator, which reads as two co-equal labels rather than containment.
