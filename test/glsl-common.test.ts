import { describe, expect, it } from "vitest";
import { ENCODE_GLSL, SANITISE_GLSL, compressGlsl, glslFloat, glslMat3 } from "../src/glsl/common";

describe("GLSL literals", () => {
  it("always carry a decimal point or an exponent", () => {
    expect(glslFloat(1)).toBe("1.000000000");
    expect(glslFloat(-2)).toMatch(/^-2\.0+$/);
    expect(glslFloat(1e-9)).toMatch(/e-/);
  });

  it("emit mat3 column-major", () => {
    expect(glslMat3([1, 2, 3, 4, 5, 6, 7, 8, 9])).toBe(
      `mat3(${[1, 4, 7, 2, 5, 8, 3, 6, 9].map(glslFloat).join(", ")})`,
    );
  });
});

describe("shared GLSL", () => {
  it("defines its helpers without preprocessor gates or backticks", () => {
    for (const src of [ENCODE_GLSL, SANITISE_GLSL, compressGlsl("agxCompress", [0.2, 0.7, 0.1])]) {
      expect(src).not.toMatch(/#\s*(define|ifdef|if)\b/);
      expect(src).not.toContain("`");
    }
    expect(ENCODE_GLSL).toContain("vec3 ptmEncode(vec3 x)");
    expect(SANITISE_GLSL).toContain("vec3 ptmSanitise(vec3 c)");
    expect(compressGlsl("agxCompress", [0.2, 0.7, 0.1])).toContain("vec3 agxCompress(vec3 p)");
  });
});
