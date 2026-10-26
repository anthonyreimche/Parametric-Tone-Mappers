import { describe, expect, it } from "vitest";
import { FILMIC_GLSL, FILMIC_HELPERS } from "../src/filmic/glsl";
import { FILMIC_UNIFORM_TYPES, deriveFilmic } from "../src/filmic/derive";
import { FILMIC_DEFAULTS } from "../src/filmic/params";
import { FILMIC_DEFAULT_UNIFORMS, FILMIC_ID, filmicTransform } from "../src/filmic/transform";

const SOURCE = `${FILMIC_HELPERS}\n${FILMIC_GLSL}`;

const withoutComments = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

/** Integer literals where GLSL ES 3.00 needs a float: it converts nothing
 *  implicitly, so `x < 0`, `x * 2`, `max(x, 1)` and `float y = 1;` all fail to
 *  compile. The scan reads every number token outside comments and accepts only
 *  an array or matrix index (`m[0]`), the header of an `int` loop and an `int`
 *  declaration. A literal inside a constructor (`vec3(1)`) is flagged too: it
 *  compiles, but nothing in these sources needs it. */
function bareIntegers(src: string): string[] {
  const code = withoutComments(src)
    .replace(/\bfor\s*\(\s*int\b[^)]*\)/g, " ")
    .replace(/\bint\s+\w+\s*=\s*\d+\s*;/g, " ")
    .replace(/\[\s*\d+\s*\]/g, " ");
  // Identifiers are consumed whole, so the digits in vec3 or fM1 are not literals.
  const token = /[A-Za-z_]\w*|(?:\d+\.\d*|\.\d+)(?:[eE][+-]?\d+)?|\d+[eE][+-]?\d+|\d+/g;
  const found: string[] = [];
  for (const m of code.matchAll(token)) {
    if (/^\d+$/.test(m[0])) found.push(code.slice(Math.max(0, m.index - 24), m.index + 24).replace(/\s+/g, " "));
  }
  return found;
}

const hasDirective = (src: string): boolean => /#/.test(src);

describe("the GLSL text guards", () => {
  it("flag an integer literal wherever a float is needed", () => {
    for (const bad of ["float x = 1;", "if (x < 0)", "if (0 < x)", "y = max(x, 1)", "y = 2 * x", "y = x / 2", "y = x - 1", "return 1;", "vec3 v = vec3(1)", "y = x + 10 // 3.0"]) {
      expect(bareIntegers(bad), bad).not.toEqual([]);
    }
  });

  it("accept floats, exponents, indices, int loops and int declarations", () => {
    for (const good of [
      "float x = 1.0;", "y = 1.0e-3 * x", "y = 3.402823466e38", "y = .5", "y = 5.", "y = 1e5", "y = 2.5E+3",
      "m[0][i]", "m[ 2 ]", "for (int i = 0; i < 3; i++) {", "int n = 2;", "vec3 q = vec3(1.0, 0.0, 0.5);",
      "float v = fM1.x + log2(vec3_a) * x1;", "// 1 2 3\nfloat z = 0.0;", "/* x < 0 */ float z = 0.0;",
    ]) {
      expect(bareIntegers(good), good).toEqual([]);
    }
  });

  it("flag every preprocessor directive", () => {
    for (const d of ["#define A 1", "#undef A", "#if A", "#ifdef A", "#ifndef A", "#elif A", "#else", "#endif", "  # define A 1"]) {
      expect(hasDirective(d), d).toBe(true);
    }
  });
});

