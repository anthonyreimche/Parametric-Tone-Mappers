import { describe, expect, it } from "vitest";
import { IDENTITY, apply, columnMajor, fromColumnMajor, invert, mul, type Mat3, type Vec3 } from "../src/colour/mat3";
import { ADOBE_RGB, DISPLAY_P3, REC2020, REC709_TO_REC2020, SRGB } from "../src/colour/profiles";
import { lmsToYrg, xyzD50ToYrg, yrgToLms, yrgToXyzD50 } from "../src/colour/yrg";

const near = (a: readonly number[], b: readonly number[], tol: number) =>
  a.forEach((v, i) => expect(Math.abs(v - b[i]), `entry ${i}`).toBeLessThan(tol));

describe("mat3", () => {
  const M: Mat3 = [2, 1, 0, 0, 1, 3, 1, 0, 1];

  it("inverts", () => {
    const inv = invert(M);
    expect(inv).not.toBeNull();
    near(mul(M, inv!), IDENTITY, 1e-12);
  });

  it("finds a singular matrix singular", () => {
    expect(invert([1, 2, 3, 2, 4, 6, 0, 0, 1])).toBeNull();
  });

  it("finds a matrix singular to rounding singular", () => {
    // The third row is twice the second less the first; the computed determinant is 1.7e-17, not 0.
    expect(invert([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9])).toBeNull();
  });

  it("inverts an ill-conditioned matrix that is regular", () => {
    const m: Mat3 = [1, 1, 0, 1, 1 + 1e-9, 0, 0, 0, 1];
    const inv = invert(m);
    expect(inv).not.toBeNull();
    near(mul(m, inv!), IDENTITY, 1e-6);
  });

  it("uploads column-major and reads it back", () => {
    expect(columnMajor(M)).toEqual([2, 0, 1, 1, 1, 0, 0, 3, 1]);
    expect(fromColumnMajor(columnMajor(M))).toEqual(M);
  });
});

describe("profiles", () => {
  const D50: Vec3 = [0.9642, 1.0, 0.8249];

  it("map RGB white to D50, as lcms2 adapts them", () => {
    for (const p of [REC2020, DISPLAY_P3, ADOBE_RGB, SRGB]) near(apply(p.toXyz, [1, 1, 1]), D50, 1e-9);
  });

  it("give sRGB the D50 luminance row darktable falls back to", () => {
    near(SRGB.toXyz.slice(3, 6), [0.2225045, 0.7168786, 0.0606169], 5e-5);
  });

  it("take Rec.709 to Rec.2020 as BT.2087 does, keeping white", () => {
    near(
      REC709_TO_REC2020,
      [0.6274039, 0.3292830, 0.0433131, 0.0690973, 0.9195404, 0.0113623, 0.0163914, 0.0880133, 0.8955953],
      2e-4,
    );
    near(apply(REC709_TO_REC2020, [1, 1, 1]), [1, 1, 1], 1e-12);
  });

  it("read the white and primaries as D50 xy", () => {
    expect(SRGB.white.x).toBeCloseTo(0.3457, 4);
    expect(SRGB.white.y).toBeCloseTo(0.3585, 4);
    expect(REC2020.primaries[0].x).toBeGreaterThan(0.7);
  });
});

describe("Yrg", () => {
  it("round-trips LMS through Yrg", () => {
    const lms: Vec3 = [0.4, 0.5, 0.3];
    near(yrgToLms(lmsToYrg(lms)), lms, 1e-6);
  });

  it("round-trips XYZ D50 through Yrg", () => {
    const xyz: Vec3 = [0.3, 0.35, 0.2];
    near(yrgToXyzD50(xyzD50ToYrg(xyz)), xyz, 1e-6);
  });

  it("maps black to zero luminance and zero chromaticity", () => {
    expect(lmsToYrg([0, 0, 0])).toEqual([0, 0, 0]);
  });
});
