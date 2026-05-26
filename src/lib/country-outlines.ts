import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";

import { COUNTRIES } from "./countries";
import { latLonToVec3 } from "./lat-lon-to-vec3";

export interface CountryOutlines {
  tier1Positions: Float32Array;
  tier2Positions: Float32Array;
  byIso: Map<number, Float32Array>;
}

const SET_40_ISO_NUMS = new Set(COUNTRIES.map((c) => c.isoNum));

export function buildCountryOutlines(
  topology: Topology<{ countries: GeometryCollection }>,
  sphereRadius = 1,
): CountryOutlines {
  const collection = feature(topology, topology.objects.countries);

  const tier1Buffers: number[] = [];
  const tier2Buffers: number[] = [];
  const byIso = new Map<number, Float32Array>();

  for (const f of collection.features) {
    const idRaw = f.id;
    const id =
      typeof idRaw === "string"
        ? parseInt(idRaw, 10)
        : typeof idRaw === "number"
          ? idRaw
          : NaN;
    const inSet = !Number.isNaN(id) && SET_40_ISO_NUMS.has(id);

    const segments = polygonToLineSegments(f.geometry, sphereRadius);

    if (inSet) {
      byIso.set(id, new Float32Array(segments));
      tier2Buffers.push(...segments);
    } else {
      tier1Buffers.push(...segments);
    }
  }

  return {
    tier1Positions: new Float32Array(tier1Buffers),
    tier2Positions: new Float32Array(tier2Buffers),
    byIso,
  };
}

type PolygonGeom = { type: "Polygon"; coordinates: number[][][] };
type MultiPolygonGeom = { type: "MultiPolygon"; coordinates: number[][][][] };

function polygonToLineSegments(
  geom: PolygonGeom | MultiPolygonGeom | { type: string },
  r: number,
): number[] {
  const out: number[] = [];
  if (geom.type === "Polygon") {
    for (const ring of (geom as PolygonGeom).coordinates) {
      pushRing(ring as [number, number][], r, out);
    }
  } else if (geom.type === "MultiPolygon") {
    for (const polygon of (geom as MultiPolygonGeom).coordinates) {
      for (const ring of polygon) {
        pushRing(ring as [number, number][], r, out);
      }
    }
  }
  return out;
}

function pushRing(ring: [number, number][], r: number, out: number[]): void {
  for (let i = 0; i < ring.length - 1; i++) {
    const a = latLonToVec3(ring[i][1], ring[i][0], r);
    const b = latLonToVec3(ring[i + 1][1], ring[i + 1][0], r);
    out.push(a.x, a.y, a.z, b.x, b.y, b.z);
  }
}
