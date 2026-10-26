import { describe, expect, it } from "vitest";
import { agxCurve, deriveAgx } from "../src/agx/derive";
import { agxPixel } from "../src/agx/twin";
import { AGX_DEFAULTS, type AgxParams } from "../src/agx/params";

const p = (over: Partial<AgxParams>): AgxParams => ({ ...AGX_DEFAULTS, ...over });

describe("agxCurve", () => {
  it("derives darktable's default curve", () => {
    const c = agxCurve(AGX_DEFAULTS);
    expect(c.pivotY).toBeCloseTo(0.45865646, 6);
    expect(c.slope).toBeCloseTo(3.0, 6);
    expect(c.toeTx).toBeCloseTo(0.60606061, 6);
    expect(c.shTx).toBeCloseTo(0.60606061, 6);
    expect(c.toeScale).toBeCloseTo(-0.50200927, 5);
    expect(c.shScale).toBeCloseTo(0.55447394, 5);
    expect(c.intercept).toBeCloseTo(-1.35952536, 5);
    expect(c.needConvexToe).toBe(false);
    expect(c.needConcaveShoulder).toBe(false);
    expect(c.toeFallbackPower).toBeCloseTo(3.96414741, 5);
    expect(c.toeFallbackCoeff).toBeCloseTo(3.3390732, 5);
    expect(c.shFallbackPower).toBeCloseTo(2.1831205, 5);
    expect(c.shFallbackCoeff).toBeCloseTo(4.13713148, 5);
    expect(c.lookTuned).toBe(false);
    expect(c.restoreHue).toBe(true);
  });

  it("derives the blender-like base curve, whose runtime slope is Blender's 2.4", () => {
    const c = agxCurve(p({ curve_shoulder_power: 1.5, curve_toe_power: 1.5, curve_gamma: 2.4, curve_contrast_around_pivot: 2.4535246 }));
    expect(c.slope).toBeCloseTo(2.4, 5);
    expect(c.pivotY).toBeCloseTo(0.4894371, 6);
    expect(c.toeScale).toBeCloseTo(-0.56567562, 5);
    expect(c.shScale).toBeCloseTo(0.71519822, 5);
  });

  it("derives the sigmoid-like presets' scales", () => {
    const d = agxCurve(p({ curve_contrast_around_pivot: 3.07, curve_toe_power: 1.4, curve_shoulder_power: 3.71 }));
    expect(d.toeScale).toBeCloseTo(-0.51116222, 5);
    expect(d.shScale).toBeCloseTo(0.54898632, 5);
    const s = agxCurve(p({ curve_contrast_around_pivot: 2.98, curve_toe_power: 1.61, curve_shoulder_power: 3.02 }));
    expect(s.toeScale).toBeCloseTo(-0.49310851, 5);
    expect(s.shScale).toBeCloseTo(0.55985361, 5);
  });

  it("stays finite where darktable 5.6.2's float pow overflows", () => {
    const c = agxCurve(p({ curve_shoulder_power: 10, curve_toe_power: 10, curve_pivot_y_linear_output: 1 }));
    for (const v of Object.values(c)) if (typeof v === "number") expect(Number.isFinite(v), String(v)).toBe(true);
    expect(c.shScale).toBeGreaterThan(0);
  });

  it("leaves the fallback curves exact where they are used, matching the slope at the join", () => {
    const c = agxCurve(p({ curve_contrast_around_pivot: 0.1 }));
    expect(c.needConvexToe).toBe(true);
    expect(c.needConcaveShoulder).toBe(true);
    const toeRise = c.toeFallbackCoeff * c.toeTx ** c.toeFallbackPower;
    expect(c.targetBlack + toeRise).toBeCloseTo(c.toeTy, 9);
    expect(c.toeFallbackPower * toeRise / c.toeTx).toBeCloseTo(c.slope, 9);
    const shRun = 1 - c.shTx;
    const shY = c.targetWhite - c.shFallbackCoeff * shRun ** c.shFallbackPower;
    expect(shY).toBeCloseTo(c.shTy, 9);
    expect(c.shFallbackPower * (c.targetWhite - shY) / shRun).toBeCloseTo(c.slope, 9);
  });

  it("tunes the look only when one of its four sliders moves, and keeps hue only above zero", () => {
    expect(agxCurve(p({ look_saturation: 1.2 })).lookTuned).toBe(true);
    expect(agxCurve(p({ look_original_hue_mix_ratio: 0 })).restoreHue).toBe(false);
    expect(agxCurve(p({ look_brightness: 1 / 1.35 ** 2 })).lookPower).toBeCloseTo(1.35, 6);
  });

  it("keeps the pivot on the diagonal with auto gamma", () => {
    const c = agxCurve(p({ auto_gamma: true }));
    expect(c.gamma).toBeCloseTo(Math.log2(0.18) / Math.log2(10 / 16.5), 10);
  });

  // darktable's auto gamma there is -0, which renders a white frame.
  it("takes the slider's gamma where auto gamma has no positive value: pivot output 1", () => {
    const top = p({ auto_gamma: true, curve_pivot_y_linear_output: 1, curve_gamma: 2.4 });
    expect(agxCurve(top).gamma).toBe(2.4);
    expect(agxCurve({ ...top, curve_pivot_y_linear_output: 0 }).gamma).toBe(2.4);
    expect(agxCurve({ ...top, auto_gamma: false })).toEqual(agxCurve(top));
    for (const [key, v] of Object.entries(deriveAgx(top))) expect(v.every(Number.isFinite), key).toBe(true);
    const dark = agxPixel([0.0018, 0.0018, 0.0018], deriveAgx(top));
    for (const ch of dark) expect(ch).toBeLessThan(0.5);
  });
});
