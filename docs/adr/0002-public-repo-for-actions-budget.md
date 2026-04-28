# ADR-0002: Public GitHub repo to unlock free Actions minutes

**Status:** Accepted (2026-04-28)

## Context

Phase 2's data pipeline runs a GitHub Actions cron four times per day. Each run crawls Apple Music RSS (40 country charts) and resolves preview URLs via the iTunes Search API. The Search API rate-limits at ~20 requests/min/IP, which means 1,000 tracks (40 countries × 25 ranks) take roughly 50 minutes per run.

- 50 min × 4 runs/day × 30 days = **6,000 minutes/month**.
- GitHub's free tier for **private** repos is **2,000 minutes/month** — we'd blow through it in less than two weeks.
- Free tier for **public** repos is **unlimited Actions minutes**.

Visibility considerations:

- This is a personal portfolio project, deliberately built to be shown.
- No proprietary code, no secrets-in-history (`.env*` is gitignored, secrets go in GitHub Secrets).
- Public visibility increases scrutiny of commits — already mitigating via clean commit messages and no AI-tool trailers.

## Decision

Make the repository **public** at `github.com/taewanu/sounds-abroad`.

- Secrets stored in GitHub Secrets (never committed).
- Commit hygiene: no AI-tool trailers, no auto-generated process noise.
- Plan and ADR docs are committed (portfolio signal of process and reasoning).

## Consequences

**Positive**

- Unlimited GitHub Actions minutes — the data pipeline runs at the chosen cadence (4×/day) without budget anxiety, and the schedule can scale up to 12×/day if Apple's chart cycle warrants it (TBD after Phase 2 monitoring).
- Portfolio benefit: external readers can see commit history, ADRs, plans.
- No cost to host source code.

**Negative**

- All future commits and code are public from day one — no private experimentation in this repo.
- Any leaked secret has a wider blast radius (mitigated by gitignored `.env*` + GitHub Secrets, but still a real risk).

**Reversal cost**

- Switching to private later forfeits the free Actions budget and forces a cron re-design or paid plan; in practice this would mean reducing crawl frequency or moving the crawler off GitHub Actions (e.g. to a Vercel cron, fly.io, or a self-hosted runner).
