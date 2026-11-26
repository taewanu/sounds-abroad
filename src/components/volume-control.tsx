'use client';

import { type CSSProperties, type PointerEvent, useRef } from 'react';

import { VolumeIcon } from '@/components/icons/volume';
import { VolumeMuteIcon } from '@/components/icons/volume-mute';
import { IconButton, IconToggle } from '@/components/ui/icon-button';
import { Popover } from '@/components/ui/popover';
import { useAudioStore } from '@/providers/audio-store-provider';

/** The mute toggle alone, for where the level belongs to the hardware buttons. */
export function MuteButton() {
  const muted = useAudioStore((s) => s.muted);
  const setMuted = useAudioStore((s) => s.setMuted);
  const Icon = muted ? VolumeMuteIcon : VolumeIcon;

  return (
    <IconToggle
      pressed={muted}
      onPressedChange={setMuted}
      aria-label={muted ? 'Unmute' : 'Mute'}
      className="text-fg-2 hover:bg-orbit hover:text-fg-1"
    >
      <Icon className="h-[18px] w-[18px]" />
    </IconToggle>
  );
}

// The popover's React parent is the mini-player's swipe surface, and React
// events bubble through portals, so a press here would otherwise read as a swipe.
function stopSwipe(event: PointerEvent) {
  event.stopPropagation();
}

export function VolumeControl() {
  const volume = useAudioStore((s) => s.volume);
  const setVolume = useAudioStore((s) => s.setVolume);
  const muted = useAudioStore((s) => s.muted);
  const setMuted = useAudioStore((s) => s.setMuted);
  const sliderRef = useRef<HTMLInputElement>(null);

  const percent = Math.round(volume * 100);
  const Icon = muted || volume === 0 ? VolumeMuteIcon : VolumeIcon;

  // Raising the level is a request to hear it, so it lifts a mute.
  function applyVolume(value: number) {
    setVolume(value);
    if (muted && value > 0) setMuted(false);
  }

  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label="Volume"
        render={
          <IconButton className="text-fg-2 hover:bg-orbit hover:text-fg-1 data-[popup-open]:bg-orbit data-[popup-open]:text-fg-1" />
        }
      >
        <Icon className="h-[18px] w-[18px]" />
      </Popover.Trigger>
      <Popover.Portal>
        {/* Invisible and above every layer, the tour's z-60 included, so the
            tap that dismisses lands here and never presses the control underneath. */}
        <Popover.Backdrop
          data-testid="volume-backdrop"
          onPointerDown={stopSwipe}
          className="fixed inset-0 z-[70]"
        />
        <Popover.Positioner side="top" align="end" sideOffset={8} className="z-[70]">
          <Popover.Popup
            aria-label="Volume"
            initialFocus={sliderRef}
            onPointerDown={stopSwipe}
            className="flex w-44 items-center gap-2.5 rounded-xl border border-fg-1/10 bg-atmos px-3 py-2.5 shadow-md"
          >
            <IconToggle
              size="sm"
              pressed={muted}
              onPressedChange={setMuted}
              aria-label={muted ? 'Unmute' : 'Mute'}
              className="text-fg-2 hover:text-fg-1"
            >
              <Icon className="h-4 w-4" />
            </IconToggle>
            <input
              ref={sliderRef}
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(event) => applyVolume(event.target.valueAsNumber)}
              aria-label="Volume"
              aria-valuetext={`${percent}%`}
              className="volume-slider w-full focus-ring"
              style={{ '--vol-fill': `${percent}%` } as CSSProperties}
            />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
