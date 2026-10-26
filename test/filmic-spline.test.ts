import { describe, expect, it } from "vitest";
import { filmicGeometry, filmicPower, filmicSpline } from "../src/filmic/derive";
import { readParams } from "../src/param-table";
import {
  CURVE_POLY_3,
  CURVE_POLY_4,
  CURVE_RATIONAL,
  CURVE_SIGMOID,
  FILMIC_CURVES,
  FILMIC_DEFAULTS,
  FILMIC_PARAMS,
  FILMIC_VERSIONS,
  type FilmicParams,
} from "../src/filmic/params";

const p = (over: Partial<FilmicParams>): FilmicParams => ({ ...FILMIC_DEFAULTS, ...over });
const INTROSPECTION = p({ black_point_source: -8, white_point_source: 4, auto_hardness: false, output_power: 4 });
const AUTO_8_4 = p({ black_point_source: -8, white_point_source: 4 });
const RAW_BIAS_0 = p({ black_point_source: -8.85, white_point_source: 3.15 });

const CASES: [string, FilmicParams, number, number[]][] = [
  // name, params, power, [grey_display, c, b, toe x, grey x, shoulder x, toe scale, shoulder q, shoulder coeff]
  ["introspection defaults", INTROSPECTION, 4.0, [0.65538889, 1.57186793, -0.39252306, 0.6325985, 0.6666667, 0.6880248, -0.65201265, 1.5765993, 1.9515726]],
  ["-8/+4 auto hardness", AUTO_8_4, 4.1683138, [0.66666669, 1.53435264, -0.35623507, 0.6316953, 0.6666667, 0.6878187, -0.66303015, 1.5919913, 1.9199557]],
  ["raw defaults, bias 0", RAW_BIAS_0, 5.5506266, [0.73750001, 1.27466735, -0.20256716, 0.6963571, 0.7375, 0.75747, -0.67286336, 1.3041626, 1.5038221]],
];

describe("FILMIC_PARAMS", () => {
  it("declares the 17 fields the tone mapping reads, with upstream's names", () => {
    expect(Object.keys(FILMIC_PARAMS)).toEqual([
      "grey_point_source", "black_point_source", "white_point_source", "security_factor", "grey_point_target", "black_point_target",
      "white_point_target", "output_power", "latitude", "contrast", "saturation", "balance", "version", "auto_hardness", "custom_grey",
      "shadows", "highlights",
    ]);
  });

  it("defaults to Ansel's raw formula at Exposure 0, with hardness putting grey on the identity line", () => {
    expect(FILMIC_DEFAULTS.white_point_source).toBe(2.45);
    expect(FILMIC_DEFAULTS.black_point_source).toBeCloseTo(-9.55, 12);
    expect(FILMIC_DEFAULTS.output_power).toBeCloseTo(7.4008808, 6);
    expect(filmicPower(FILMIC_DEFAULTS)).toBeCloseTo(FILMIC_DEFAULTS.output_power, 12);
    expect([FILMIC_DEFAULTS.latitude, FILMIC_DEFAULTS.contrast, FILMIC_DEFAULTS.balance, FILMIC_DEFAULTS.saturation]).toEqual([10, 1.18, 0, 0]);
    expect([FILMIC_DEFAULTS.version, FILMIC_DEFAULTS.auto_hardness, FILMIC_DEFAULTS.custom_grey]).toEqual([7, true, false]);
    expect([FILMIC_DEFAULTS.shadows, FILMIC_DEFAULTS.highlights]).toEqual([CURVE_SIGMOID, CURVE_SIGMOID]);
  });

  it("clamps a colour science outside the v8 variants into them, and a curve type into 0-3", () => {
    expect(readParams(FILMIC_PARAMS, { version: 3 }).version).toBe(5);
    expect(readParams(FILMIC_PARAMS, { version: 12 }).version).toBe(9);
    expect(Object.keys(FILMIC_VERSIONS).map(Number)).toEqual([5, 6, 7, 8, 9]);
    expect(readParams(FILMIC_PARAMS, { shadows: 7, highlights: -1 })).toMatchObject({ shadows: CURVE_SIGMOID, highlights: CURVE_POLY_4 });
  });

  it("lists the curve labels in enum order", () => {
    expect(FILMIC_CURVES[CURVE_POLY_4]).toBe("hard");
    expect(FILMIC_CURVES[CURVE_POLY_3]).toBe("soft");
    expect(FILMIC_CURVES[CURVE_RATIONAL]).toBe("safe");
    expect(FILMIC_CURVES[CURVE_SIGMOID]).toBe("perceptual");
  });
});

