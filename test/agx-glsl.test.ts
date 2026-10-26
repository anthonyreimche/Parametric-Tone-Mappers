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

  it("keeps out of the host's preprocessor and template traps", () => {
    expect(SOURCE).not.toMatch(/#\s*(define|ifdef|if)\b/);
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
