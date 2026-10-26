// Both transforms on the real renderer. Run via `npm run test:gpu` (run.cjs
// copies this file into a SafeLight checkout and runs it under its headless
// Chromium + SwiftShader rig). What the CPU suite can't check:
//  • both programs compile and link with the host's namespacing and derived
//    uniforms, beside the built-in stages, on process versions 2 and 3;
//  • over a grid of settings, every patch of a test chart matches the twin.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolvePipelineFor } from "@/extensions/pipelines";
import { registerPipeline, unregisterExtension } from "@/extensions/registry";
import { bagForRender } from "@/extensions/transform-derive";
import type { WebGLRenderer } from "@/rendering/webgl/renderer";
import {
  builtinStages, floatImage, identityParams, pixelAt, rendererBuildError, toHalf, withRenderer,
} from "@/rendering/webgl/webgl.test-support";
import { deriveAgx } from "@ptm/agx/derive";
import { AGX_DEFAULTS, type AgxParams } from "@ptm/agx/params";
import { AGX_ID, agxTransform } from "@ptm/agx/transform";
import { agxPixel } from "@ptm/agx/twin";
import { deriveFilmic } from "@ptm/filmic/derive";
import { FILMIC_DEFAULTS, type FilmicParams } from "@ptm/filmic/params";
import { FILMIC_ID, filmicTransform } from "@ptm/filmic/transform";
import { filmicPixel } from "@ptm/filmic/twin";
import { encodeSrgb } from "@ptm/glsl/common";
import type { Vec3 } from "@ptm/colour/mat3";

const EXT = "parametric-tonemappers";
const PATCHES: Vec3[] = [
  [0.0018, 0.0018, 0.0018], [0.018, 0.018, 0.018], [0.18, 0.18, 0.18], [1, 1, 1], [4, 4, 4], [16, 16, 16],
  [1.5, 0.1, 0.05], [0.05, 1.2, 0.1], [0.1, 0.2, 3.0], [-0.2, 0.6, -0.1], [0.45, 0.3, 0.22], [0.02, 0.01, 0.03],
];
const W = PATCHES.length * 4;
const H = 4;
const CHART = floatImage(W, H, (x) => PATCHES[Math.floor(x / 4)]);
const AS_DRAWN = { encoding: "perceptual", primaries: "rec709" } as const;

beforeAll(() => {
  registerPipeline(EXT, agxTransform());
  registerPipeline(EXT, filmicTransform());
});
afterAll(() => unregisterExtension(EXT));

function render(id: string, bag: Record<string, unknown>, version: number): Vec3[] {
  const pipeline = resolvePipelineFor(id);
  return withRenderer({ stages: [], pipeline, processVersionCap: 3 }, (r: WebGLRenderer) => {
    r.setImage(CHART);
    r.setParams(identityParams({ processVersion: version, displayTransform: id }));
    r.setContributedParams(bagForRender(pipeline, bag));
    const f = r.readFloatFrame("pre-output", Infinity, AS_DRAWN);
    if (!f) throw new Error("readFloatFrame returned null");
    return PATCHES.map((_, i) => pixelAt(f, i * 4 + 1, 1));
  });
}

// The source is RGBA16F, so the twin takes the values the GPU holds.
const half3 = (v: Vec3): Vec3 => [toHalf(v[0]), toHalf(v[1]), toHalf(v[2])];
const encode3 = (v: Vec3): Vec3 => [encodeSrgb(v[0]), encodeSrgb(v[1]), encodeSrgb(v[2])];

const bagOf = (id: string, values: Record<string, number | boolean>) =>
  Object.fromEntries(Object.entries(values).map(([k, v]) => [`${id}.${k}`, v]));

function compare(label: string, got: Vec3[], want: Vec3[], tolerance: number): void {
  got.forEach((g, i) => g.forEach((v, ch) => {
    const d = Math.abs(v - want[i][ch]);
    expect(d, `${label} patch ${i} ch ${ch}`).toBeLessThan(tolerance);
  }));
}

const AGX_CASES: [string, Partial<AgxParams>][] = [
  ["defaults", {}],
  ["blender-like base", { curve_shoulder_power: 1.5, curve_toe_power: 1.5, curve_gamma: 2.4, curve_contrast_around_pivot: 2.4535246 }],
  ["punchy look", { look_brightness: 1 / 1.35 ** 2, look_saturation: 1.4, curve_gamma: 2.4 }],
  ["no hue restore", { look_original_hue_mix_ratio: 0 }],
  ["Display P3 base", { base_primaries: 3 }],
  ["Adobe RGB base", { base_primaries: 4 }],
  ["sRGB base", { base_primaries: 5 }],
  ["auto gamma", { auto_gamma: true }],
  ["power 10 at target white", { curve_toe_power: 10, curve_shoulder_power: 10, curve_pivot_y_linear_output: 1 }],
  ["linear sections", { curve_linear_ratio_below_pivot: 0.5, curve_linear_ratio_above_pivot: 0.5 }],
  ["faded targets", { curve_target_display_black_ratio: 0.1, curve_target_display_white_ratio: 0.6 }],
  ["disabled primaries", { disable_primaries_adjustments: true }],
  ["reverse all", { completely_reverse_primaries: true }],
];

const FILMIC_CASES: [string, Partial<FilmicParams>][] = [
  ["defaults", {}],
  ...[5, 6, 8, 9].map((version): [string, Partial<FilmicParams>] => [`version ${version}`, { version }]),
  ...[0, 1, 2].map((type): [string, Partial<FilmicParams>] => [`curves ${type}`, { shadows: type, highlights: type }]),
  ["custom grey", { custom_grey: true, grey_point_source: 12, grey_point_target: 20 }],
  ["manual hardness", { auto_hardness: false, output_power: 3 }],
  ["wide latitude, balanced", { latitude: 50, balance: 30 }],
  ["hue kept", { saturation: 100 }],
  ["hue drifts", { saturation: -100 }],
  ["black target 0", { black_point_target: 0 }],
  [
    "hard toe, perceptual shoulder, shoulder overflow",
    { shadows: 0, highlights: 3, black_point_source: -14, white_point_source: 2, contrast: 3, latitude: 35, balance: -50, auto_hardness: false, output_power: 6 },
  ],
];

describe("both transforms", () => {
  it.each([AGX_ID, FILMIC_ID])("%s compiles beside the built-in stages", (id) => {
    expect(rendererBuildError({ stages: builtinStages(), pipeline: resolvePipelineFor(id), processVersionCap: 3 })).toBeNull();
  });
});

describe("AgX on the GPU", () => {
  it.each(AGX_CASES)("matches the twin: %s", (label, over) => {
    const params = { ...AGX_DEFAULTS, ...over };
    const u = deriveAgx(params);
    const want = PATCHES.map((p) => encode3(agxPixel(half3(p), u)));
    for (const version of [2, 3]) compare(`${label} v${version}`, render(AGX_ID, bagOf(AGX_ID, params), version), want, 5e-4);
  });
});

describe("Filmic on the GPU", () => {
  it.each(FILMIC_CASES)("matches the twin: %s", (label, over) => {
    const params = { ...FILMIC_DEFAULTS, ...over };
    const u = deriveFilmic(params);
    const want = PATCHES.map((p) => encode3(filmicPixel(half3(p), u)));
    for (const version of [2, 3]) compare(`${label} v${version}`, render(FILMIC_ID, bagOf(FILMIC_ID, params), version), want, 1e-3);
  });
});
