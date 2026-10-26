import { describe, expect, it } from "vitest";
import { agxCurve } from "../src/agx/derive";
import { AGX_DEFAULTS, AGX_PARAMS } from "../src/agx/params";
import { AGX_PRESETS, AGX_PRIMARIES } from "../src/panel/presets";
import { withinRange } from "../src/param-table";

const preset = (name: string) => {
  const p = AGX_PRESETS.find((x) => x.name === name);
  if (!p) throw new Error(name);
  return p.params;
};

describe("AgX presets (Ref §1.10)", () => {
  it("lists darktable's six, in its order", () => {
    expect(AGX_PRESETS.map((p) => p.name)).toEqual([
      "unmodified base primaries", "classic | base", "classic | punchy",
      "sigmoid-like | default", "sigmoid-like | smooth", "smooth",
    ]);
  });

  it("give classic base Blender's runtime slope of 2.4", () => {
    expect(preset("classic | base").curve_contrast_around_pivot).toBeCloseTo(2.4535246, 6);
    expect(agxCurve(preset("classic | base")).slope).toBeCloseTo(2.4, 9);
  });

  it("give punchy a look power of 1.35 and saturation 1.4", () => {
    expect(agxCurve(preset("classic | punchy")).lookPower).toBeCloseTo(1.35, 9);
    expect(preset("classic | punchy").look_saturation).toBe(1.4);
  });

  it("make the scene-referred default the extension's defaults", () => {
    expect({ ...AGX_DEFAULTS, ...AGX_PRIMARIES.classic }).toEqual(AGX_DEFAULTS);
  });

  it("set smooth's primaries on the working profile", () => {
    expect(preset("smooth").base_primaries).toBe(1);
    expect(preset("smooth").red_rotation).toBeCloseTo((2 * Math.PI) / 180, 12);
    expect(preset("smooth").master_outset_ratio).toBe(0);
  });

  it("reproduce the worked curves of Ref §1.11", () => {
    const base = agxCurve(preset("classic | base"));
    expect(base.pivotY).toBeCloseTo(0.4894371, 6);
    expect(base.toeScale).toBeCloseTo(-0.56567562, 6);
    expect(base.shScale).toBeCloseTo(0.71519822, 6);

    const sigmoid = agxCurve(preset("sigmoid-like | default"));
    expect(sigmoid.slope).toBeCloseTo(3.07, 9);
    expect(sigmoid.toeScale).toBeCloseTo(-0.51116222, 6);
    expect(sigmoid.shScale).toBeCloseTo(0.54898632, 6);

    const smooth = agxCurve(preset("sigmoid-like | smooth"));
    expect(smooth.slope).toBeCloseTo(2.98, 9);
    expect(smooth.toeScale).toBeCloseTo(-0.49310851, 6);
    expect(smooth.shScale).toBeCloseTo(0.55985361, 6);
  });

  it("keep the sigmoid-like presets' hue preservation: 1 for default, 0 for smooth", () => {
    expect(preset("sigmoid-like | default").look_original_hue_mix_ratio).toBe(1);
    expect(preset("sigmoid-like | smooth").look_original_hue_mix_ratio).toBe(0);
    expect(preset("smooth").look_original_hue_mix_ratio).toBe(0.6);
  });

  it("are complete and inside every param's hard range", () => {
    for (const { name, params } of AGX_PRESETS) {
      expect(Object.keys(params).sort(), name).toEqual(Object.keys(AGX_PARAMS).sort());
      expect(withinRange(AGX_PARAMS, params), name).toEqual(params);
    }
  });

  it("start every preset from the default curve and look", () => {
    for (const { name, params } of AGX_PRESETS) {
      expect(params.range_black_relative_ev, name).toBe(-10);
      expect(params.range_white_relative_ev, name).toBe(6.5);
      expect(params.curve_pivot_x, name).toBeCloseTo(10 / 16.5, 12);
      expect(params.curve_pivot_y_linear_output, name).toBe(0.18);
    }
  });

  it("have primaries sets that replace one another whole", () => {
    const keys = (k: keyof typeof AGX_PRIMARIES) => Object.keys(AGX_PRIMARIES[k]).sort();
    expect(keys("smooth")).toEqual(keys("classic"));
    expect(keys("unmodified")).toEqual(keys("classic"));
  });
});
