// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { deriveAgx } from "../src/agx/derive";
import { AGX_DEFAULTS, type AgxParams } from "../src/agx/params";
import { deriveFilmic } from "../src/filmic/derive";
import { FILMIC_DEFAULTS, type FilmicParams } from "../src/filmic/params";
import { FILMIC_DEFAULT_UNIFORMS } from "../src/filmic/transform";
import { CurveGraph, agxGraph, boundUniforms, curvePoints, filmicGraph } from "../src/panel/Graph";
import { initRuntime } from "../src/runtime";
import { fakeApi } from "./support/fake-api";

afterEach(cleanup);

// Black target above white target on the safe curves: the spline's coefficients leave float32, so deriveFilmic packs NaN.
const DEGENERATE: FilmicParams = { ...FILMIC_DEFAULTS, black_point_target: 20, white_point_target: 10, shadows: 2, highlights: 2 };

// A pivot target of 0 at gamma 100 underflows darktable's slope correction: the slope is infinite.
const DEGENERATE_AGX: AgxParams = { ...AGX_DEFAULTS, curve_pivot_y_linear_output: 0, curve_gamma: 100 };

describe("curvePoints", () => {
  it("samples x over [0, 1] inclusive", () => {
    const pts = curvePoints((x) => x * x, 4);
    expect(pts).toEqual([[0, 0], [0.25, 0.0625], [0.5, 0.25], [0.75, 0.5625], [1, 1]]);
  });
});

describe("boundUniforms", () => {
  const fallback = { a: [1, 2], b: [3] };

  it("keeps every derived uniform whose components are all finite", () => {
    expect(boundUniforms(() => ({ a: [5, 6], b: [7] }), fallback)).toEqual({ a: [5, 6], b: [7] });
  });

  it("binds the default where one component is not finite, as the core does, and only there", () => {
    expect(boundUniforms(() => ({ a: [5, NaN], b: [7] }), fallback)).toEqual({ a: [1, 2], b: [7] });
    expect(boundUniforms(() => ({ a: [5, 6], b: [Infinity] }), fallback)).toEqual({ a: [5, 6], b: [3] });
  });

  it("binds every default where derive throws", () => {
    const failing = (): typeof fallback => {
      throw new Error("singular");
    };
    expect(boundUniforms(failing, fallback)).toEqual(fallback);
  });

  it("turns a degenerate safe filmic curve into finite uniforms", () => {
    const raw = Object.values(deriveFilmic(DEGENERATE)).flat();
    expect(raw.some((v) => !Number.isFinite(v))).toBe(true);
    const bound = boundUniforms(() => deriveFilmic(DEGENERATE), FILMIC_DEFAULT_UNIFORMS);
    expect(Object.values(bound).flat().every(Number.isFinite)).toBe(true);
  });
});

describe("graphs", () => {
  it("put AgX's pivot on its curve", () => {
    const g = agxGraph(AGX_DEFAULTS);
    expect(g.marker?.[0]).toBeCloseTo(10 / 16.5, 9);
    expect(g.marker?.[1]).toBeCloseTo(Math.pow(0.18, 1 / 2.2), 6);
  });

  it("keep filmic's curve within [0, white display]", () => {
    for (const [, y] of filmicGraph(FILMIC_DEFAULTS).points) {
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it("put filmic's middle grey on its curve", () => {
    const g = filmicGraph(FILMIC_DEFAULTS);
    expect(g.marker?.[0]).toBeCloseTo(-FILMIC_DEFAULTS.black_point_source / (FILMIC_DEFAULTS.white_point_source - FILMIC_DEFAULTS.black_point_source), 9);
    expect(g.marker?.[1]).toBeCloseTo(Math.pow(0.1845, 1 / deriveFilmic(FILMIC_DEFAULTS).fNodes[3]), 6);
  });

  it("draw a degenerate safe filmic curve as the shader does, on the default toe and shoulder", () => {
    const white = deriveFilmic(DEGENERATE).fNodes[2];
    const g = filmicGraph(DEGENERATE);
    expect(g.points).toHaveLength(65);
    for (const [x, y] of g.points) {
      expect(Number.isFinite(x)).toBe(true);
      expect(y).toBeCloseTo(white, 9);
    }
    expect(g.marker?.[1]).toBeCloseTo(white, 9);
  });

  it("draw the default curve where AgX's curve uniforms are not finite", () => {
    expect(Object.values(deriveAgx(DEGENERATE_AGX)).flat().some((v) => !Number.isFinite(v))).toBe(true);
    expect(agxGraph(DEGENERATE_AGX)).toEqual(agxGraph(AGX_DEFAULTS));
  });
});

describe("CurveGraph", () => {
  it("renders an SVG polyline", () => {
    initRuntime(fakeApi().api);
    const { container } = render(React.createElement(CurveGraph, agxGraph(AGX_DEFAULTS)));
    expect(container.querySelector("svg polyline")?.getAttribute("points")?.split(" ")).toHaveLength(65);
  });

  it("colours the marker with the accent token", () => {
    initRuntime(fakeApi().api);
    const { container } = render(React.createElement(CurveGraph, agxGraph(AGX_DEFAULTS)));
    expect(container.querySelector("svg circle")?.getAttribute("fill")).toBe("var(--color-accent)");
  });

  it("never lets a non-finite value reach the SVG", () => {
    initRuntime(fakeApi().api);
    const points: [number, number][] = [[0, 0], [0.25, NaN], [0.5, Infinity], [0.75, -Infinity], [1, 1]];
    const { container } = render(React.createElement(CurveGraph, { points, marker: [NaN, 0.5] }));
    expect(container.querySelector("svg polyline")?.getAttribute("points")).toBe("0.00,100.00 100.00,0.00");
    expect(container.querySelector("svg circle")).toBeNull();
  });
});
