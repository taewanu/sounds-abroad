"use client";

import { GemIcon } from "@/components/icons/gem";
import { PauseIcon } from "@/components/icons/pause";
import { PlayIcon } from "@/components/icons/play";
import type { Track } from "@/lib/chart-schema";
import { GEM_TIER_STRENGTH, type GemTier } from "@/lib/select-gem";
import { sameTrack } from "@/lib/track-identity";
import { useAudioStore } from "@/providers/audio-store-provider";

import { TrackCommentary } from "./track-commentary";

export interface GemCardProps {
  track: Track;
  tier: GemTier;
  countryCode: string;
}

// A three-dot strength meter standing next to the tier label so the three
// tiers read apart by shape, not only by wording or color.
function TierDots({ tier }: { tier: GemTier }) {
  const lit = GEM_TIER_STRENGTH[tier];
  return (
    <span aria-hidden className="flex shrink-0 items-center gap-0.5">
      {[1, 2, 3].map((dot) => (
        <span
          key={dot}
          data-lit={dot <= lit || undefined}
          className={`h-1 w-1 rounded-full ${dot <= lit ? "bg-fg-1" : "bg-fg-1/15"}`}
        />
      ))}
    </span>
  );
}

// The "local gem" hero card: the play row mirrors TrackRow's (same store
// reads, same toggle call) so a tap here behaves identically to tapping a
// ranked row, with the tier label standing in for the rank number.
export function GemCard({ track, tier, countryCode }: GemCardProps) {
  const isCurrent = useAudioStore(
    (s) =>
      sameTrack(s.currentTrack, track) && s.currentCountryCode === countryCode,
  );
  const isPlaying = useAudioStore(
    (s) =>
      s.isPlaying &&
      sameTrack(s.currentTrack, track) &&
      s.currentCountryCode === countryCode,
  );
  const hasError = useAudioStore(
    (s) => s.lastError?.previewUrl === track.previewUrl,
  );
  const toggle = useAudioStore((s) => s.toggle);

  const hasPreview = track.previewUrl !== null;
  const commentary = track.commentary ?? null;

  return (
    <section
      aria-label="Local Gem"
      className="border-fg-1/10 bg-atmos mb-3 flex flex-col rounded-lg border px-3 py-2.5"
    >
      <button
        type="button"
        disabled={!hasPreview}
        onClick={() => toggle(track, countryCode)}
        aria-label={`${isPlaying ? "Pause" : "Play"} the Local Gem, ${track.name} by ${track.artist}`}
        className="focus-visible:outline-aurora flex min-w-0 items-center gap-[14px] text-left transition-transform duration-150 ease-[var(--ease-spring)] focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.97] disabled:pointer-events-none"
      >
        <span className="text-fg-3 text-body flex w-7 shrink-0 items-center justify-center">
          {isPlaying ? (
            <PauseIcon className="text-sunrise h-4 w-4" />
          ) : (
            <PlayIcon
              className={`h-4 w-4 ${isCurrent ? "text-sunrise" : "text-fg-3"}`}
            />
          )}
        </span>
        <div
          aria-hidden="true"
          style={{ backgroundImage: `url(${track.artworkUrl})` }}
          className="bg-fg-1/5 h-12 w-12 shrink-0 rounded-lg bg-cover bg-center shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
        />
        <div className="min-w-0 flex-1">
          <p className="text-gold text-micro mb-0.5 flex items-center gap-1.5 font-medium tracking-wide uppercase">
            <GemIcon className="h-3.5 w-3.5 shrink-0" />
            Local Gem
          </p>
          <p className="text-fg-2 text-small mb-0.5 flex min-w-0 items-center gap-1.5">
            <TierDots tier={tier} />
            <span className="min-w-0 truncate">{tier}</span>
          </p>
          <p
            className={`text-body truncate font-medium ${
              isCurrent ? "text-sunrise" : "text-fg-1"
            }`}
          >
            {track.name}
            {isCurrent && (
              <span
                className="eq ml-2 inline-flex align-middle"
                data-paused={!isPlaying || undefined}
                aria-hidden
              >
                <span />
                <span />
                <span />
              </span>
            )}
          </p>
          <p className="text-fg-2 text-small truncate">
            {hasPreview ? track.artist : `No preview · ${track.artist}`}
          </p>
          {hasError && (
            <p className="text-error text-micro mt-1">
              Preview unavailable, try another track
            </p>
          )}
        </div>
      </button>
      {commentary ? <TrackCommentary commentary={commentary} /> : null}
    </section>
  );
}
