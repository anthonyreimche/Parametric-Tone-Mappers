import { describe, expect, it } from "vitest";
import { declarations, defaults, qualify, readParams, unqualify, uniformDeclarations, withinRange, type ParamTable } from "../src/param-table";

const TABLE = {
  gain: { type: "float", default: 1, min: 0, max: 4, label: "gain" },
  mode: { type: "int", default: 2, min: 0, max: 5, label: "mode" },
  on: { type: "bool", default: true, label: "on" },
} as const satisfies ParamTable;

describe("declarations", () => {
  it("declares each param with its type, default, range and label", () => {
    expect(declarations(TABLE)).toEqual([
      { key: "gain", glslType: "float", default: 1, range: { min: 0, max: 4 }, label: "gain" },
      { key: "mode", glslType: "int", default: 2, range: { min: 0, max: 5 }, label: "mode" },
      { key: "on", glslType: "bool", default: true, label: "on" },
    ]);
  });
});

describe("readParams", () => {
  it("reads values that fit, clamped to the hard range, ints rounded", () => {
    expect(readParams(TABLE, { gain: 9, mode: 3.6, on: false })).toEqual({ gain: 4, mode: 4, on: false });
  });

  it("takes the default for anything missing or mistyped", () => {
    expect(readParams(TABLE, { gain: Number.NaN, mode: true, on: 1 })).toEqual({ gain: 1, mode: 2, on: true });
    expect(defaults(TABLE)).toEqual({ gain: 1, mode: 2, on: true });
  });
});

describe("uniformDeclarations", () => {
  it("declares derived uniforms with the given defaults", () => {
    expect(uniformDeclarations({ a: "vec2", b: "float" }, { a: [1, 2], b: 3 })).toEqual([
      { key: "a", glslType: "vec2", default: [1, 2] },
      { key: "b", glslType: "float", default: 3 },
    ]);
  });
});

describe("withinRange", () => {
  it("clamps numbers to the hard range and rounds ints, leaving booleans", () => {
    expect(withinRange(TABLE, { gain: -3, mode: 2.4, on: false })).toEqual({ gain: 0, mode: 2, on: false });
  });

  it("clamps the max side too, infinities included, and rounds an int after clamping it", () => {
    expect(withinRange(TABLE, { gain: 9, mode: Infinity })).toEqual({ gain: 4, mode: 5 });
    expect(withinRange(TABLE, { gain: -Infinity, mode: 5.4 })).toEqual({ gain: 0, mode: 5 });
  });

  it("drops a NaN so the param keeps its previous value", () => {
    expect(withinRange(TABLE, { gain: NaN, mode: Infinity })).toStrictEqual({ mode: 5 });
    expect(withinRange(TABLE, { mode: NaN })).toStrictEqual({});
  });

  it("passes a boolean through as it is", () => {
    expect(withinRange(TABLE, { on: false })).toStrictEqual({ on: false });
  });

  it("passes a key the table doesn't have through unchanged", () => {
    const patch = { gain: 9, extra: 7 };
    expect(withinRange(TABLE, patch)).toStrictEqual({ gain: 4, extra: 7 });
  });
});

describe("qualify / unqualify", () => {
  it("adds and strips the transform's id, ignoring other keys and values that can't bind", () => {
    expect(qualify("t.x", { gain: 2 })).toEqual({ "t.x.gain": 2 });
    expect(unqualify("t.x", { "t.x.gain": 2, "t.x.on": true, "t.x.bad": "no", "t.y.gain": 3, "t.x#derived": 1 })).toEqual({
      gain: 2,
      on: true,
    });
  });
});
