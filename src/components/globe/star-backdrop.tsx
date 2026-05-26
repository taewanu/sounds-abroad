import { useMemo } from "react";
import { AdditiveBlending } from "three";

const STAR_COUNT = 1800;
const STAR_SIZE = 0.04;
const SHELL_MIN = 10;
const SHELL_MAX = 14;

function generateShellPositions(
  count: number,
  shellMin: number,
  shellMax: number,
): Float32Array {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const u = Math.random();
    const v = Math.random();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    const r = shellMin + Math.random() * (shellMax - shellMin);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
  }
  return positions;
}

export function StarBackdrop() {
  const positions = useMemo(
    () => generateShellPositions(STAR_COUNT, SHELL_MIN, SHELL_MAX),
    [],
  );

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
          count={STAR_COUNT}
        />
      </bufferGeometry>
      <pointsMaterial
        size={STAR_SIZE}
        sizeAttenuation
        blending={AdditiveBlending}
        transparent
        depthWrite={false}
        color="#ffffff"
      />
    </points>
  );
}
