# ADR-0005: Milestone-driven semver Versions, replacing Phase milestones

**Status:** Accepted (2026-06-12)

## Context

PRs #85 and #86 (2026-06-10/11) pinned a roadmap model: a GitHub milestone tracks a **Phase** (a global counter that never resets across Versions, notated `V2/Phase 7`), while a **Version** is a separate semver release tagged `vMAJOR.MINOR.0`. The stated reason for keeping Phase as the planning unit: the app is continuously deployed with no release artifact, so a semver-patch release cadence is unfit.

Adopting the GitHub-conventions model from `pr-review-agent` (a reference repo whose roadmap conventions we follow: milestone-driven releases, a single roadmap tracking issue, vertical-slice issues, annotated semver tags) and inspecting that repo's live state surfaced two facts the earlier decision missed:

1. **A Phase and a "minor version" are the same object**: a themed batch of issues that ships together and is closed with one annotated tag. Naming each batch both `Phase N` (milestone) and `vN.x` (tag) is redundant, the exact anti-pattern the conventions warn against.
2. **`pr-review-agent` itself ran this migration**: its `phase-0`…`phase-6` tags are frozen as pre-1.0 history, and its milestones are now semver versions (`v0.2.2`, `v0.2.3`, `v0.3.0`). It keeps the initiative name decoupled from the version number: `[PRD] V2` ships across several plain-semver milestones.

The only load-bearing part of the #85/#86 reasoning (no release artifact) argues against a **patch** cadence specifically, not against version milestones. At minor granularity the objection dissolves: one themed batch is one minor bump.

## Decision

Milestones name semver Versions, not Phases. The initiative name is decoupled from the version number.

- A GitHub **milestone** names a Version (`v1.1.0`, `v2.0.0`, …) or the permanent **`backlog`** (later/optional work, no due date). It holds the open issues planned for that cut.
- The **Version number follows the actual change type**: an additive batch bumps the minor (`v1.1.0`), a breaking change bumps the major (`v2.0.0`), and the patch digit stays unused outside genuine hotfixes (continuous deployment, no fix-release cadence).
- **Initiative names** (V1, V2, …) are informal scope titles used for PRDs (`[PRD] V2: …`), decoupled from the Version number. An initiative may ship across more than one Version. "V2" is not bound to `v2.0.0`.
- `phase-1`…`phase-6` tags and the closed `Phase 2`…`Phase 6` milestones are **frozen as pre-1.0 history**. No new Phases are opened.
- **Cut checklist** per Version: a `chore: release vX.Y.Z` PR bumps `package.json`; CI-gated squash merge; an annotated `vX.Y.Z` tag at the release commit (the immutable record); a GitHub Release with theme-grouped notes; close the milestone; promote deferred `backlog` items into the next Version; update the roadmap tracking issue (#88), which is the single source of truth for priorities and the dependency graph.

This supersedes the roadmap model in #85/#86; no ADR was written then, so this record carries both the model and the reversal.

## Consequences

**Positive**

- One name per batch: milestone == tag == Release. The Phase-to-version translation at every cut is gone.
- Aligns Sounds Abroad with the `pr-review-agent` conventions and its live model, so one mental model spans both repos.
- Standard semver is legible to any contributor, which matters for a public repo.

**Negative**

- Reverses #85/#86 two days after they landed. Accepted: the redundancy is a real defect, and sunk cost is not a reason to keep it.
- The global "project arc" counter (Phase 7, 8, …) is lost; batches reset per major (`v2.0.0`, `v2.1.0`, then `v3.0.0`). The build-log traverses Versions, not Phases, so it does not depend on the lost counter.

**Neutral**

- `phase-1`…`phase-6` tags and the closed Phase milestones remain as history; only the forward model changes.
- The CONTEXT.md Roadmap glossary is rewritten in the same change to match.
- `package.json` is `1.0.0` (V1, tagged `v1.0.0` at the launch commit). Post-launch commits on `main` are unreleased until the next Version sweeps them up.
