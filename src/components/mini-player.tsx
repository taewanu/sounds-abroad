"use client";

import { PauseIcon } from "@/components/icons/pause";
import { PlayIcon } from "@/components/icons/play";
import { useOverflowMarquee } from "@/components/use-overflow-marquee";
import { useAudioStore } from "@/providers/audio-store-provider";

export interface MiniPlayerProps {
  onTap: () => void;
}

export function MiniPlayer({ onTap }: MiniPlayerProps) {
  const currentTrack = useAudioStore((s) => s.currentTrack);
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const toggle = useAudioStore((s) => s.toggle);

  // The now-playing title is always the current track, so it always scrolls.
  const {
    ref: titleRef,
    active: titleScrolling,
    style: titleStyle,
  } = useOverflowMarquee<HTMLSpanElement>({
    enabled: currentTrack !== null,
    text: currentTrack?.name,
  });

  if (currentTrack === null) return null;

  return (
    <div className="bg-void border-fg-1/10 shadow-sheet fixed inset-x-0 bottom-0 z-50 border-t">
      <div className="flex items-center gap-[14px] px-4 pt-3 pb-[max(env(safe-area-inset-bottom),12px)]">
        <button
          type="button"
          onClick={onTap}
          aria-label="Reopen chart"
          className="focus-visible:outline-aurora flex min-w-0 flex-1 items-center gap-[14px] text-left transition-transform duration-150 ease-[var(--ease-spring)] focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.98]"
        >
          <div
            aria-hidden="true"
            style={{ backgroundImage: `url(${currentTrack.artworkUrl})` }}
            className="bg-fg-1/5 h-12 w-12 shrink-0 rounded-lg bg-cover bg-center shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sunrise text-body flex min-w-0 items-center gap-2 font-medium">
              <span className="block min-w-0 overflow-hidden">
                <span
                  ref={titleRef}
                  className="marquee-track"
                  data-marquee={titleScrolling || undefined}
                  style={titleStyle}
                >
                  {currentTrack.name}
                </span>
              </span>
              <span
                className="eq shrink-0"
                data-paused={!isPlaying || undefined}
                aria-hidden
              >
                <span />
                <span />
                <span />
              </span>
            </p>
            <p className="text-fg-2 text-small truncate">
              {currentTrack.artist}
            </p>
          </div>
        </button>
        <button
          type="button"
          onClick={() => toggle(currentTrack)}
          aria-label={
            isPlaying
              ? `Pause preview of ${currentTrack.name}`
              : `Play preview of ${currentTrack.name}`
          }
          className="text-fg-1 hover:bg-orbit focus-visible:outline-aurora flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all duration-150 ease-[var(--ease-spring)] focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.97]"
        >
          {isPlaying ? (
            <PauseIcon className="h-4 w-4" />
          ) : (
            <PlayIcon className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  );
}
