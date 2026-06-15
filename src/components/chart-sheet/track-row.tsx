"use client";

import { Fragment, useId, useState } from "react";

import { AppleMusicIcon } from "@/components/icons/apple-music";
import { ChevronDownIcon } from "@/components/icons/chevron-down";
import { PauseIcon } from "@/components/icons/pause";
import { PlayIcon } from "@/components/icons/play";
import { SpotifyIcon } from "@/components/icons/spotify";
import { useOverflowMarquee } from "@/components/use-overflow-marquee";
import type { Track } from "@/lib/chart-schema";
import { useAudioStore } from "@/providers/audio-store-provider";

// Cited sources show as bare hostnames; drop a leading www. for scannability.
const WWW_PREFIX = /^www\./;
function sourceLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(WWW_PREFIX, "");
  } catch {
    return url;
  }
}

export interface TrackRowProps {
  track: Track;
  countryCode: string;
}

export function TrackRow({ track, countryCode }: TrackRowProps) {
  const isCurrent = useAudioStore(
    (s) =>
      s.currentTrack?.previewUrl === track.previewUrl &&
      s.currentCountryCode === countryCode,
  );
  const isPlaying = useAudioStore(
    (s) =>
      s.isPlaying &&
      s.currentTrack?.previewUrl === track.previewUrl &&
      s.currentCountryCode === countryCode,
  );
  const hasError = useAudioStore(
    (s) => s.lastError?.previewUrl === track.previewUrl,
  );
  const toggle = useAudioStore((s) => s.toggle);
  const pause = useAudioStore((s) => s.pause);

  const hasPreview = track.previewUrl !== null;
  const state = isCurrent ? (isPlaying ? "playing" : "paused") : undefined;

  // The current track always scrolls; a hovered row scrolls on pointer devices.
  const [hovered, setHovered] = useState(false);
  const {
    ref: titleRef,
    active: titleScrolling,
    style: titleStyle,
  } = useOverflowMarquee<HTMLSpanElement>({
    enabled: isCurrent || hovered,
    text: track.name,
  });

  // Expand is per-row presentational state, so it stays local rather than in
  // the audio store.
  const commentary = track.commentary ?? null;
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();

  return (
    <li
      data-rank={track.rank}
      data-state={state}
      data-disabled={!hasPreview || undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="hover:bg-atmos data-[state]:bg-sunrise/[0.08] data-[state]:hover:bg-sunrise/[0.15] flex flex-col rounded-[14px] px-3 py-2.5 transition-colors duration-200 data-[disabled]:opacity-40 data-[disabled]:hover:bg-transparent"
    >
      <div className="flex items-center gap-[14px]">
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
              <span className="block min-w-0 overflow-hidden">
                <span
                  ref={titleRef}
                  className="marquee-track"
                  data-marquee={titleScrolling || undefined}
                  style={titleStyle}
                >
                  {track.name}
                </span>
              </span>
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
            onClick={() => pause()}
            aria-label={`Open ${track.name} in Apple Music`}
            className="hover:bg-orbit focus-visible:outline-aurora flex h-8 w-8 items-center justify-center rounded-full transition-all duration-150 ease-[var(--ease-spring)] focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.97]"
          >
            <AppleMusicIcon className="h-3.5 w-3.5" />
          </a>
          <a
            href={track.spotifySearchUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => pause()}
            aria-label={`Search ${track.name} on Spotify`}
            className="hover:bg-orbit focus-visible:outline-aurora flex h-8 w-8 items-center justify-center rounded-full transition-all duration-150 ease-[var(--ease-spring)] focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.97]"
          >
            <SpotifyIcon className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
      {commentary ? (
        <div className="border-fg-1/10 mt-2.5 border-t pt-2.5">
          <button
            type="button"
            onClick={() => setExpanded((open) => !open)}
            aria-expanded={expanded}
            aria-controls={panelId}
            className="focus-visible:outline-aurora flex w-full items-center gap-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {commentary.tag ? (
              <span className="bg-fg-1/5 text-fg-3 text-micro rounded-pill shrink-0 px-2 py-0.5">
                {commentary.tag}
              </span>
            ) : null}
            <span className="text-fg-2 text-small line-clamp-2 min-w-0 flex-1">
              {commentary.lead}
            </span>
            <ChevronDownIcon
              data-expanded={expanded || undefined}
              className="text-fg-3 h-4 w-4 shrink-0 transition-transform duration-200 ease-[var(--ease-out)] data-[expanded]:rotate-180 motion-reduce:transition-none"
            />
          </button>
          <div
            id={panelId}
            inert={!expanded}
            data-expanded={expanded || undefined}
            className="max-h-0 overflow-hidden transition-[max-height] duration-300 ease-[var(--ease-out)] data-[expanded]:max-h-96 motion-reduce:transition-none"
          >
            <div className="flex flex-col gap-2 pt-2">
              {commentary.detail ? (
                <p className="text-fg-2 text-small leading-relaxed">
                  {commentary.detail}
                </p>
              ) : null}
              <div className="text-fg-3 text-micro flex flex-wrap items-center gap-y-1">
                {commentary.sources.map((url, i) => (
                  <Fragment key={url}>
                    {i > 0 ? (
                      <span aria-hidden className="text-fg-4 mx-2">
                        ·
                      </span>
                    ) : null}
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-fg-1 focus-visible:outline-aurora underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
                    >
                      {sourceLabel(url)}
                    </a>
                  </Fragment>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </li>
  );
}
