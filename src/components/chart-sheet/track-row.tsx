"use client";

import { AppleMusicIcon } from "@/components/icons/apple-music";
import { SpotifyIcon } from "@/components/icons/spotify";
import type { Track } from "@/lib/chart-schema";
import { useAudioStore } from "@/providers/audio-store-provider";

export interface TrackRowProps {
  track: Track;
}

export function TrackRow({ track }: TrackRowProps) {
  const isPlaying = useAudioStore(
    (s) => s.isPlaying && s.currentTrack?.previewUrl === track.previewUrl,
  );
  const hasError = useAudioStore(
    (s) => s.lastError?.previewUrl === track.previewUrl,
  );
  const toggle = useAudioStore((s) => s.toggle);

  const hasPreview = track.previewUrl !== null;
  const isFirst = track.rank === 1;

  return (
    <li
      data-playing={isPlaying || undefined}
      data-disabled={!hasPreview || undefined}
      className="hover:bg-atmos data-[playing]:bg-atmos flex items-center gap-[14px] rounded-[14px] px-3 py-2.5 transition-colors duration-200 data-[disabled]:opacity-40 data-[disabled]:hover:bg-transparent data-[playing]:shadow-[inset_0_0_0_1px_rgba(255,107,71,0.3),_0_0_16px_rgba(255,107,71,0.15)]"
    >
      <button
        type="button"
        disabled={!hasPreview}
        onClick={() => toggle(track)}
        aria-label={`${isPlaying ? "Pause" : "Play"} preview of ${track.name} by ${track.artist}`}
        className="focus-visible:outline-aurora flex flex-1 items-center gap-[14px] text-left transition-transform duration-150 ease-[var(--ease-spring)] focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.97] disabled:pointer-events-none"
      >
        <span
          className={`font-display text-rank w-8 shrink-0 text-center leading-none italic tabular-nums ${
            isFirst ? "text-gold" : "text-fg-2"
          }`}
        >
          {track.rank}
        </span>
        <div
          aria-hidden="true"
          style={{ backgroundImage: `url(${track.artworkUrl})` }}
          className="bg-fg-1/5 h-12 w-12 shrink-0 rounded-lg bg-cover bg-center shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
        />
        <div className="min-w-0 flex-1">
          <p className="text-fg-1 text-body flex min-w-0 items-center gap-2 font-medium">
            <span className="truncate">{track.name}</span>
            {isPlaying && (
              <span className="eq shrink-0" aria-hidden>
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
      <div className="flex shrink-0 gap-1">
        <a
          href={track.appleUrl}
          rel="noreferrer"
          aria-label={`Open ${track.name} in Apple Music`}
          className="text-fg-2 hover:bg-orbit hover:text-fg-1 focus-visible:outline-aurora flex h-8 w-8 items-center justify-center rounded-full transition-all duration-150 ease-[var(--ease-spring)] focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.97]"
        >
          <AppleMusicIcon className="h-3.5 w-3.5" />
        </a>
        <a
          href={track.spotifySearchUrl}
          rel="noreferrer"
          aria-label={`Search ${track.name} on Spotify`}
          className="text-fg-2 hover:bg-orbit hover:text-fg-1 focus-visible:outline-aurora flex h-8 w-8 items-center justify-center rounded-full transition-all duration-150 ease-[var(--ease-spring)] focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.97]"
        >
          <SpotifyIcon className="h-3.5 w-3.5" />
        </a>
      </div>
    </li>
  );
}
