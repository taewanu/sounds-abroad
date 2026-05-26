import { Vector3 } from "three";

export function latLonToVec3(lat: number, lon: number, r = 1): Vector3 {
  const latR = (lat * Math.PI) / 180;
  const lonR = (lon * Math.PI) / 180;
  return new Vector3(
    r * Math.cos(latR) * Math.sin(lonR),
    r * Math.sin(latR),
    r * Math.cos(latR) * Math.cos(lonR),
  );
}

export function vec3ToLatLon(v: Vector3): { lat: number; lon: number } {
  const r = v.length();
  const lat = (Math.asin(v.y / r) * 180) / Math.PI;
  const lon = (Math.atan2(v.x, v.z) * 180) / Math.PI;
  return { lat, lon };
}
