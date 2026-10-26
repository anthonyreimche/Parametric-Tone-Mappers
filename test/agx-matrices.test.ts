import { describe, expect, it } from "vitest";
import { IDENTITY, apply, invert, mul } from "../src/colour/mat3";
import { ADOBE_RGB, DISPLAY_P3, REC2020, SRGB } from "../src/colour/profiles";
import { AGX_UNIFORM_TYPES, agxCurve, agxMatrices, baseProfile, deriveAgx, matrixFromPrimaries, rotateAndScalePrimary } from "../src/agx/derive";
import { AGX_DEFAULTS, type AgxParams } from "../src/agx/params";

const near = (a: readonly number[], b: readonly number[], tol: number) =>
  a.forEach((v, i) => expect(Math.abs(v - b[i]), `entry ${i}`).toBeLessThan(tol));

const UNMODIFIED: Partial<AgxParams> = {
  red_inset: 0, green_inset: 0, blue_inset: 0, red_rotation: 0, green_rotation: 0, blue_rotation: 0,
  master_outset_ratio: 1, master_unrotation_ratio: 1,
  red_outset: 0, green_outset: 0, blue_outset: 0, red_unrotation: 0, green_unrotation: 0, blue_unrotation: 0,
};
const p = (over: Partial<AgxParams>): AgxParams => ({ ...AGX_DEFAULTS, ...over });

describe("primaries", () => {
  it("returns a primary itself unscaled and unrotated", () => {
    for (const i of [0, 1, 2]) {
      const q = rotateAndScalePrimary(REC2020, 1, 0, i);
      expect(q.x).toBeCloseTo(REC2020.primaries[i].x, 9);
      expect(q.y).toBeCloseTo(REC2020.primaries[i].y, 9);
    }
  });

  it("lands a rotated primary on an edge of the triangle", () => {
    const [a, b, c] = REC2020.primaries;
    for (const i of [0, 1, 2]) {
      const q = rotateAndScalePrimary(REC2020, 1, 0.1, i);
      const offEdge = [[a, b], [b, c], [c, a]].map(
        ([s, e]) => Math.abs((e.x - s.x) * (q.y - s.y) - (e.y - s.y) * (q.x - s.x)),
      );
      expect(Math.min(...offEdge), `primary ${i}`).toBeLessThan(1e-12);
    }
  });

  it("scales the distance from white and turns the angle by the rotation", () => {
    const w = REC2020.white;
    for (const i of [0, 1, 2]) {
      const full = rotateAndScalePrimary(REC2020, 1, 0.1, i);
      const half = rotateAndScalePrimary(REC2020, 0.5, 0.1, i);
      expect(Math.hypot(half.x - w.x, half.y - w.y)).toBeCloseTo(0.5 * Math.hypot(full.x - w.x, full.y - w.y), 12);
      const before = Math.atan2(REC2020.primaries[i].y - w.y, REC2020.primaries[i].x - w.x);
      expect(Math.atan2(half.y - w.y, half.x - w.x) - before).toBeCloseTo(0.1, 12);
    }
  });

  it("rebuilds a profile's own RGB→XYZ from its primaries and white", () => {
    const m = matrixFromPrimaries(REC2020.primaries, REC2020.white);
    expect(m).not.toBeNull();
    near(m!, REC2020.toXyz, 1e-9);
  });

  it("refuses primaries two of which sit on one point", () => {
    const [r, , b] = REC2020.primaries;
    expect(matrixFromPrimaries([r, r, b], REC2020.white)).toBeNull();
  });

  it("renders export and working profile as Rec2020, and each other choice as its own profile", () => {
    expect(baseProfile(0)).toBe(REC2020);
    expect(baseProfile(1)).toBe(REC2020);
    expect(baseProfile(2)).toBe(REC2020);
    expect(baseProfile(3)).toBe(DISPLAY_P3);
    expect(baseProfile(4)).toBe(ADOBE_RGB);
    expect(baseProfile(5)).toBe(SRGB);
  });
});

