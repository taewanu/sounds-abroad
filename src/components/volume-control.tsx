"use client";

import { type CSSProperties, useEffect, useRef, useState } from "react";

import { VolumeIcon } from "@/components/icons/volume";
import { VolumeMuteIcon } from "@/components/icons/volume-mute";
import { useAudioStore } from "@/providers/audio-store-provider";

export function VolumeControl() {
  const volume = useAudioStore((s) => s.volume);
  const setVolume = useAudioStore((s) => s.setVolume);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const sliderRef = useRef<HTMLInputElement>(null);
  // The level to come back to on unmute; tracks the last audible volume.
  const lastAudibleRef = useRef(volume || 1);

  // While open, dismiss on an outside tap or Escape; Escape returns focus to the
  // trigger. Opening focuses the slider so arrow keys adjust it immediately.
  useEffect(() => {
    if (!open) return;
    sliderRef.current?.focus();

    function handlePointerDown(event: PointerEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  // Mute is gain 0 (the verified path), restoring the prior level on unmute.
  const muted = volume === 0;
  const percent = Math.round(volume * 100);
  const Icon = muted ? VolumeMuteIcon : VolumeIcon;

  // The sole path that writes volume; keeps lastAudibleRef in step.
  function applyVolume(value: number) {
    if (value > 0) lastAudibleRef.current = value;
    setVolume(value);
  }

  function toggleMute() {
    applyVolume(muted ? lastAudibleRef.current : 0);
  }

  return (
    <div ref={wrapperRef} className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((isOpen) => !isOpen)}
        aria-label="Volume"
        aria-expanded={open}
        aria-controls="mini-player-volume"
        className={`focus-visible:outline-aurora flex h-10 w-10 items-center justify-center rounded-full transition-all duration-150 ease-[var(--ease-spring)] focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.97] ${
          open
            ? "bg-orbit text-fg-1"
            : "text-fg-2 hover:bg-orbit hover:text-fg-1"
        }`}
      >
        <Icon className="h-[18px] w-[18px]" />
      </button>
      {open ? (
        <div
          id="mini-player-volume"
          className="border-fg-1/10 bg-atmos absolute right-0 bottom-[calc(100%+8px)] z-10 flex w-44 items-center gap-2.5 rounded-xl border px-3 py-2.5 shadow-md"
        >
          <button
            type="button"
            onClick={toggleMute}
            aria-label={muted ? "Unmute" : "Mute"}
            aria-pressed={muted}
            className="text-fg-2 hover:text-fg-1 focus-visible:outline-aurora flex h-8 w-8 shrink-0 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.97]"
          >
            <Icon className="h-4 w-4" />
          </button>
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
            className="volume-slider w-full"
            style={{ "--vol-fill": `${percent}%` } as CSSProperties}
          />
        </div>
      ) : null}
    </div>
  );
}
