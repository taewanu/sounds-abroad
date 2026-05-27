"use client";

import type { GeometryCollection, Topology } from "topojson-specification";

import { buildCountryOutlines, type CountryOutlines } from "./country-outlines";

const TOPOLOGY_URL = "/data/countries-50m.json";

export async function loadCountryOutlines(
  url: string = TOPOLOGY_URL,
  sphereRadius = 1,
): Promise<CountryOutlines> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`topo-loader: fetch ${url} failed (${res.status})`);
  }
  const topology = (await res.json()) as Topology<{
    countries: GeometryCollection;
  }>;
  return buildCountryOutlines(topology, sphereRadius);
}

let outlinesPromise: Promise<CountryOutlines | null> | null = null;

export function getCountryOutlinesPromise(): Promise<CountryOutlines | null> {
  outlinesPromise ??= loadCountryOutlines().catch((err: unknown) => {
    console.error("Failed to load country outlines", err);
    outlinesPromise = null;
    return null;
  });
  return outlinesPromise;
}
