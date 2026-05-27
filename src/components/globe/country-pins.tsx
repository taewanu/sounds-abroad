import { useMemo } from "react";
import { AdditiveBlending } from "three";

import { COUNTRIES } from "@/lib/countries";
import { latLonToVec3 } from "@/lib/lat-lon-to-vec3";

const PIN_ELEVATION = 1.015;
const PIN_RADIUS = 0.012;
const PIN_SCALE_SELECTED = 1.3;
const GLOW_RADIUS = 0.04;
const HIT_RADIUS = 0.07;
const PIN_COLOR = "#B8B5AE";
const PIN_COLOR_SELECTED = "#FF6B47";

interface CountryPinsProps {
  selectedCode: string | null;
  onSelect: (code: string) => void;
}

export function CountryPins({ selectedCode, onSelect }: CountryPinsProps) {
  const pins = useMemo(
    () =>
      COUNTRIES.map((c) => ({
        country: c,
        position: latLonToVec3(c.lat, c.lon, PIN_ELEVATION),
      })),
    [],
  );

  return (
    <>
      {pins.map(({ country, position }) => {
        const isSelected = selectedCode === country.code;
        const dotRadius = isSelected
          ? PIN_RADIUS * PIN_SCALE_SELECTED
          : PIN_RADIUS;
        return (
          <group
            key={country.code}
            position={[position.x, position.y, position.z]}
          >
            <mesh
              onClick={(e) => {
                e.stopPropagation();
                onSelect(country.code);
              }}
            >
              <sphereGeometry args={[HIT_RADIUS, 8, 8]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>

            {isSelected && (
              <mesh>
                <sphereGeometry args={[GLOW_RADIUS, 16, 16]} />
                <meshBasicMaterial
                  color={PIN_COLOR_SELECTED}
                  transparent
                  opacity={0.45}
                  blending={AdditiveBlending}
                  depthWrite={false}
                />
              </mesh>
            )}

            <mesh>
              <sphereGeometry args={[dotRadius, 12, 12]} />
              <meshBasicMaterial
                color={isSelected ? PIN_COLOR_SELECTED : PIN_COLOR}
              />
            </mesh>
          </group>
        );
      })}
    </>
  );
}
