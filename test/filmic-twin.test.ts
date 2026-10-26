import { describe, expect, it } from "vitest";
import { apply, type Mat3, type Vec3 } from "../src/colour/mat3";
import { lmsToYrg } from "../src/colour/yrg";
import { compressNegatives, sanitise } from "../src/glsl/common";
import { filmicPixel } from "../src/filmic/twin";
import { deriveFilmic, type FilmicUniforms } from "../src/filmic/derive";
import { CURVE_POLY_3, CURVE_POLY_4, CURVE_RATIONAL, CURVE_SIGMOID, FILMIC_DEFAULTS, type FilmicParams } from "../src/filmic/params";
import { EXPORT_INPUT, FILMIC_PIPE, PIPE_LUMA, PIPE_TO_LMS } from "../src/filmic/spaces";

const p = (over: Partial<FilmicParams>): FilmicParams => ({ ...FILMIC_DEFAULTS, ...over });
const RAW_BIAS_0 = deriveFilmic(p({ black_point_source: -8.85, white_point_source: 3.15 }));
const INTROSPECTION = deriveFilmic(p({ black_point_source: -8, white_point_source: 4, auto_hardness: false, output_power: 4 }));
const BLACK_FLOOR = 0.0001517634;

const grey = (u: FilmicUniforms, v: number) => filmicPixel([v, v, v], u);

// Yrg chroma of an RGB triple in the space `toLms` reads it from.
function chromaOf(rgb: Vec3, toLms: Mat3): number {
  const yrg = lmsToYrg(apply(toLms, rgb));
  return Math.hypot(yrg[2] - 0.54371398, yrg[1] - 0.21902143);
}

