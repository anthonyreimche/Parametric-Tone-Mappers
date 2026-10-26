// Parametric Tone Mappers, a Safelight extension. GPL-3.0-or-later. See LICENSE.

// The read-only curve view: AgX's curve before its look, in its log/gamma
// space with the pivot, and filmic's spline in its log/power space with middle
// grey, drawn from the same TypeScript twins the GPU tests check. Both are
// evaluated on the uniforms the core would bind, so the graph shows what renders.

import type { ReactElement } from "react";
import { deriveAgx } from "../agx/derive";
import type { AgxParams } from "../agx/params";
import { AGX_DEFAULT_UNIFORMS } from "../agx/transform";
import { agxCurveAt } from "../agx/twin";
import { deriveFilmic } from "../filmic/derive";
import type { FilmicParams } from "../filmic/params";
import { FILMIC_DEFAULT_UNIFORMS } from "../filmic/transform";
import { filmicSplineAt } from "../filmic/twin";
import { api, h } from "../runtime";

export interface GraphData {
  points: [number, number][];
  marker?: [number, number];
}

/** `derive`'s uniforms as the core binds them: each only when every component
 *  is finite, else its default; all defaults where derive throws. */
export function boundUniforms<U extends Record<string, number[]>>(derive: () => U, defaults: U): U {
  let derived: U;
  try {
    derived = derive();
  } catch {
    return defaults;
  }
  const bound = { ...defaults };
  for (const key in defaults) {
    if (derived[key].every(Number.isFinite)) bound[key] = derived[key];
  }
  return bound;
}

export function curvePoints(f: (x: number) => number, n = 64): [number, number][] {
  return Array.from({ length: n + 1 }, (_, i): [number, number] => [i / n, f(i / n)]);
}

export function agxGraph(p: AgxParams): GraphData {
  const u = boundUniforms(() => deriveAgx(p), AGX_DEFAULT_UNIFORMS);
  // The curve clamps the pivot the same way (_adjust_pivot).
  const pivotX = Math.min(1 - 1e-6, Math.max(1e-6, p.curve_pivot_x));
  return { points: curvePoints((x) => agxCurveAt(x, u)), marker: [pivotX, agxCurveAt(pivotX, u)] };
}

export function filmicGraph(p: FilmicParams): GraphData {
  const u = boundUniforms(() => deriveFilmic(p), FILMIC_DEFAULT_UNIFORMS);
  const y4 = u.fNodes[2];
  // The shader's clamp: a negative or NaN spline value is 0, anything above the white node is the node.
  const at = (x: number): number => {
    const s = filmicSplineAt(x, u);
    return s >= 0 ? Math.min(s, y4) : 0;
  };
  const [, black, range] = u.fLog;
  const greyX = Math.abs(black) / range;
  return { points: curvePoints(at), marker: [greyX, at(greyX)] };
}

const SIZE = 100;

const isFinitePoint = ([x, y]: [number, number]): boolean => Number.isFinite(x) && Number.isFinite(y);

export function CurveGraph({ points, marker }: GraphData): ReactElement {
  const t = api().ui.tokens;
  const pt = ([x, y]: [number, number]) => `${(x * SIZE).toFixed(2)},${((1 - y) * SIZE).toFixed(2)}`;
  return h(
    "svg",
    {
      viewBox: `0 0 ${SIZE} ${SIZE}`,
      role: "img",
      "aria-label": "Curve",
      style: { width: "100%", aspectRatio: "1", background: t.surface0, border: `1px solid ${t.border}`, borderRadius: 4 },
    },
    h("line", { x1: 0, y1: SIZE, x2: SIZE, y2: 0, stroke: t.border, strokeWidth: 0.5 }),
    h("polyline", { points: points.filter(isFinitePoint).map(pt).join(" "), fill: "none", stroke: t.textPrimary, strokeWidth: 1 }),
    marker && isFinitePoint(marker)
      ? h("circle", { cx: marker[0] * SIZE, cy: (1 - marker[1]) * SIZE, r: 1.6, fill: t.accent })
      : null,
  );
}
