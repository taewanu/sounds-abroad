import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';

import { COUNTRIES } from '@/lib/countries';
import { latLonToVec3 } from '@/lib/lat-lon-to-vec3';

const COUNTRY_BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));

// Names the selected country at its anchor, the point the globe centres on.
export function CountryNameLabel({ code }: { code: string | null }) {
  const country = code !== null ? COUNTRY_BY_CODE.get(code) : undefined;
  const anchor = useMemo(
    () => (country ? latLonToVec3(country.lat, country.lon) : null),
    [country],
  );
  const labelRef = useRef<HTMLDivElement>(null);

  // A point on the unit globe faces the camera only while its dot product with
  // the camera position exceeds 1; past that horizon the globe hides it.
  useFrame(({ camera }) => {
    const el = labelRef.current;
    if (!el || !anchor) return;
    el.style.visibility = anchor.dot(camera.position) > 1 ? 'visible' : 'hidden';
  });

  if (!country || !anchor) return null;
  return (
    // drei applies its pointerEvents prop only in transform mode, so the wrapper
    // class keeps a press on the label falling through to the globe canvas.
    <Html ref={labelRef} position={anchor} wrapperClass="pointer-events-none">
      <span
        data-testid="country-name-label"
        className="absolute -translate-x-1/2 -translate-y-1/2 text-micro font-semibold tracking-[0.14em] whitespace-nowrap text-fg-1 uppercase select-none [text-shadow:0_0_2px_var(--color-void),0_0_6px_var(--color-void),0_0_12px_rgba(5,6,8,0.9)]"
      >
        {country.name}
      </span>
    </Html>
  );
}
