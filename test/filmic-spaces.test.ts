import { describe, expect, it } from "vitest";
import { IDENTITY, apply, mul } from "../src/colour/mat3";
import { REC2020_TO_REC709 } from "../src/colour/profiles";
import { lmsToYrg } from "../src/colour/yrg";
import { EXPORT_INPUT, EXPORT_OUTPUT, FILMIC_PIPE, PIPE_LUMA, PIPE_TO_LMS } from "../src/filmic/spaces";

const near = (a: readonly number[], b: readonly number[], tol: number) =>
  a.forEach((v, i) => expect(Math.abs(v - b[i]), `entry ${i}`).toBeLessThan(tol));

// The Yrg a neutral lands on: Ych measures chroma from this point (Ref 2.7.3).
const NEUTRAL = [0.21902143, 0.54371398];

describe("filmic's fixed spaces", () => {
  it("puts a pipe neutral and an export neutral on the Yrg neutral point", () => {
    for (const matrix of [PIPE_TO_LMS, EXPORT_INPUT]) {
      const yrg = lmsToYrg(apply(matrix, [0.3, 0.3, 0.3]));
      near([yrg[1], yrg[2]], NEUTRAL, 1e-6);
    }
  });

  it("reaches the export LMS from a pipe colour the same way as from the same colour in sRGB", () => {
    near(mul(PIPE_TO_LMS, FILMIC_PIPE), EXPORT_INPUT, 1e-12);
  });

  it("takes the pipe through LMS to linear sRGB as the plain Rec.2020 to Rec.709 conversion", () => {
    near(mul(EXPORT_OUTPUT, PIPE_TO_LMS), REC2020_TO_REC709, 1e-6);
  });

  it("inverts the export input with the export output, to the constants' eight digits", () => {
    near(mul(EXPORT_INPUT, EXPORT_OUTPUT), IDENTITY, 1e-6);
    near(mul(EXPORT_OUTPUT, EXPORT_INPUT), IDENTITY, 1e-6);
  });

  it("converts Safelight's Rec.709 to Rec.2020 for darktable's D65 white, 0.31271 / 0.32902", () => {
    // Computed from the two sets of primaries alone, with no profile code.
    near(
      FILMIC_PIPE,
      [0.6274019, 0.329292, 0.0433061, 0.0690955, 0.9195443, 0.0113602, 0.0163937, 0.0880282, 0.8955781],
      1e-6,
    );
    // BT.2087-0's matrix, which takes the white as 0.3127 / 0.3290.
    near(
      FILMIC_PIPE,
      [0.627404, 0.329283, 0.043313, 0.069097, 0.91954, 0.011362, 0.016391, 0.088013, 0.895595],
      2e-5,
    );
    near(apply(FILMIC_PIPE, [1, 1, 1]), [1, 1, 1], 1e-12);
  });

  it("takes luminance from the D50 Rec.2020 row of CIE Y, summing to the white's 1", () => {
    expect(PIPE_LUMA[0] + PIPE_LUMA[1] + PIPE_LUMA[2]).toBeCloseTo(1, 12);
    near(PIPE_LUMA, [0.279, 0.6753, 0.0456], 1e-4);
  });
});
