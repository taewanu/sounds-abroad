import { Vector3 } from "three";

import { latLonToVec3 } from "./lat-lon-to-vec3";

export interface CameraArcParams {
  from: Vector3;
  toLatLon: { lat: number; lon: number };
  baseRadius: number;
  riseFactor: number;
}

export function cameraArcPath(params: CameraArcParams): (t: number) => Vector3 {
  const fromDir = params.from.clone().normalize();
  const toDir = latLonToVec3(params.toLatLon.lat, params.toLatLon.lon, 1);
  return (t) => {
    const dir = slerpUnitVectors(fromDir, toDir, t);
    const r =
      params.baseRadius * (1 + params.riseFactor * Math.sin(Math.PI * t));
    return dir.multiplyScalar(r);
  };
}

function slerpUnitVectors(from: Vector3, to: Vector3, t: number): Vector3 {
  const dot = Math.max(-1, Math.min(1, from.dot(to)));
  if (dot > 1 - 1e-6) {
    return from.clone().lerp(to, t).normalize();
  }
  if (dot < -1 + 1e-6) {
    const helper =
      Math.abs(from.x) < 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
    const axis = new Vector3().crossVectors(from, helper).normalize();
    return from.clone().applyAxisAngle(axis, Math.PI * t);
  }
  const theta = Math.acos(dot);
  const sinTheta = Math.sin(theta);
  const a = Math.sin((1 - t) * theta) / sinTheta;
  const b = Math.sin(t * theta) / sinTheta;
  return from
    .clone()
    .multiplyScalar(a)
    .add(to.clone().multiplyScalar(b))
    .normalize();
}