describe("agxMatrices", () => {
  it("are identity around the curve with unmodified primaries", () => {
    const m = agxMatrices(p(UNMODIFIED));
    near(m.baseToRendering, IDENTITY, 1e-9);
    near(mul(m.renderingToPipe, mul(m.baseToRendering, m.pipeToBase)), IDENTITY, 1e-9);
  });

  it("disable adjustments renders as unmodified", () => {
    const off = agxMatrices(p({ disable_primaries_adjustments: true }));
    const plain = agxMatrices(p(UNMODIFIED));
    near(off.baseToRendering, plain.baseToRendering, 1e-12);
    near(off.renderingToPipe, plain.renderingToPipe, 1e-12);
  });

  it("returns to the pipe exactly with no purity boost and no rotation reversal", () => {
    const m = agxMatrices(p({ master_outset_ratio: 0, master_unrotation_ratio: 0, red_unrotation: 0.2, green_unrotation: -0.3, blue_unrotation: 0.4 }));
    const back = invert(m.pipeToBase);
    expect(back).not.toBeNull();
    near(m.renderingToPipe, back!, 1e-9);
  });

  it("ignores the reverse rotations at master rotation reversal 0", () => {
    const turns = { red_unrotation: 0.2, green_unrotation: -0.3, blue_unrotation: 0.4 };
    expect(agxMatrices(p({ ...turns, master_unrotation_ratio: 0 }))).toEqual(
      agxMatrices(p({ master_unrotation_ratio: 1, red_unrotation: 0, green_unrotation: 0, blue_unrotation: 0 })),
    );
  });

  it("reverse all undoes the inset exactly", () => {
    const m = agxMatrices(p({ completely_reverse_primaries: true }));
    near(mul(m.renderingToPipe, mul(m.baseToRendering, m.pipeToBase)), IDENTITY, 1e-9);
  });

  it("keep neutrals neutral with blender-like primaries", () => {
    const m = agxMatrices(AGX_DEFAULTS);
    near(apply(m.baseToRendering, [1, 1, 1]), [1, 1, 1], 1e-9);
    near(apply(m.renderingToPipe, [1, 1, 1]), [1, 1, 1], 1e-9);
  });

  // Values from an independent re-derivation of _create_matrices (agx.c L1222-1324) for these parameters.
  it("pins baseToRendering for the blender-like defaults", () => {
    near(
      agxMatrices(AGX_DEFAULTS).baseToRendering,
      [
        0.85655515964177, 0.0950680236017495, 0.0483768167564809,
        0.137061220829391, 0.761236580950609, 0.101702198220001,
        0.109847629695151, 0.0767449496943768, 0.813407420610472,
      ],
      1e-9,
    );
    near(deriveAgx(AGX_DEFAULTS).agxLumaY, [0.336587939906436, 0.544127434885857, 0.119284625207707], 1e-9);
  });

  it("takes luminance from the second row of the inset primaries' XYZ matrix", () => {
    const [kr, kg, kb] = agxMatrices(AGX_DEFAULTS).renderingToXyz.slice(3, 6);
    expect(kr + kg + kb).toBeCloseTo(1, 9);
  });
});

describe("deriveAgx", () => {
  it("returns every declared uniform with its component count", () => {
    const u = deriveAgx(AGX_DEFAULTS);
    const size = { mat3: 9, vec4: 4, vec3: 3, vec2: 2 } as const;
    for (const [key, type] of Object.entries(AGX_UNIFORM_TYPES)) {
      expect(u[key as keyof typeof u], key).toHaveLength(size[type]);
      for (const v of u[key as keyof typeof u]) expect(Number.isFinite(v), key).toBe(true);
    }
  });

  it("uploads matrices column-major", () => {
    const u = deriveAgx(AGX_DEFAULTS);
    const m = agxMatrices(AGX_DEFAULTS);
    const t = m.pipeToBase;
    expect(u.agxPipeToBase).toEqual([t[0], t[3], t[6], t[1], t[4], t[7], t[2], t[5], t[8]]);
    expect(u.agxLumaY).toEqual([m.renderingToXyz[3], m.renderingToXyz[4], m.renderingToXyz[5]]);
  });

  it("packs the curve and look in the documented order", () => {
    const u = deriveAgx(AGX_DEFAULTS);
    const c = agxCurve(AGX_DEFAULTS);
    expect(u.agxRange).toEqual([c.blackEv, c.rangeEv, c.gamma, 0]);
    expect(u.agxToe).toEqual([c.toeTx, c.toeTy, c.toeScale, c.toePower]);
    expect(u.agxShoulder).toEqual([c.shTx, c.shTy, c.shScale, c.shPower]);
    expect(u.agxCurveC).toEqual([c.slope, c.intercept, c.targetBlack, c.targetWhite]);
    expect(u.agxToeFallback).toEqual([0, c.toeFallbackCoeff, c.toeFallbackPower, 0]);
    expect(u.agxShFallback).toEqual([0, c.shFallbackCoeff, c.shFallbackPower, 0]);
    expect(u.agxLook).toEqual([c.lookM, c.lookB, c.lookPower, AGX_DEFAULTS.look_saturation]);
    expect(u.agxHue).toEqual([1, AGX_DEFAULTS.look_original_hue_mix_ratio]);
  });

  it("raises the flags the shader branches on", () => {
    const tuned = deriveAgx(p({ look_slope: 1.2, look_original_hue_mix_ratio: 0 }));
    expect(tuned.agxRange[3]).toBe(1);
    expect(tuned.agxHue[0]).toBe(0);
    const flat = deriveAgx(p({ curve_contrast_around_pivot: 0.1 }));
    expect(flat.agxToeFallback[0]).toBe(1);
    expect(flat.agxShFallback[0]).toBe(1);
  });
});

