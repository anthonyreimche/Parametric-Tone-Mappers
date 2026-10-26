import { describe, expect, it } from "vitest";
import { compressNegatives, decodeSrgb, encodeSrgb, sanitise } from "../src/glsl/common";
import { clamp, gaussSolve, sigmoidScale } from "../src/curve-math";

describe("sigmoidScale", () => {
  it("matches the worked AgX default shoulder scale", () => {
    // Ref §1.11: default curve, shoulder from (pivot_x, pivot_y) to (1, 1), slope 3, power 3.3.
    expect(sigmoidScale(1, 1, 10 / 16.5, Math.pow(0.18, 1 / 2.2), 3, 3.3)).toBeCloseTo(0.55447394, 5);
  });

  it("stays finite where float32 overflows (power 10, rise clamped to 1e-6)", () => {
    const s = sigmoidScale(1, 1, 0.5, 1, 3, 10);
    expect(Number.isFinite(s)).toBe(true);
    expect(s).toBeGreaterThan(0);
  });
});

describe("gaussSolve", () => {
  it("solves a system that needs pivoting", () => {
    expect(gaussSolve([0, 1, 1, 1], [2, 3], 2).map((v) => Math.round(v * 1e12) / 1e12)).toEqual([1, 2]);
  });
});

describe("clamp", () => {
  it("clamps", () => {
    expect([clamp(-1, 0, 1), clamp(0.5, 0, 1), clamp(2, 0, 1)]).toEqual([0, 0.5, 1]);
  });
});

describe("pixel twins of the shared GLSL", () => {
  it("encode sRGB with the sign kept and no ceiling, and decode it back", () => {
    expect(encodeSrgb(0.18)).toBeCloseTo(0.4613561, 6);
    expect(encodeSrgb(-0.18)).toBeCloseTo(-0.4613561, 6);
    expect(encodeSrgb(0.001)).toBeCloseTo(0.01292, 8);
    expect(decodeSrgb(encodeSrgb(2.5))).toBeCloseTo(2.5, 10);
  });

  it("sanitise NaN to zero and clamp to ±1e6", () => {
    expect(sanitise([Number.NaN, 2e6, -2e6])).toEqual([0, 1e6, -1e6]);
  });

  const k = [0.2658180370250449, 0.59846986045365, 0.1357121025213052] as const;

  it("compress negatives into gamut, leaving in-gamut colours alone", () => {
    expect(compressNegatives([0.2, 0.4, 0.1], k)).toEqual([0.2, 0.4, 0.1]);
    const out = compressNegatives([-0.2, 0.6, -0.1], k);
    expect(Math.min(...out)).toBeGreaterThanOrEqual(0);
  });

  it("shift by the offset, then scale by the luminance-compensation ratio (Ref §1.7)", () => {
    const [kr, kg, kb] = k;
    // p = (-0.2, 0.6, -0.1): max3(p) = 0.6, so opp = (0.8, 0, 0.7)
    const inputY = -0.2 * kr + 0.6 * kg - 0.1 * kb;
    const yComp = 0.8 - (0.8 * kr + 0.7 * kb) + inputY;
    // offset = 0.2, so q = (0, 0.8, 0.1): max3(q) = 0.8 and opp_q = (0.8, 0, 0.7) again
    const yNew = 0.8 - (0.8 * kr + 0.7 * kb) + (0.8 * kg + 0.1 * kb);
    const ratio = yComp / yNew;
    expect(ratio).toBeCloseTo(0.7968913, 7);

    const out = compressNegatives([-0.2, 0.6, -0.1], k);
    expect(out[0]).toBeCloseTo(0, 7);
    expect(out[1]).toBeCloseTo(0.8 * ratio, 7);
    expect(out[2]).toBeCloseTo(0.1 * ratio, 7);

    // The output's own compensated luminance is the input's y_comp.
    const top = Math.max(...out);
    const oppOut = out.map((c) => top - c);
    const dotOppOut = oppOut[0] * kr + oppOut[1] * kg + oppOut[2] * kb;
    const dotOut = out[0] * kr + out[1] * kg + out[2] * kb;
    expect(Math.max(...oppOut) - dotOppOut + dotOut).toBeCloseTo(yComp, 10);
  });

  it("leaves the shifted colour unscaled when y_new is under 1e-6", () => {
    // y_new always exceeds y_comp by offset * sum(k), so for a negative channel only the
    // y_new > 1e-6 guard can hold the ratio at 1: p = (-1e-9, 0, 0) gives y_new = 1.47e-9.
    expect(compressNegatives([-1e-9, 0, 0], k)).toEqual([0, 1e-9, 1e-9]);
  });
});
