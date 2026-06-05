// Globe sphere radius; the camera sits at BASE_DISTANCE on +z looking at it.
const SPHERE_RADIUS = 1;
const BASE_DISTANCE = 3.5;
const BASE_FOV_DEG = 45;
// Fraction of the shorter viewport dimension the globe fills on wide/short views.
const TARGET_FILL = 0.85;

const RAD_TO_DEG = 180 / Math.PI;

export interface CameraFit {
  fov: number;
  distance: number;
}

/**
 * FOV for a viewport aspect (width / height); distance is held constant so the
 * camera-arc and OrbitControls are unaffected. A PerspectiveCamera fits its FOV
 * vertically, so wide/short viewports narrow it to fill TARGET_FILL of the height;
 * tall viewports clamp to the base FOV so the portrait globe never shrinks.
 */
export function cameraForViewport(aspect: number): CameraFit {
  if (!(aspect > 0)) return { fov: BASE_FOV_DEG, distance: BASE_DISTANCE };

  const shorter = Math.min(1, aspect);
  const halfTanTarget = SPHERE_RADIUS / (BASE_DISTANCE * TARGET_FILL * shorter);
  const fitFov = 2 * Math.atan(halfTanTarget) * RAD_TO_DEG;

  return { fov: Math.min(BASE_FOV_DEG, fitFov), distance: BASE_DISTANCE };
}