describe("a singular primaries corner", () => {
  // Master purity boost 2 with two purity boosts at 0.5 puts two outset primaries on white. The curve and look are moved so their uniforms aren't the defaults.
  const SINGULAR = p({ master_outset_ratio: 2, red_outset: 0.5, green_outset: 0.5, curve_contrast_around_pivot: 2.5, look_saturation: 1.3 });
  const MATRICES = ["agxPipeToBase", "agxBaseToRendering", "agxRenderingToPipe", "agxLumaY"] as const;
  const CURVE = ["agxRange", "agxToe", "agxShoulder", "agxCurveC", "agxToeFallback", "agxShFallback", "agxLook", "agxHue"] as const;

  it("renders the unmodified primaries, as disable adjustments does", () => {
    const off = { ...SINGULAR, disable_primaries_adjustments: true };
    expect(agxMatrices(SINGULAR)).toEqual(agxMatrices(off));
    const u = deriveAgx(SINGULAR);
    for (const key of MATRICES) expect(u[key], key).toEqual(deriveAgx(off)[key]);
  });

  it("does the same for one outset primary on white, whose matrix is singular only up to rounding", () => {
    for (const outset of ["red_outset", "green_outset", "blue_outset"] as const) {
      for (const base_primaries of [2, 3, 4, 5]) {
        const single = p({ master_outset_ratio: 2, [outset]: 0.5, base_primaries });
        expect(agxMatrices(single), `${outset}, base ${base_primaries}`).toEqual(agxMatrices({ ...single, disable_primaries_adjustments: true }));
      }
    }
    const close = p({ master_outset_ratio: 2, green_outset: 0.4999 });
    expect(agxMatrices(close)).not.toEqual(agxMatrices({ ...close, disable_primaries_adjustments: true }));
    near(apply(agxMatrices(close).renderingToPipe, [1, 1, 1]), [1, 1, 1], 1e-9);
  });

  it("keeps the curve and look its params derive", () => {
    expect([...MATRICES, ...CURVE].sort()).toEqual(Object.keys(AGX_UNIFORM_TYPES).sort());
    const u = deriveAgx(SINGULAR);
    const regular = deriveAgx({ ...SINGULAR, master_outset_ratio: 1 });
    for (const key of CURVE) expect(u[key], key).toEqual(regular[key]);
    expect(u.agxCurveC).not.toEqual(deriveAgx(AGX_DEFAULTS).agxCurveC);
    expect(u.agxRange[3]).toBe(1);
  });

  it("never throws on the primaries sliders' corners", () => {
    const ends = [0, 0.5, 0.99];
    for (const base_primaries of [2, 3, 4, 5]) {
      for (const master_outset_ratio of [0, 1, 2]) {
        for (const master_unrotation_ratio of [0, 2]) {
          for (const red_outset of ends) {
            for (const green_outset of ends) {
              for (const blue_outset of ends) {
                for (const [inset, turn] of [[0, -0.5236], [0.99, 0.5236]]) {
                  const params = p({
                    base_primaries, master_outset_ratio, master_unrotation_ratio, red_outset, green_outset, blue_outset,
                    red_inset: inset, green_inset: inset, blue_inset: inset,
                    red_rotation: turn, green_rotation: -turn, blue_rotation: turn,
                    red_unrotation: -turn, green_unrotation: turn, blue_unrotation: -turn,
                  });
                  expect(() => deriveAgx(params), JSON.stringify(params)).not.toThrow();
                }
              }
            }
          }
        }
      }
    }
  });
});