describe("filmicPixel", () => {
  // The two grey ramps are Ref 2.12's values: the Reference's own JS transcription
  // of the spline, not an Ansel run (it says to confirm them against a native build).
  it("renders the raw-default grey ramp", () => {
    const ramp: [number, number][] = [
      [0.0001, 0.000152], [0.001, 0.000357], [0.01, 0.004456], [0.05, 0.035036],
      [0.1845, 0.1845], [0.5, 0.496129], [1.0, 0.807589], [1.64, 1.0], [8, 1.0],
    ];
    for (const [inp, out] of ramp) for (const ch of grey(RAW_BIAS_0, inp)) expect(ch, `grey ${inp}`).toBeCloseTo(out, 5);
  });

  it("renders the introspection-default grey ramp", () => {
    const ramp: [number, number][] = [[0.01, 0.003781], [0.05, 0.033239], [1.0, 0.721472], [2.0, 0.938924], [2.95, 1.0]];
    for (const [inp, out] of ramp) for (const ch of grey(INTROSPECTION, inp)) expect(ch, `grey ${inp}`).toBeCloseTo(out, 5);
  });

  it("puts middle grey on the identity line, the black floor at 0 and white at 1 for every curve pair", () => {
    const curves = [CURVE_POLY_4, CURVE_POLY_3, CURVE_RATIONAL, CURVE_SIGMOID];
    for (const shadows of curves) {
      for (const highlights of curves) {
        const u = deriveFilmic(p({ shadows, highlights }));
        const label = `shadows ${shadows} highlights ${highlights}`;
        expect(grey(u, 0.1845)[1], label).toBeCloseTo(0.1845, 6);
        expect(grey(u, 0)[1], label).toBeCloseTo(BLACK_FLOOR, 6);
        expect(grey(u, 1e3)[1], label).toBeCloseTo(1, 6);
        let previous = -Infinity;
        for (let ev = -12; ev <= 8; ev += 0.25) {
          const v = grey(u, 0.1845 * 2 ** ev)[1];
          expect(Number.isFinite(v), `${label} ev ${ev}`).toBe(true);
          expect(v, `${label} ev ${ev}`).toBeGreaterThanOrEqual(previous - 1e-9);
          previous = v;
        }
      }
    }
  });

  it("joins the latitude to the toe and shoulder with matching value and slope, for every curve pair and range", () => {
    const setups: Partial<FilmicParams>[] = [{}, { black_point_source: -6, white_point_source: 3 }, { latitude: 50, balance: 30, contrast: 2 }];
    const curves = [CURVE_POLY_4, CURVE_POLY_3, CURVE_RATIONAL, CURVE_SIGMOID];
    for (const setup of setups) {
      for (const shadows of curves) {
        for (const highlights of curves) {
          const u = deriveFilmic(p({ ...setup, shadows, highlights }));
          const label = `${JSON.stringify(setup)} shadows ${shadows} highlights ${highlights}`;
          const [latMin, latMax, white, power] = u.fNodes;
          const [greySource, black, range] = u.fLog;
          const contrast = u.fM2[2];
          // The curve at spline position x, read back from a grey pixel through the log encoding and the output power.
          const curve = (x: number) => grey(u, greySource * 2 ** (x * range + black))[1] ** (1 / power);
          const e = 2e-4;
          for (const node of [latMin, latMax]) {
            expect(Math.abs(curve(node + 1e-6) - curve(node - 1e-6)), `${label} value at ${node}`).toBeLessThan(5e-6);
            expect((curve(node - e) - curve(node - 2 * e)) / e, `${label} slope below ${node}`).toBeCloseTo(contrast, 2);
            expect((curve(node + 2 * e) - curve(node + e)) / e, `${label} slope above ${node}`).toBeCloseTo(contrast, 2);
          }
          expect(curve(0), label).toBeCloseTo(u.fDisplay[0] ** (1 / power), 6);
          expect(curve(1), label).toBeCloseTo(white, 6);
        }
      }
    }
  });

  it("floors the curve at 0 where a hard or soft toe dips below it", () => {
    for (const shadows of [CURVE_POLY_4, CURVE_POLY_3]) {
      const u = deriveFilmic(p({ shadows, latitude: 50, balance: 40, black_point_source: -8, white_point_source: 6 }));
      const [greySource, black, range] = u.fLog;
      const below = Array.from({ length: 41 }, (_, k) => grey(u, greySource * 2 ** (k * 0.025 * range + black)));
      // The setting is the one where the polynomial goes negative: the toe's low end sits on the black floor.
      expect(below[8][1]).toBeCloseTo(u.fDisplay[0], 6);
      for (const px of below) {
        for (const ch of px) {
          expect(Number.isFinite(ch), `shadows ${shadows}`).toBe(true);
          expect(ch).toBeGreaterThanOrEqual(u.fDisplay[0] - 1e-9);
        }
      }
    }
  });

  it("reads the toe's power-curve fallback only when its flag is set", () => {
    const base = deriveFilmic(FILMIC_DEFAULTS);
    // A fixture: the flag the sliders never set, with a toe y = y0 + 0.5 * x^2.
    const flagged: FilmicUniforms = {
      ...base,
      fM3: [0.5, base.fM3[1], base.fM3[2], 0],
      fM4: [2, base.fM4[1], base.fM4[2], 0],
      fM5: [1, base.fM5[1], base.fM5[2], 0],
    };
    const mapped = (Math.log2(0.0123 / base.fLog[0]) - base.fLog[1]) / base.fLog[2];
    expect(mapped).toBeGreaterThan(0);
    expect(mapped).toBeLessThan(base.fNodes[0]);
    const expected = Math.pow(base.fM3[2] + 0.5 * mapped ** 2, base.fNodes[3]);
    expect(grey(flagged, 0.0123)[1]).toBeCloseTo(expected, 6);
    expect(grey(base, 0.0123)[1]).not.toBeCloseTo(expected, 3);
  });

  it("never brightens a colour's chroma, and stays in [0, display white]", () => {
    const u = deriveFilmic(FILMIC_DEFAULTS);
    for (const c of [[1.5, 0.1, 0.05], [0.05, 1.2, 0.1], [0.1, 0.2, 3.0], [-0.2, 0.6, -0.1], [0.4, 0.3, 0.2]] as const) {
      const out = filmicPixel(c, u);
      const original = chromaOf(compressNegatives(sanitise(apply(FILMIC_PIPE, c)), PIPE_LUMA), PIPE_TO_LMS);
      expect(chromaOf(out, EXPORT_INPUT), `${c}`).toBeLessThanOrEqual(original + 1e-9);
      for (const ch of out) {
        expect(ch).toBeGreaterThanOrEqual(0);
        expect(ch).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });

  it("bleaches a brightening colour smoothly toward white", () => {
    const u = deriveFilmic(FILMIC_DEFAULTS);
    const chroma = (scale: number) => chromaOf(filmicPixel([0.8 * scale, 0.3 * scale, 0.1 * scale], u), EXPORT_INPUT);
    const steps = [0.5, 1, 1.5, 2, 3].map(chroma);
    expect(steps[0]).toBeGreaterThan(0.1);
    for (let i = 1; i < steps.length; i++) expect(steps[i], `step ${i}`).toBeLessThan(steps[i - 1]);
    expect(steps[4]).toBeGreaterThan(0);
    expect(chroma(4)).toBeLessThan(1e-6);
  });

  it("maps NaN input to the black floor, as zero does", () => {
    const u = deriveFilmic(FILMIC_DEFAULTS);
    const black = filmicPixel([0, 0, 0], u);
    const nan = filmicPixel([Number.NaN, Number.NaN, Number.NaN], u);
    for (let i = 0; i < 3; i++) {
      expect(Math.abs(nan[i] - black[i])).toBeLessThan(1e-12);
      expect(nan[i]).toBeCloseTo(BLACK_FLOOR, 6);
    }
  });

  it("maps infinite input to display white", () => {
    const u = deriveFilmic(FILMIC_DEFAULTS);
    for (const ch of filmicPixel([Infinity, Infinity, Infinity], u)) expect(ch).toBeCloseTo(1, 6);
    for (const ch of filmicPixel([-Infinity, -Infinity, -Infinity], u)) expect(Number.isFinite(ch)).toBe(true);
  });

  it("keeps the frame finite when the custom grey source is 0", () => {
    const u = deriveFilmic(p({ custom_grey: true, grey_point_source: 0 }));
    expect(u.fLog[0]).toBe(0);
    for (const c of [[0, 0, 0], [0.5, 0.5, 0.5], [1.5, 0.1, 0.05], [-0.2, 0.6, -0.1], [1e-40, 0, 0]] as const) {
      for (const ch of filmicPixel(c, u)) {
        expect(Number.isFinite(ch), `${c}`).toBe(true);
        expect(ch).toBeGreaterThanOrEqual(0);
        expect(ch).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
    // Upstream divides by the zero: every positive channel reads +inf and clamps to the top of the range.
    for (const ch of grey(u, 0.5)) expect(ch).toBeCloseTo(1, 6);
  });
});

// Twin outputs pinned one chroma-path branch at a time: hue recovery at both
// ends, every bracket, the negatives compression, the gamut mapper's clips and
// a curve that leaves [0, white]. No native Ansel build exists to compare
// against, so these guard the transcription against drift, not against Ansel.
const OVERSHOOT: Partial<FilmicParams> = { shadows: CURVE_SIGMOID, highlights: CURVE_POLY_3, latitude: 50, balance: -40, black_point_source: -8, white_point_source: 6, white_point_target: 150 };
const PINS: [string, Partial<FilmicParams>, Vec3, Vec3][] = [
  ["defaults", {}, [1.5, 0.1, 0.05], [1, 0.24084847, 0.19514047]],
  ["defaults", {}, [0.05, 1.2, 0.1], [0.6084903, 1, 0.62609015]],
  ["defaults", {}, [0.1, 0.2, 3], [0.36836865, 0.37314438, 1]],
  ["defaults", {}, [-0.2, 0.6, -0.1], [0, 0.70055147, 0.08955058]],
  ["defaults", {}, [0.4, 0.3, 0.2], [0.41307233, 0.3168013, 0.21119661]],
  ["defaults", {}, [1.6, 0.6, 0.2], [1, 0.75141994, 0.63688104]],
  ["defaults", {}, [0.9, 0.05, 0.6], [0.8966422, 0.04981893, 0.59825657]],
  ["hue recovery 0", { saturation: -200 }, [-0.85, 0.006, 12.9], [0.53279574, 0.63281854, 1]],
  ["hue recovery 0", { saturation: -200 }, [1.527, 1.018, -0.001], [0.99410099, 1, 0.76740098]],
  ["hue recovery 0", { saturation: -200 }, [1.02, 0.024, 1.175], [0.89506459, 0.08998718, 1]],
  ["hue recovery 0", { saturation: -200 }, [-1.4, 0.87, 1.03], [0.99787056, 0.99980608, 1]],
  ["hue recovery 1", { saturation: 200 }, [1.5, 0.1, 0.05], [1, 0.23902531, 0.21184762]],
  ["hue recovery 1", { saturation: 200 }, [0.1, 0.2, 3], [0.35518716, 0.37742211, 1]],
  ["no bleach", { version: 5 }, [3.027, 0.441, -0.025], [1, 0.90821326, 0.8585979]],
  ["extra bleach", { version: 9 }, [3.027, 0.441, -0.025], [1, 0.91400406, 0.89305455]],
  ["extra bleach", { version: 9 }, [0.3, 0.1, 0.02], [0.27658474, 0.09184241, 0.01881104]],
  ["extra bleach", { version: 9 }, [-0.0005, -0.0001, 0.01], [0, 0.0001691602, 0.004015403]],
  ["safe curves", { shadows: CURVE_RATIONAL, highlights: CURVE_RATIONAL }, [-1.3054, 1.1662, 0.1452], [0.99999997, 1, 0.99999995]],
  ["safe curves", { shadows: CURVE_RATIONAL, highlights: CURVE_RATIONAL }, [-0.011, -0.0088, 1.112], [0.02191675, 0, 0.93473367]],
  ["hard curves", { shadows: CURVE_POLY_4, highlights: CURVE_POLY_4 }, [-0.6014, 0.8038, 0.1002], [0.33554511, 1, 0.67120427]],
  ["hard curves", { shadows: CURVE_POLY_4, highlights: CURVE_POLY_4 }, [-0.0777, 0.8154, 0.0114], [0, 0.97914488, 0.10037209]],
  ["hard curves", { shadows: CURVE_POLY_4, highlights: CURVE_POLY_4 }, [1.5, 0.1, 0.05], [1, 0.27906471, 0.24382484]],
  ["raw exposure", { black_point_source: -8.85, white_point_source: 3.15 }, [3.927, -0.4388, -3.678], [1, 0.99147569, 0.98239138]],
  ["black target 0", { black_point_target: 0 }, [-6.67, 0.000136, 0.006785], [0.73816722, 0.99578816, 1]],
  ["overshoot", OVERSHOOT, [-1.76, 3.96, 0.1], [1.07164302, 1.5, 1.23220755]],
  ["overshoot", OVERSHOOT, [-1.5, 4, 0.1], [1.1403713, 1.5, 1.2629975]],
];

describe("filmicPixel regression pins (twin output, not Ansel values)", () => {
  it.each(PINS)("%s: %j", (_name, over, input, expected) => {
    const out = filmicPixel(input, deriveFilmic(p(over)));
    for (let i = 0; i < 3; i++) expect(out[i], `channel ${i}`).toBeCloseTo(expected[i], 7);
  });

  // Outputs near 4e-7 sit below the absolute 5e-8 of the pins above: compared by ratio.
  it("pins a near-black pixel to a relative 1e-4", () => {
    const out = filmicPixel([0.001, 0.0005, 0.002], deriveFilmic(p({ black_point_target: 0 })));
    const expected = [3.693575691e-7, 2.119439656e-7, 8.362579417e-7];
    for (let i = 0; i < 3; i++) expect(out[i] / expected[i], `channel ${i}`).toBeCloseTo(1, 4);
  });
});
