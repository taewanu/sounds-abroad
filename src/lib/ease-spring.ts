import BezierEasing from "bezier-easing";

// Source of truth: --ease-spring in src/app/globals.css.
// Keep these control points in sync with that CSS variable.
export const easeSpring = BezierEasing(0.34, 1.56, 0.64, 1);
