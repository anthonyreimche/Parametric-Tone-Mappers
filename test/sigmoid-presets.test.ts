import { describe, expect, it } from "vitest";
import { withinRange } from "../src/param-table";
import { SIGMOID_PRESETS } from "../src/panel/presets";
import { SIGMOID_DEFAULTS, SIGMOID_PARAMS } from "../src/sigmoid/params";

const preset = (name: string) => {
  const p = SIGMOID_PRESETS.find((x) => x.name === name);
  if (!p) throw new Error(name);
  return p.params;
};

const deg = (d: number): number => Math.fround((Math.fround(d) * Math.fround(Math.PI)) / 180);

// init_presets (sigmoid.c L227-296), with "neutral gray" in Canadian spelling.
// It builds each from a zeroed struct, so its unset primaries are 0. Its base
// primaries 0 is darktable's working profile, linear Rec2020 by default; here
// that is Rec2020 (1), as the defaults are.
describe("Sigmoid presets", () => {
  it("lists darktable's four, in its order", () => {
    expect(SIGMOID_PRESETS.map((p) => p.name)).toEqual(["neutral grey", "ACES 100-nit like", "Reinhard", "smooth"]);
  });

  it("set neutral grey's contrast and skew", () => {
    expect(preset("neutral grey")).toEqual({ ...SIGMOID_DEFAULTS, middle_grey_contrast: 1.22, contrast_skewness: 0.65 });
  });

  it("drop the hue preservation for ACES 100-nit like", () => {
    expect(preset("ACES 100-nit like")).toEqual({
      ...SIGMOID_DEFAULTS, middle_grey_contrast: 1.6, contrast_skewness: -0.2, hue_preservation: 0,
    });
  });

  it("make Reinhard an RGB ratio curve of contrast 1", () => {
    expect(preset("Reinhard")).toEqual({
      ...SIGMOID_DEFAULTS, middle_grey_contrast: 1, contrast_skewness: 0, hue_preservation: 0, color_processing: 1,
    });
  });

  it("give smooth its attenuated, rotated primaries on Rec2020, in darktable's float radians", () => {
    expect(preset("smooth")).toEqual({
      ...SIGMOID_DEFAULTS,
      middle_grey_contrast: 1.5, contrast_skewness: -0.2, hue_preservation: 0, color_processing: 0,
      red_inset: 0.1, green_inset: 0.1, blue_inset: 0.15,
      red_rotation: deg(2), green_rotation: deg(-1), blue_rotation: deg(-3),
      purity: 0, base_primaries: 1,
    });
  });

  it("set every field, each inside its hard range", () => {
    for (const { name, params } of SIGMOID_PRESETS) {
      expect(Object.keys(params).sort(), name).toEqual(Object.keys(SIGMOID_PARAMS).sort());
      expect(withinRange(SIGMOID_PARAMS, params), name).toEqual(params);
    }
  });
});
