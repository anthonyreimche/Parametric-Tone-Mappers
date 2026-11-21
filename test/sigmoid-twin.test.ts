// What the oracle can't show: the curve's anchors as upstream states them,
// and pixels darktable never sees (NaN, infinities, the hard ends of every
// range), which must still render finite.

import { describe, expect, it } from "vitest";
import type { Vec3 } from "../src/colour/mat3";
import { deriveSigmoid, sigmoidData } from "../src/sigmoid/derive";
import { MIDDLE_GREY, SIGMOID_DEFAULTS, SIGMOID_PARAMS, type SigmoidParams } from "../src/sigmoid/params";
import { loglogistic, sigmoidPixel } from "../src/sigmoid/twin";

const curve = (p: SigmoidParams) => {
  const d = sigmoidData(p);
  return (x: number) => loglogistic(x, d);
};

describe("the curve (commit_params's contract, sigmoid.c L325-330)", () => {
  const cases: [string, Partial<SigmoidParams>][] = [
    ["defaults", {}],
    ["skewed to the shadows", { contrast_skewness: -0.8 }],
    ["skewed to the highlights", { contrast_skewness: 0.9 }],
    ["low contrast, bright white", { middle_grey_contrast: 0.6, display_white_target: 800 }],
    ["faded", { display_black_target: 6, display_white_target: 55 }],
  ];

  it.each(cases)("maps scene zero to target black, grey to grey and infinity to target white: %s", (_, over) => {
    const p = { ...SIGMOID_DEFAULTS, ...over };
    const f = curve(p);
    expect(f(0)).toBeCloseTo(p.display_black_target / 100, 6);
    expect(f(MIDDLE_GREY)).toBeCloseTo(MIDDLE_GREY, 6);
    expect(f(1e30)).toBeCloseTo(p.display_white_target / 100, 6);
  });

  it("rises everywhere", () => {
    const f = curve(SIGMOID_DEFAULTS);
    let last = -Infinity;
    for (let ev = -20; ev <= 16; ev += 0.25) {
      const y = f(MIDDLE_GREY * 2 ** ev);
      expect(y).toBeGreaterThan(last);
      last = y;
    }
  });

  it("clamps a negative input to zero and answers the white target for an overflow", () => {
    const d = sigmoidData(SIGMOID_DEFAULTS);
    expect(loglogistic(-5, d)).toBe(loglogistic(0, d));
    expect(loglogistic(Infinity, d)).toBe(d.whiteTarget);
  });
});

describe("a pixel", () => {
  const EXTREMES: Partial<SigmoidParams>[] = [
    {},
    { color_processing: 1 },
    { middle_grey_contrast: 10, contrast_skewness: 1, display_black_target: 0 },
    { middle_grey_contrast: 0.1, contrast_skewness: -1, display_white_target: 1600 },
    { display_black_target: 15, display_white_target: 20, color_processing: 1 },
    { red_inset: 0.99, green_inset: 0.99, blue_inset: 0.99, red_rotation: 0.4, green_rotation: -0.4, blue_rotation: 0.4, purity: 1 },
    ...[0, 1, 2, 3, 4].map((base_primaries) => ({ base_primaries, red_inset: 0.3, blue_rotation: -0.2 })),
  ];
  const INPUTS: Vec3[] = [
    [0, 0, 0], [NaN, 0.2, 0.3], [Infinity, 1, 1], [-Infinity, -1, 0], [1e30, 1e30, 1e30], [-1, -1, -1], [1e-30, 0, 0], [5, 0, 0],
  ];

  it.each(EXTREMES)("renders finite at the ends of every range: %o", (over) => {
    const u = deriveSigmoid({ ...SIGMOID_DEFAULTS, ...over });
    for (const v of [1, 2]) {
      for (const lin of INPUTS) {
        const out = sigmoidPixel(lin, u, v);
        expect(out.every(Number.isFinite), `v${v} ${lin} → ${out}`).toBe(true);
      }
    }
  });

  it("renders a grey as a grey, through the defaults' matrices", () => {
    const u = deriveSigmoid(SIGMOID_DEFAULTS);
    for (const g of [0.01, MIDDLE_GREY, 3]) {
      const [r, gg, b] = sigmoidPixel([g, g, g], u, 2);
      expect(gg).toBeCloseTo(r, 6);
      expect(b).toBeCloseTo(r, 6);
    }
  });

  it("holds every derived uniform finite at the ends of every range", () => {
    const ends: Partial<SigmoidParams>[] = [];
    for (const [key, d] of Object.entries(SIGMOID_PARAMS)) ends.push({ [key]: d.min }, { [key]: d.max });
    for (const over of ends) {
      const u = deriveSigmoid({ ...SIGMOID_DEFAULTS, ...over });
      for (const [k, v] of Object.entries(u)) expect(v.every(Number.isFinite), `${JSON.stringify(over)} ${k}`).toBe(true);
    }
  });
});
