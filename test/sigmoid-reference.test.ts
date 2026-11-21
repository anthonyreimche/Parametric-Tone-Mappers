// The Sigmoid twin against darktable's own C, compiled by
// test/reference/sigmoid-build.mjs in two builds: upstream's floats, and the
// same code with every float a double.
//
//  • commit_params's data equals the float build's: the twin rounds as
//    darktable does there, so it draws darktable's curve.
//  • The matrices and every pixel equal the double build's to ~1e-9, with the
//    double build's curve constants: the transcription is exact.
//  • End to end, every pixel lands within float rounding of the float build,
//    except where that rounding is all the float build draws (FLOAT_BOUND).
//
// The harness's "v2" pipe is darktable with Safelight's working space (linear
// Rec.709, the sRGB profile) as its working profile, which is what process
// version 2 draws. Its "v1" pipe is darktable's default, a linear Rec2020
// working profile; version 1 draws that between conversions from and back to
// Safelight's Rec.709 values.

import { describe, expect, it } from "vitest";
import { apply, columnMajor, mul, type Mat3, type Vec3 } from "../src/colour/mat3";
import { REC2020_TO_REC709, REC709_TO_REC2020 } from "../src/colour/profiles";
import { deriveSigmoid, sigmoidData, sigmoidMatrices, type SigmoidUniforms } from "../src/sigmoid/derive";
import { SIGMOID_DEFAULTS, type SigmoidParams } from "../src/sigmoid/params";
import { sigmoidPixel } from "../src/sigmoid/twin";
import fixturesText from "./reference/sigmoid-fixtures.json?raw";

interface Matrices {
  pipe_to_base: number[];
  base_to_rendering: number[];
  rendering_to_pipe: number[];
}

interface Data {
  white_target: number;
  black_target: number;
  paper_exposure: number;
  film_fog: number;
  film_power: number;
  paper_power: number;
  hue_preservation: number;
}

interface Build {
  data: Data;
  v2: { matrices: Matrices; outputs: Vec3[] };
  v1: { matrices: Matrices; outputs: Vec3[] };
}

interface Fixture {
  name: string;
  params: Partial<SigmoidParams>;
  float: Build;
  double: Build;
}

const fixtures = JSON.parse(fixturesText) as { defaults: Record<string, number>; inputs: Vec3[]; cases: Fixture[] };

// Upstream's base primaries 0 is the working profile; the extension's default
// is Rec2020 (1), so a fixture without one sets 0 explicitly.
const paramsOf = (f: Fixture): SigmoidParams => ({ ...SIGMOID_DEFAULTS, base_primaries: 0, ...f.params });

// Where float rounding alone decides what the float build draws. At contrast
// 0.1 and 0.7 the film fog is ~1e-33 and ~5e-6, so the curve near 0 is
// x^0.1 or x^0.69: a channel _desaturate_negative_values takes to exactly 0
// lands a few float ulps either side, which those powers turn into up to 20 %
// of the channel. At attenuations of 99 % the rendering primaries sit within
// 1 % of white, and inverting them costs the float build five digits.
const FLOAT_BOUND = new Set(["contrast 0.1", "contrast 0.7", "insets at the hard ends"]);

// At contrast 0.1 the curve is x^0.1 near 0 in doubles too: version 1's round
// trip through Rec.709 leaves ~1e-17 in a channel desaturated to exactly 0,
// which that power makes 0.02. Version 2 has no round trip and is held exact.
const ROUND_TRIP_BOUND = new Set(["contrast 0.1"]);

const close = (got: number, want: number, abs: number, rel: number) => Math.abs(got - want) <= abs + rel * Math.abs(want);

const asMat = (a: readonly number[]): Mat3 => [a[0], a[1], a[2], a[3], a[4], a[5], a[6], a[7], a[8]];

function expectMatrix(got: Mat3, want: Mat3, tolerance: number, label: string): void {
  got.forEach((v, i) => expect(close(v, want[i], tolerance, tolerance), `${label}[${i}]: ${v} vs ${want[i]}`).toBe(true));
}

/** Within `tolerance` of the pixel's largest channel (or of 1e-3, for a near-black pixel). */
function expectPixel(got: Vec3, want: Vec3, tolerance: number, label: string): void {
  const scale = Math.max(Math.abs(want[0]), Math.abs(want[1]), Math.abs(want[2]), 1e-3);
  for (let c = 0; c < 3; c++) {
    expect(Math.abs(got[c] - want[c]) <= tolerance * scale, `${label} ch ${c}: ${got[c]} vs ${want[c]}`).toBe(true);
  }
}

/** The version 1 matrices the twin draws for a C pipe of linear Rec2020. */
const version1 = (m: Matrices) => ({
  pipeToBase: mul(asMat(m.pipe_to_base), REC709_TO_REC2020),
  baseToRendering: asMat(m.base_to_rendering),
  renderingToPipe: mul(REC2020_TO_REC709, asMat(m.rendering_to_pipe)),
});

