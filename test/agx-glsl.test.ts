import { describe, expect, it } from "vitest";
import { AGX_GLSL, AGX_HELPERS } from "../src/agx/glsl";
import { AGX_UNIFORM_TYPES } from "../src/agx/derive";
import { AGX_ID, agxTransform } from "../src/agx/transform";

const SOURCE = `${AGX_HELPERS}\n${AGX_GLSL}`;

describe("AgX GLSL", () => {
  it("defines pipelineToDisplay and reads every derived uniform", () => {
    expect(AGX_GLSL).toContain("vec3 pipelineToDisplay(vec3 lin)");
    for (const key of Object.keys(AGX_UNIFORM_TYPES)) expect(SOURCE, key).toMatch(new RegExp(`\\b${key}\\b`));
  });

  it("is per-pixel: no texture fetch, no derivative", () => {
    expect(SOURCE).not.toMatch(/\btexture(Lod|Fetch|Grad|Offset)?\s*\(|\btexelFetch\s*\(|\bdFd[xy]\s*\(/);
  });

  // Builds before Safelight 3.2.0 don't define SL_PROCESS_VERSION, and #if on an undefined name fails to compile.
  it("uses the preprocessor only for the process version gate, which builds without it pass", () => {
    const directives = [...SOURCE.matchAll(/^\s*#.*$/gm)].map((m) => m[0].trim());
    expect(directives).toEqual(["#ifdef SL_PROCESS_VERSION", "#if SL_PROCESS_VERSION >= 2", "#endif", "#endif"]);
  });

  it("draws version 1 with its own matrices and luminance", () => {
    expect(SOURCE).toMatch(/\bagxV2\(\)\s*\?\s*agxLumaY\s*:\s*agxLumaYV1\b/);
    for (const m of ["agxPipeToBase", "agxBaseToRendering", "agxRenderingToPipe"]) {
      expect(AGX_GLSL, m).toMatch(new RegExp(`\\bv2 \\? ${m} : ${m}V1\\b`));
    }
  });

  it("keeps out of the host's template traps", () => {
    expect(SOURCE).not.toContain("`");
    // A bare integer assigned to a float is a compile error in GLSL ES.
    expect(SOURCE).not.toMatch(/\bfloat\s+\w+\s*=\s*-?\d+\s*;/);
  });
});

describe("agxTransform", () => {
  it("registers the transform with its params and derived uniforms", () => {
    const t = agxTransform();
    expect(t.id).toBe(AGX_ID);
    expect(t.name).toBe("AgX (parametric)");
    expect(t.skipBaseCurve && t.skipToneShoulder).toBe(true);
    expect(t.params).toHaveLength(36);
    expect(t.derive?.uniforms.map((u) => u.key)).toEqual(Object.keys(AGX_UNIFORM_TYPES));
    expect(Object.keys(t.derive!.fn({}))).toEqual(Object.keys(AGX_UNIFORM_TYPES));
  });
});
