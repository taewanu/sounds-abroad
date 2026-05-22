"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";

import { ChartSheet, type SnapState } from "@/components/chart-sheet/sheet";
import { ChartPickStore } from "@/lib/chart-pick-store";
import type { ChartFile } from "@/lib/chart-schema";
import { COUNTRIES } from "@/lib/countries";
import { AudioStoreProvider } from "@/providers/audio-store-provider";

const ALL_CODES = COUNTRIES.map((c) => c.code);

function validateUrlCode(raw: string | null): string | null {
  if (raw === null) return null;
  const lower = raw.toLowerCase();
  return ALL_CODES.includes(lower) ? lower : null;
}

export interface ChartScreenProps {
  charts: ChartFile;
  rng?: () => number;
}

export function ChartScreen({ charts, rng = Math.random }: ChartScreenProps) {
  const searchParams = useSearchParams();
  const validUrlCc = validateUrlCode(searchParams.get("cc"));

  const store = useMemo(() => new ChartPickStore(), []);
  const pick = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );

  useEffect(() => {
    if (validUrlCc !== null) return;
    store.initIfNeeded(ALL_CODES, rng);
  }, [store, validUrlCc, rng]);

  const [snap, setSnap] = useState<SnapState>("peek");

  const code = validUrlCc ?? pick.code ?? null;
  const country = code !== null ? (charts.countries[code] ?? null) : null;

  if (country === null) return null;

  return (
    <AudioStoreProvider>
      <ChartSheet country={country} snap={snap} onSnapChange={setSnap} />
    </AudioStoreProvider>
  );
}
