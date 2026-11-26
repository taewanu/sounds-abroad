'use client';

import { type CSSProperties, useEffect, useRef, useState } from 'react';

import { VolumeIcon } from '@/components/icons/volume';
import { VolumeMuteIcon } from '@/components/icons/volume-mute';
import { IconButton, IconToggle } from '@/components/ui/icon-button';
import { ESCAPE_LAYER, useEscapeLayer } from '@/components/use-escape-layer';
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

export function VolumeControl() {
  const volume = useAudioStore((s) => s.volume);
  const setVolume = useAudioStore((s) => s.setVolume);
  const muted = useAudioStore((s) => s.muted);
  const setMuted = useAudioStore((s) => s.setMuted);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const sliderRef = useRef<HTMLInputElement>(null);
  // While open, dismiss on an outside click; opening focuses the slider so arrow
  // keys adjust it immediately.
  useEffect(() => {
    if (!open) return;
    sliderRef.current?.focus();

    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current?.contains(event.target as Node)) return;
      // Dismiss-first: the tap that closes the popover must not also fire the
      // control it landed on. Caught in the capture phase, it's swallowed before
      // it reaches any onClick.
      event.stopPropagation();
      event.preventDefault();
      setOpen(false);
    }
    document.addEventListener('click', handleClickOutside, true);
    return () => {
      document.removeEventListener('click', handleClickOutside, true);
    };
  }, [open]);

  // Keyboard focus landing outside closes the popover, while pointer focus waits
  // for the click handler above to close it and swallow that click.
  useEffect(() => {
    if (!open) return;

    function handleFocusIn(event: FocusEvent) {
      const target = event.target as Element;
      if (wrapperRef.current?.contains(target)) return;
      if (!target.matches(':focus-visible')) return;
      setOpen(false);
    }
    document.addEventListener('focusin', handleFocusIn);
    return () => document.removeEventListener('focusin', handleFocusIn);
  }, [open]);

  useEscapeLayer(open, ESCAPE_LAYER.popover, () => {
    setOpen(false);
    buttonRef.current?.focus();
  });

  const percent = Math.round(volume * 100);
  const Icon = muted || volume === 0 ? VolumeMuteIcon : VolumeIcon;

  // Raising the level is a request to hear it, so it lifts a mute.
  function applyVolume(value: number) {
    setVolume(value);
    if (muted && value > 0) setMuted(false);
  }

  return (
    <div ref={wrapperRef} className="relative shrink-0">
      <IconButton
        ref={buttonRef}
        onClick={() => setOpen((isOpen) => !isOpen)}
        aria-label="Volume"
        aria-expanded={open}
        aria-controls="mini-player-volume"
        className={open ? 'bg-orbit text-fg-1' : 'text-fg-2 hover:bg-orbit hover:text-fg-1'}
      >
        <Icon className="h-[18px] w-[18px]" />
      </IconButton>
      {open ? (
        <div
          id="mini-player-volume"
          // The popover sits inside the mini-player's swipe surface, so a slider
          // drag would otherwise read as a swipe and skip the track.
          onPointerDown={(event) => event.stopPropagation()}
          className="absolute right-0 bottom-[calc(100%+8px)] z-10 flex w-44 items-center gap-2.5 rounded-xl border border-fg-1/10 bg-atmos px-3 py-2.5 shadow-md"
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
        </div>
      ) : null}
    </div>
  );
}