describe("filmicPower", () => {
  it("puts grey on the identity line with auto hardness", () => {
    expect(filmicPower(AUTO_8_4)).toBeCloseTo(4.1683138, 6);
    expect(filmicPower(RAW_BIAS_0)).toBeCloseTo(5.5506266, 6);
    expect(filmicPower(INTROSPECTION)).toBe(4);
  });
});

describe("filmicSpline", () => {
  for (const [name, params, power, [grey, c, b, toeX, greyX, shX, toeScale, q, coeff]] of CASES) {
    it(`matches the worked values for ${name}`, () => {
      const s = filmicSpline(params, power);
      expect(s.greyDisplay).toBeCloseTo(grey, 5);
      expect(s.contrast).toBeCloseTo(c, 5);
      expect(s.intercept).toBeCloseTo(b, 5);
      expect(s.x[1]).toBeCloseTo(toeX, 5);
      expect(s.x[2]).toBeCloseTo(greyX, 5);
      expect(s.x[3]).toBeCloseTo(shX, 5);
      expect(s.M1[0]).toBeCloseTo(toeScale, 5);
      expect(s.M5[0]).toBe(0);
      expect(s.M4[1]).toBeCloseTo(q, 5);
      expect(s.M3[1]).toBeCloseTo(coeff, 5);
      expect(s.M5[1]).toBe(1);
    });
  }

  it("solves the polynomial toes and shoulders through their nodes with matching slope", () => {
    for (const type of [CURVE_POLY_4, CURVE_POLY_3]) {
      const s = filmicSpline(p({ shadows: type, highlights: type }), filmicPower(FILMIC_DEFAULTS));
      const poly = (i: number, x: number) => s.M1[i] + x * (s.M2[i] + x * (s.M3[i] + x * (s.M4[i] + x * s.M5[i])));
      const slope = (i: number, x: number) => s.M2[i] + x * (2 * s.M3[i] + x * (3 * s.M4[i] + x * 4 * s.M5[i]));
      expect(poly(0, 0)).toBeCloseTo(s.y[0], 9);
      expect(poly(0, s.x[1])).toBeCloseTo(s.y[1], 9);
      expect(slope(0, s.x[1])).toBeCloseTo(s.contrast, 9);
      expect(poly(1, 1)).toBeCloseTo(s.y[4], 9);
      expect(poly(1, s.x[3])).toBeCloseTo(s.y[3], 9);
      expect(slope(1, s.x[3])).toBeCloseTo(s.contrast, 9);
    }
  });

  it("also meets the polynomials' remaining conditions: zero curvature at the nodes, flat ends for the 4th order", () => {
    for (const type of [CURVE_POLY_4, CURVE_POLY_3]) {
      const s = filmicSpline(p({ shadows: type, highlights: type }), filmicPower(FILMIC_DEFAULTS));
      const slope = (i: number, x: number) => s.M2[i] + x * (2 * s.M3[i] + x * (3 * s.M4[i] + x * 4 * s.M5[i]));
      const curvature = (i: number, x: number) => 2 * s.M3[i] + x * (6 * s.M4[i] + x * 12 * s.M5[i]);
      expect(curvature(0, s.x[1])).toBeCloseTo(0, 9);
      expect(curvature(1, s.x[3])).toBeCloseTo(0, 9);
      if (type === CURVE_POLY_4) {
        expect(slope(0, 0)).toBeCloseTo(0, 9);
        expect(slope(1, 1)).toBeCloseTo(0, 9);
      }
    }
  });

  it("stores each safe curve's end node display value in M4", () => {
    const s = filmicSpline(p({ shadows: CURVE_RATIONAL, highlights: CURVE_RATIONAL }), filmicPower(FILMIC_DEFAULTS));
    expect(s.M4[0]).toBeCloseTo(s.y[1], 12);
    expect(s.M4[1]).toBeCloseTo(s.y[3], 12);
  });

  it("runs the safe curves through their end nodes with the latitude slope (Ref 2.7.2 evaluation)", () => {
    const s = filmicSpline(p({ shadows: CURVE_RATIONAL, highlights: CURVE_RATIONAL }), filmicPower(FILMIC_DEFAULTS));
    const toe = (x: number) => {
      const xi = s.latitudeMin - x;
      const r = xi * (xi * s.M2[0] + 1);
      return s.M4[0] - (s.M1[0] * r) / (r + s.M3[0]);
    };
    const shoulder = (x: number) => {
      const xi = x - s.latitudeMax;
      const r = xi * (xi * s.M2[1] + 1);
      return s.M4[1] + (s.M1[1] * r) / (r + s.M3[1]);
    };
    expect(toe(0)).toBeCloseTo(s.y[0], 12);
    expect(toe(s.x[1])).toBeCloseTo(s.y[1], 12);
    expect(s.M1[0] / s.M3[0]).toBeCloseTo(s.contrast, 12);
    expect(shoulder(1)).toBeCloseTo(s.y[4], 12);
    expect(shoulder(s.x[3])).toBeCloseTo(s.y[3], 12);
    expect(s.M1[1] / s.M3[1]).toBeCloseTo(s.contrast, 12);
    // b = 1/c puts the second derivative at the node at zero, as the polynomial curves have.
    expect(s.M2[0] * s.M3[0]).toBeCloseTo(1, 12);
    expect(s.M2[1] * s.M3[1]).toBeCloseTo(1, 12);
  });

  it("lets the contrast rise above 100 when the range needs it, as glib's CLAMP does, keeping the safe shoulder finite", () => {
    // Range -16/+0.1 EV at hardness 1 needs a slope of 131.3055 to reach white. Ansel's CLAMP(x, low, high)
    // returns low once x is below it, even with low > high, so the contrast is 131.3055 rather than 100.
    const s = filmicSpline(
      p({ black_point_source: -16, white_point_source: 0.1, contrast: 0, latitude: 0.01, balance: -50, auto_hardness: false, output_power: 1, highlights: CURVE_RATIONAL }),
      1,
    );
    expect(s.contrast).toBeCloseTo(131.3055, 4);
    for (const m of [s.M1, s.M2, s.M3]) for (const v of m) expect(Number.isFinite(v)).toBe(true);
  });

  it("lets the safe shoulder's NaN radicand through when target black and white both collapse onto grey", () => {
    // Target black 20% is held at the 18.45% grey and target white 10% is raised to it, so the shoulder's
    // dy is 0: upstream's square root and divisions give NaN and Infinity, which are passed on.
    const s = filmicSpline(p({ black_point_target: 20, white_point_target: 10, highlights: CURVE_RATIONAL }), filmicPower(FILMIC_DEFAULTS));
    expect(s.y[3]).toBe(s.y[4]);
    expect(s.M1[1]).toBeNaN();
    expect(s.M2[1]).toBe(Infinity);
    expect(s.M3[1]).toBeNaN();
    expect(s.M4[1]).toBe(s.y[3]);
  });

  it("caps a requested contrast at 100", () => {
    // A 1% target grey at contrast 5 over 32 EV asks for a slope of about 158 at hardness 4.
    const s = filmicSpline(p({ custom_grey: true, grey_point_target: 1, contrast: 5, black_point_source: -16, white_point_source: 16 }), 4);
    expect(s.contrast).toBe(100);
  });

  it("lets the safe shoulder's negative radicand through when a zero target white leaves the contrast at its cap", () => {
    // Custom grey clamps to the 0% target white, so grey display is 0 and the requested slope is infinite: the
    // contrast sits at 100, the chord from the shoulder node to white is steeper than that, and the square
    // root's radicand is negative.
    const s = filmicSpline(
      p({ custom_grey: true, white_point_target: 0, black_point_source: -16, white_point_source: 0.1, latitude: 0.01, balance: -50, highlights: CURVE_RATIONAL }),
      4,
    );
    expect(s.greyDisplay).toBe(0);
    expect(s.contrast).toBe(100);
    expect(s.M1[1]).toBeNaN();
    expect(s.M2[1]).toBeNaN();
    expect(s.M3[1]).toBeNaN();
    expect(s.M4[1]).toBe(s.y[3]);
  });

  it("keeps the nodes on the latitude line and slides them together with balance", () => {
    const power = filmicPower(FILMIC_DEFAULTS);
    const base = filmicSpline(p({}), power);
    for (const balance of [-50, -25, 0, 25, 50]) {
      const s = filmicSpline(p({ balance }), power);
      for (const i of [1, 2, 3]) {
        expect(s.y[i]).toBeCloseTo(s.contrast * s.x[i] + s.intercept, 12);
        expect(s.M1[2] + s.M2[2] * s.x[i]).toBeCloseTo(s.y[i], 12);
      }
    }
    // Positive balance protects highlights: the pair moves left until the shoulder sits on grey.
    const protectHighlights = filmicSpline(p({ balance: 50 }), power);
    expect(protectHighlights.x[3]).toBeCloseTo(base.x[2], 12);
    // Negative balance protects shadows: the pair moves right until the toe sits on grey.
    const protectShadows = filmicSpline(p({ balance: -50 }), power);
    expect(protectShadows.x[1]).toBeCloseTo(base.x[2], 12);
    const mild = filmicSpline(p({ balance: 25 }), power);
    expect(mild.x[1] - base.x[1]).toBeLessThan(0);
    expect(mild.x[1] - base.x[1]).toBeCloseTo(mild.x[3] - base.x[3], 12);
  });

  it("raises the contrast to the least slope that still reaches target black and white, plus the 0.01 margin", () => {
    const power = filmicPower(FILMIC_DEFAULTS);
    expect(filmicSpline(p({ contrast: 0 }), power).contrast).toBeCloseTo(1.01, 12);
    const greyLog = 9.55 / 12;
    const toWhite = (Math.pow(16, 1 / power) - Math.pow(0.1845, 1 / power)) / (1 - greyLog);
    expect(filmicSpline(p({ contrast: 0, white_point_target: 1600 }), power).contrast).toBeCloseTo(toWhite + 0.01, 12);
  });

  it("maps the target black and white through the hardness, black held at or below and white at or above the target grey", () => {
    const power = 4;
    const s = filmicSpline(p({ black_point_target: 2, white_point_target: 400 }), power);
    expect(s.y[0]).toBeCloseTo(Math.pow(0.02, 1 / power), 12);
    expect(s.y[4]).toBeCloseTo(Math.pow(4, 1 / power), 12);
    const held = filmicSpline(p({ black_point_target: 19, white_point_target: 10 }), power);
    expect(held.y[0]).toBeCloseTo(Math.pow(0.1845, 1 / power), 12);
    expect(held.y[4]).toBeCloseTo(Math.pow(0.1845, 1 / power), 12);
  });

  it("stores the target black and white on the line only for the perceptual curves' fallbacks", () => {
    const power = filmicPower(FILMIC_DEFAULTS);
    const perceptual = filmicSpline(p({}), power);
    expect([perceptual.M3[2], perceptual.M4[2]]).toEqual([perceptual.y[0], perceptual.y[4]]);
    const hard = filmicSpline(p({ shadows: CURVE_POLY_4, highlights: CURVE_POLY_4 }), power);
    expect([hard.M3[2], hard.M4[2]]).toEqual([0, 0]);
  });

  it("clamps latitude to 0-100 and balance to -50..50 as upstream does", () => {
    const power = filmicPower(FILMIC_DEFAULTS);
    const flat = filmicSpline(p({ latitude: -5 }), power);
    expect(flat.x[1]).toBe(flat.x[2]);
    expect(flat.x[3]).toBe(flat.x[2]);
    // Full latitude puts the nodes where the line is 1% of the display range from black and from white.
    const full = filmicSpline(p({ latitude: 100 }), power);
    expect(full.y[1] - full.y[0]).toBeCloseTo(0.01 * (full.y[4] - full.y[0]), 12);
    expect(full.y[4] - full.y[3]).toBeCloseTo(0.01 * (full.y[4] - full.y[0]), 12);
    expect(filmicSpline(p({ latitude: 150 }), power).x).toEqual(full.x);
    expect(filmicSpline(p({ balance: 80 }), power).x).toEqual(filmicSpline(p({ balance: 50 }), power).x);
    expect(filmicSpline(p({ balance: -80 }), power).x).toEqual(filmicSpline(p({ balance: -50 }), power).x);
  });

  it("takes middle grey from the target only with custom grey, clamped between the target black and white", () => {
    const power = 4;
    expect(filmicSpline(p({ grey_point_target: 20 }), power).greyDisplay).toBeCloseTo(Math.pow(0.1845, 1 / power), 12);
    expect(filmicSpline(p({ custom_grey: true, grey_point_target: 20 }), power).greyDisplay).toBeCloseTo(Math.pow(0.2, 1 / power), 12);
    expect(filmicSpline(p({ custom_grey: true, grey_point_target: 20, white_point_target: 10 }), power).greyDisplay).toBeCloseTo(
      Math.pow(0.1, 1 / power),
      12,
    );
    // CLAMP with black target above white target: glib returns the lower bound for a value under the upper one.
    const inverted = p({ custom_grey: true, grey_point_target: 5, black_point_target: 15, white_point_target: 10 });
    expect(filmicSpline(inverted, power).greyDisplay).toBeCloseTo(Math.pow(0.15, 1 / power), 12);
    // ...and the upper bound for one that is above it.
    const between = p({ custom_grey: true, grey_point_target: 12, black_point_target: 15, white_point_target: 10 });
    expect(filmicSpline(between, power).greyDisplay).toBeCloseTo(Math.pow(0.1, 1 / power), 12);
    const above = p({ custom_grey: true, grey_point_target: 30, black_point_target: 15, white_point_target: 10 });
    expect(filmicSpline(above, power).greyDisplay).toBeCloseTo(Math.pow(0.1, 1 / power), 12);
  });
});

describe("filmicGeometry", () => {
  it("is the geometry filmicSpline builds its nodes on", () => {
    const g = filmicGeometry(INTROSPECTION, 4);
    const s = filmicSpline(INTROSPECTION, 4);
    expect(g.contrast).toBe(s.contrast);
    expect(g.intercept).toBe(s.intercept);
    expect(g.greyLog).toBe(s.x[2]);
    expect(g.xmin).toBeLessThan(s.x[1]);
    expect(g.xmax).toBeGreaterThan(s.x[3]);
  });

  it("clamps the grey target as glib's CLAMP does when the black target is above the white target", () => {
    const inverted = p({ custom_grey: true, grey_point_target: 5, black_point_target: 15, white_point_target: 10 });
    expect(filmicGeometry(inverted, 4).greyDisplay).toBeCloseTo(Math.pow(0.15, 1 / 4), 12);
  });
});
