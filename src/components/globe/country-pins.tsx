import { useMemo } from 'react';
import { AdditiveBlending } from 'three';

import { COUNTRIES } from '@/lib/countries';
import { latLonToVec3 } from '@/lib/lat-lon-to-vec3';

const PIN_ELEVATION = 1.015;
const PIN_RADIUS = 0.012;
const PIN_SCALE_SELECTED = 1.3;
const GLOW_RADIUS = 0.04;
const HIT_RADIUS = 0.07;
const PIN_COLOR = '#B8B5AE';
const PIN_COLOR_SELECTED = '#FF6B47';
const PIN_COLOR_HOVER = '#FF8866';

interface CountryPinsProps {
  selectedCode: string | null;
  hoveredCode: string | null;
  onSelect: (code: string) => void;
  onHoverChange: (code: string | null) => void;
}

export function CountryPins({
  selectedCode,
  hoveredCode,
  onSelect,
  onHoverChange,
}: CountryPinsProps) {
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
        const isHovered = !isSelected && hoveredCode === country.code;
        // A hovered pin only recolours, because a click steps rather than selects it.
        const dotRadius = isSelected ? PIN_RADIUS * PIN_SCALE_SELECTED : PIN_RADIUS;
        return (
          <group key={country.code} position={[position.x, position.y, position.z]}>
            <mesh
              onClick={(e) => {
                e.stopPropagation();
                onSelect(country.code);
              }}
              onPointerEnter={(e) => {
                if (e.pointerType === 'touch') return;
                if (isSelected) return;
                e.stopPropagation();
                onHoverChange(country.code);
              }}
              onPointerLeave={(e) => {
                if (e.pointerType === 'touch') return;
                if (hoveredCode !== country.code) return;
                onHoverChange(null);
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
                color={isSelected ? PIN_COLOR_SELECTED : isHovered ? PIN_COLOR_HOVER : PIN_COLOR}
              />
            </mesh>
          </group>
        );
      })}
    </>
  );
}