describe("Filmic GLSL", () => {
  it("defines pipelineToDisplay and reads every derived uniform", () => {
    expect(FILMIC_GLSL).toContain("vec3 pipelineToDisplay(vec3 lin)");
    for (const key of Object.keys(FILMIC_UNIFORM_TYPES)) expect(SOURCE, key).toMatch(new RegExp(`\\b${key}\\b`));
  });

  it("is per-pixel: no texture fetch, no derivative", () => {
    expect(SOURCE).not.toMatch(/\btexture(Lod|Fetch|Grad|Offset)?\s*\(|\btexelFetch\s*\(|\bdFd[xy]\s*\(/);
  });

  it("keeps out of the host's preprocessor and template traps", () => {
    expect(hasDirective(SOURCE)).toBe(false);
    expect(SOURCE).not.toContain("`");
    expect(bareIntegers(SOURCE)).toEqual([]);
  });

  it("declares nothing the host owns, and names its globals and helpers as the host expects", () => {
    expect(SOURCE).not.toMatch(/\buniform\b/);
    const globals = [...SOURCE.matchAll(/^const\s+\w+\s+(\w+)/gm)].map((m) => m[1]);
    expect(globals.length).toBeGreaterThan(0);
    for (const name of globals) expect(name, name).toMatch(/^PTM_/);
    const functions = [...SOURCE.matchAll(/^(?:float|int|bool|void|vec[234]|mat3)\s+(\w+)\s*\(/gm)].map((m) => m[1]);
    expect(functions).toContain("pipelineToDisplay");
    for (const name of functions) expect(name, name).toMatch(/^(f[A-Z]\w*|ptm[A-Z]\w*|pipelineToDisplay)$/);
  });

  it("registers exactly its declared helpers under the host's name scan, comments included", () => {
    const scan = (src: string) =>
      [...src.matchAll(/\b(?:float|vec[234]|mat[234]|int|uint|void|bool|[iub]vec[234])\s+([a-zA-Z_]\w*)\s*\(/g)].map((m) => m[1]);
    const declared = [...FILMIC_HELPERS.matchAll(/^(?:float|int|bool|void|vec[234]|mat3)\s+(\w+)\s*\(/gm)].map((m) => m[1]);
    expect(scan("// float x(\nfloat y(float z) {")).toEqual(["x", "y"]);
    expect(declared.length).toBeGreaterThan(10);
    expect(scan(FILMIC_HELPERS)).toEqual(declared);
  });

  it("has balanced brackets", () => {
    const code = withoutComments(SOURCE);
    for (const [open, close] of [["(", ")"], ["{", "}"], ["[", "]"]]) {
      expect(code.split(open).length, open).toBe(code.split(close).length);
    }
  });

  it("never divides by the grey source without testing it positive", () => {
    const lines = SOURCE.split("\n").filter((l) => /\/\s*fLog\.x\b/.test(l));
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) expect(l).toMatch(/fLog\.x > 0\.0\s*\?/);
  });

  it("gives clamp only literal bounds: it is undefined when lo > hi", () => {
    const literal = "-?\\d[\\d.]*(?:e[+-]?\\d+)?";
    const bounded = new RegExp(`, ${literal}, ${literal}\\)`);
    expect("float y = clamp(x, lo, hi);").not.toMatch(bounded);
    expect("float y = clamp(x, 0.0, hi);").not.toMatch(bounded);
    const lines = withoutComments(SOURCE).split("\n").filter((l) => /\bclamp\(/.test(l));
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) expect(l).toMatch(bounded);
  });

  it("reads the toe's fallback coefficients only under the toe's flag", () => {
    const lines = SOURCE.split("\n").filter((l) => /\bfM3\.x\b|\bfM4\.x\b/.test(l) && /\bpow\(max\(x, 0\.0\)/.test(l));
    expect(lines.length).toBe(1);
    expect(lines[0]).toMatch(/fM5\.x != 0\.0/);
  });
});

describe("filmicTransform", () => {
  it("registers the transform with its 17 params and derived uniforms", () => {
    const t = filmicTransform();
    expect(t.id).toBe(FILMIC_ID);
    expect(FILMIC_ID).toBe("parametric-tonemappers.filmic");
    expect(t.name).toBe("Filmic RGB (parametric)");
    expect(t.skipBaseCurve && t.skipToneShoulder).toBe(true);
    expect(t.glsl).toBe(FILMIC_GLSL);
    expect(t.helpers).toBe(FILMIC_HELPERS);
    expect(t.params).toHaveLength(17);
    expect(t.derive?.uniforms.map((u) => u.key)).toEqual(Object.keys(FILMIC_UNIFORM_TYPES));
  });

  it("derives its uniforms from the stored params, and declares the defaults' as fallbacks", () => {
    const t = filmicTransform();
    expect(t.derive!.fn({})).toEqual(deriveFilmic(FILMIC_DEFAULTS));
    expect(t.derive!.fn({ auto_hardness: false, output_power: 4, black_point_source: -8, white_point_source: 4 })).toEqual(
      deriveFilmic({ ...FILMIC_DEFAULTS, auto_hardness: false, output_power: 4, black_point_source: -8, white_point_source: 4 }),
    );
    expect(FILMIC_DEFAULT_UNIFORMS).toEqual(deriveFilmic(FILMIC_DEFAULTS));
    for (const u of t.derive!.uniforms) {
      expect(u.default, u.key).toEqual(FILMIC_DEFAULT_UNIFORMS[u.key as keyof typeof FILMIC_DEFAULT_UNIFORMS]);
      for (const v of [u.default].flat()) expect(Number.isFinite(v), u.key).toBe(true);
    }
  });
});