/** The twin's uniforms with a build's curve constants and matrices in place of its own. */
function uniformsOf(p: SigmoidParams, b: Build): SigmoidUniforms {
  const d = b.data;
  const v1 = version1(b.v1.matrices);
  return {
    sgPipeToBase: columnMajor(asMat(b.v2.matrices.pipe_to_base)),
    sgBaseToRendering: columnMajor(asMat(b.v2.matrices.base_to_rendering)),
    sgRenderingToPipe: columnMajor(asMat(b.v2.matrices.rendering_to_pipe)),
    sgPipeToBaseV1: columnMajor(v1.pipeToBase),
    sgBaseToRenderingV1: columnMajor(v1.baseToRendering),
    sgRenderingToPipeV1: columnMajor(v1.renderingToPipe),
    sgCurve: [d.white_target, d.paper_exposure, d.film_fog, d.film_power],
    sgShape: [d.paper_power, d.black_target, d.hue_preservation, p.color_processing],
  };
}

/** A pixel through the twin, as the harness's pipe sees it. */
function render(px: Vec3, u: SigmoidUniforms, version: 1 | 2): Vec3 {
  return version === 2 ? sigmoidPixel(px, u, 2) : apply(REC709_TO_REC2020, sigmoidPixel(apply(REC2020_TO_REC709, px), u, 1));
}

describe("the fixtures", () => {
  it("come from darktable release-5.6.2 with upstream's $DEFAULTs", () => {
    expect(fixtures.cases.length).toBeGreaterThan(30);
    const { base_primaries, ...rest } = fixtures.defaults;
    expect(base_primaries).toBe(0);
    expect({ ...SIGMOID_DEFAULTS, ...rest }).toEqual(SIGMOID_DEFAULTS);
  });
});

describe.each(fixtures.cases)("$name", (f) => {
  const p = paramsOf(f);

  // commit_params's slope is a float finite difference over 2e-6 at middle
  // grey: darktable's default contrast of 1.5 renders as a film power of 1.4909.
  it("derives commit_params's data as darktable does, in floats", () => {
    const d = sigmoidData(p);
    const want = f.float.data;
    expect(close(d.whiteTarget, want.white_target, 0, 1e-7)).toBe(true);
    expect(close(d.blackTarget, want.black_target, 0, 1e-7)).toBe(true);
    expect(close(d.paperPower, want.paper_power, 0, 1e-7)).toBe(true);
    expect(close(d.huePreservation, want.hue_preservation, 0, 1e-7)).toBe(true);
    expect(close(d.filmPower, want.film_power, 0, 2e-6), `film power ${d.filmPower} vs ${want.film_power}`).toBe(true);
    expect(close(d.paperExposure, want.paper_exposure, 1e-30, 2e-5), `paper exposure ${d.paperExposure} vs ${want.paper_exposure}`).toBe(true);
    expect(close(d.filmFog, want.film_fog, 1e-30, 2e-5), `film fog ${d.filmFog} vs ${want.film_fog}`).toBe(true);
  });

  it.each([2, 1] as const)("builds upstream's primaries matrices exactly, on version %i", (version) => {
    const m = sigmoidMatrices(p, version);
    const c = version === 2 ? f.double.v2.matrices : f.double.v1.matrices;
    const want = version === 2
      ? { pipeToBase: asMat(c.pipe_to_base), baseToRendering: asMat(c.base_to_rendering), renderingToPipe: asMat(c.rendering_to_pipe) }
      : version1(c);
    expectMatrix(m.pipeToBase, want.pipeToBase, 1e-9, "pipe to base");
    expectMatrix(m.baseToRendering, want.baseToRendering, 1e-9, "base to rendering");
    expectMatrix(m.renderingToPipe, want.renderingToPipe, 1e-9, "rendering to pipe");
  });

  it.each([2, 1] as const)("transcribes every pixel exactly, on version %i", (version) => {
    if (version === 1 && ROUND_TRIP_BOUND.has(f.name)) return;
    const u = uniformsOf(p, f.double);
    const outputs = version === 2 ? f.double.v2.outputs : f.double.v1.outputs;
    fixtures.inputs.forEach((px, i) => expectPixel(render(px, u, version), outputs[i], 1e-9, `pixel ${i} ${px}`));
  });

  it.skipIf(FLOAT_BOUND.has(f.name)).each([2, 1] as const)("renders every pixel as darktable does, on version %i", (version) => {
    const u = deriveSigmoid(p);
    const outputs = version === 2 ? f.float.v2.outputs : f.float.v1.outputs;
    fixtures.inputs.forEach((px, i) => expectPixel(render(px, u, version), outputs[i], 2e-5, `pixel ${i} ${px}`));
  });
});
