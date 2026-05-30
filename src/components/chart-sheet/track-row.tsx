"use client";

import { AppleMusicIcon } from "@/components/icons/apple-music";
import { PauseIcon } from "@/components/icons/pause";
import { PlayIcon } from "@/components/icons/play";
import { SpotifyIcon } from "@/components/icons/spotify";
import type { Track } from "@/lib/chart-schema";
import { useAudioStore } from "@/providers/audio-store-provider";

export interface TrackRowProps {
  track: Track;
  countryCode: string;
}

export function TrackRow({ track, countryCode }: TrackRowProps) {
  const isCurrent = useAudioStore(
    (s) => s.currentTrack?.previewUrl === track.previewUrl,
  );
  const isPlaying = useAudioStore(
    (s) => s.isPlaying && s.currentTrack?.previewUrl === track.previewUrl,
  );
  const hasError = useAudioStore(
    (s) => s.lastError?.previewUrl === track.previewUrl,
  );
  const toggle = useAudioStore((s) => s.toggle);

  const hasPreview = track.previewUrl !== null;
  const state = isCurrent ? (isPlaying ? "playing" : "paused") : undefined;

  return (
    <li
      data-rank={track.rank}
      data-state={state}
      data-disabled={!hasPreview || undefined}
      className="hover:bg-atmos data-[state]:bg-sunrise/[0.08] data-[state]:hover:bg-sunrise/[0.15] flex items-center gap-[14px] rounded-[14px] px-3 py-2.5 transition-colors duration-200 data-[disabled]:opacity-40 data-[disabled]:hover:bg-transparent"
    >
      <button
        type="button"
        disabled={!hasPreview}
        onClick={() => toggle(track, countryCode)}
        aria-label={`${isPlaying ? "Pause" : "Play"} preview of ${track.name} by ${track.artist}`}
        className="focus-visible:outline-aurora flex min-w-0 flex-1 items-center gap-[14px] text-left transition-transform duration-150 ease-[var(--ease-spring)] focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.97] disabled:pointer-events-none"
      >
        <span className="text-fg-3 text-body flex w-7 shrink-0 items-center justify-center font-mono tabular-nums">
          {isCurrent ? (
            isPlaying ? (
              <PauseIcon className="text-sunrise h-4 w-4" />
            ) : (
              <PlayIcon className="text-sunrise h-4 w-4" />
            )
          ) : (
            track.rank
          )}
        </span>
        <div
          aria-hidden="true"
          style={{ backgroundImage: `url(${track.artworkUrl})` }}
          className="bg-fg-1/5 h-12 w-12 shrink-0 rounded-lg bg-cover bg-center shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
        />
        <div className="min-w-0 flex-1">
          <p
            className={`text-body flex min-w-0 items-center gap-2 font-medium ${
              isCurrent ? "text-sunrise" : "text-fg-1"
            }`}
          >
            <span className="truncate">{track.name}</span>
            {isCurrent && (
              <span
                className="eq shrink-0"
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
      <div className="flex shrink-0 gap-1">
        <a
          href={track.appleUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open ${track.name} in Apple Music`}
          className="text-fg-2 hover:bg-orbit hover:text-fg-1 focus-visible:outline-aurora flex h-8 w-8 items-center justify-center rounded-full transition-all duration-150 ease-[var(--ease-spring)] focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.97]"
        >
          <AppleMusicIcon className="h-3.5 w-3.5" />
        </a>
        <a
          href={track.spotifySearchUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Search ${track.name} on Spotify`}
          className="text-fg-2 hover:bg-orbit hover:text-fg-1 focus-visible:outline-aurora flex h-8 w-8 items-center justify-center rounded-full transition-all duration-150 ease-[var(--ease-spring)] focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.97]"
        >
          <SpotifyIcon className="h-3.5 w-3.5" />
        </a>
      </div>
    </li>
  );
}
