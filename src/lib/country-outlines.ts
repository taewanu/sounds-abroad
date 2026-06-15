import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";

import { COUNTRIES } from "./countries";
import { latLonToVec3 } from "./lat-lon-to-vec3";

export type CountryRings = [number, number][][];

export interface CountryOutlines {
  tier1Positions: Float32Array;
  tier2Positions: Float32Array;
  byIso: Map<number, Float32Array>;
  byIsoRings: Map<number, CountryRings>;
}

const CHART_COUNTRY_ISO_NUMS = new Set(COUNTRIES.map((c) => c.isoNum));

export function buildCountryOutlines(
  topology: Topology<{ countries: GeometryCollection }>,
  sphereRadius = 1,
): CountryOutlines {
  const collection = feature(topology, topology.objects.countries);

  const tier1Buffers: number[] = [];
  const tier2Buffers: number[] = [];
  const byIsoRings = new Map<number, CountryRings>();

  for (const f of collection.features) {
    const id = parseFeatureId(f.id);
    const inSet = !Number.isNaN(id) && CHART_COUNTRY_ISO_NUMS.has(id);
    const rings = polygonToLatLonRings(f.geometry);

    const segmentTarget = inSet ? tier2Buffers : tier1Buffers;
    for (const ring of rings) {
      pushRingSegments(ring, sphereRadius, segmentTarget);
    }

    if (inSet) {
      // Multiple features can share an ISO num (e.g. AU 036 = "Australia" + "Ashmore
      // and Cartier Is."). Accumulate all rings so we don't lose the mainland.
      let acc = byIsoRings.get(id);
      if (!acc) {
        acc = [];
        byIsoRings.set(id, acc);
      }
      for (const ring of rings) acc.push(ring);
    }
  }

  const byIso = new Map<number, Float32Array>();
  for (const [id, rings] of byIsoRings) {
    const segs: number[] = [];
    for (const ring of rings) {
      pushRingSegments(ring, sphereRadius, segs);
    }
    byIso.set(id, new Float32Array(segs));
  }

  return {
    tier1Positions: new Float32Array(tier1Buffers),
    tier2Positions: new Float32Array(tier2Buffers),
    byIso,
    byIsoRings,
  };
}

type PolygonGeom = { type: "Polygon"; coordinates: number[][][] };
type MultiPolygonGeom = { type: "MultiPolygon"; coordinates: number[][][][] };

function parseFeatureId(idRaw: unknown): number {
  if (typeof idRaw === "string") return parseInt(idRaw, 10);
  if (typeof idRaw === "number") return idRaw;
  return NaN;
}

function pushRingSegments(
  ring: [number, number][],
  r: number,
  out: number[],
): void {
  for (let i = 0; i < ring.length - 1; i++) {
    const a = latLonToVec3(ring[i][1], ring[i][0], r);
    const b = latLonToVec3(ring[i + 1][1], ring[i + 1][0], r);
    out.push(a.x, a.y, a.z, b.x, b.y, b.z);
  }
}

function polygonToLatLonRings(
  geom: PolygonGeom | MultiPolygonGeom | { type: string },
): CountryRings {
  const out: CountryRings = [];
  if (geom.type === "Polygon") {
    for (const ring of (geom as PolygonGeom).coordinates) {
      out.push(ring as [number, number][]);
    }
  } else if (geom.type === "MultiPolygon") {
    for (const polygon of (geom as MultiPolygonGeom).coordinates) {
      for (const ring of polygon) {
        out.push(ring as [number, number][]);
      }
    }
  }
  return out;
}
