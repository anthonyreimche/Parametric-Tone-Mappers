import { describe, expect, it } from "vitest";
import { SIGMOID_UNIFORM_TYPES } from "../src/sigmoid/derive";
import { SIGMOID_GLSL, SIGMOID_HELPERS } from "../src/sigmoid/glsl";
import { SIGMOID_PARAMS } from "../src/sigmoid/params";
import { SIGMOID_DEFAULT_UNIFORMS, SIGMOID_ID, sigmoidTransform } from "../src/sigmoid/transform";

const SOURCE = `${SIGMOID_HELPERS}\n${SIGMOID_GLSL}`;

describe("Sigmoid GLSL", () => {
  it("defines pipelineToDisplay and reads every derived uniform", () => {
    expect(SIGMOID_GLSL).toContain("vec3 pipelineToDisplay(vec3 lin)");
    for (const key of Object.keys(SIGMOID_UNIFORM_TYPES)) expect(SOURCE, key).toMatch(new RegExp(`\\b${key}\\b`));
  });

  it("is per-pixel: no texture fetch, no derivative", () => {
    expect(SOURCE).not.toMatch(/\btexture(Lod|Fetch|Grad|Offset)?\s*\(|\btexelFetch\s*\(|\bdFd[xy]\s*\(/);
  });

  // Builds before Safelight 3.2.0 don't define SL_PROCESS_VERSION, and #if on an undefined name fails to compile.
  it("uses the preprocessor only for the process version gate, which builds without it pass", () => {
    const directives = [...SOURCE.matchAll(/^\s*#.*$/gm)].map((m) => m[0].trim());
    expect(directives).toEqual(["#ifdef SL_PROCESS_VERSION", "#if SL_PROCESS_VERSION >= 2", "#endif", "#endif"]);
  });

  it("draws version 1 with its own matrices", () => {
    for (const m of ["sgPipeToBase", "sgBaseToRendering", "sgRenderingToPipe"]) {
      expect(SOURCE, m).toMatch(new RegExp(`\\bv2 \\? ${m} : ${m}V1\\b`));
    }
  });

  // GLSL leaves pow(x, y) undefined for x = 0 with y <= 0 and for any x < 0;
  // upstream's pow(fog + x, power) over a huge input overflows to inf / inf.
  it("never raises zero or a negative to a power, nor divides an overflow", () => {
    expect(SOURCE).not.toMatch(/pow\(\s*film/);
    expect(SOURCE).toMatch(/exp2\(-sgCurve\.w \* log2\(base\)\)/);
  });

  it("keeps out of the host's template traps", () => {
    expect(SOURCE).not.toContain("`");
    // A bare integer assigned to a float is a compile error in GLSL ES.
    expect(SOURCE).not.toMatch(/\bfloat\s+\w+\s*=\s*-?\d+\s*;/);
  });
});

describe("sigmoidTransform", () => {
  it("registers the transform with its params and derived uniforms", () => {
    const t = sigmoidTransform();
    expect(t.id).toBe(SIGMOID_ID);
    expect(t.id).toBe("parametric-tonemappers.sigmoid");
    expect(t.name).toBe("Sigmoid (parametric)");
    expect(t.skipBaseCurve && t.skipToneShoulder).toBe(true);
    expect(t.params?.map((d) => d.key)).toEqual(Object.keys(SIGMOID_PARAMS));
    expect(t.derive?.uniforms.map((u) => u.key)).toEqual(Object.keys(SIGMOID_UNIFORM_TYPES));
    expect(Object.keys(t.derive!.fn({}))).toEqual(Object.keys(SIGMOID_UNIFORM_TYPES));
  });

  it("falls back to the defaults' uniforms, every one finite", () => {
    expect(sigmoidTransform().derive?.uniforms.map((u) => u.default)).toEqual(Object.values(SIGMOID_DEFAULT_UNIFORMS));
    for (const v of Object.values(SIGMOID_DEFAULT_UNIFORMS)) expect(v.every(Number.isFinite)).toBe(true);
  });

  it("reads stored values held to their hard range", () => {
    const fn = sigmoidTransform().derive!.fn;
    expect(fn({ middle_grey_contrast: 50 })).toEqual(fn({ middle_grey_contrast: 10 }));
    expect(fn({ display_white_target: Number.NaN })).toEqual(fn({}));
  });
});
