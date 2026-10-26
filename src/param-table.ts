// Parametric Tone Mappers, a Safelight extension. GPL-3.0-or-later. See LICENSE.

// A transform's params as a table: the upstream field name, its type, its
// $DEFAULT, its hard $MIN/$MAX and its label. The core stores them in the
// photo's bag; derive reads them back through readParams, and the panel writes
// them through withinRange. clampTo is the one place a number is clamped to
// what upstream allows.

import type { GlslType, UniformDeclaration, UniformValue } from "./safelight";

export type ParamDef =
  | { readonly type: "float" | "int"; readonly default: number; readonly min: number; readonly max: number; readonly label: string }
  | { readonly type: "bool"; readonly default: boolean; readonly label: string };

export type ParamTable = Readonly<Record<string, ParamDef>>;

export type ParamValues<T extends ParamTable> = {
  -readonly [K in keyof T]: T[K] extends { readonly type: "bool" } ? boolean : number;
};

export function declarations(table: ParamTable): UniformDeclaration[] {
  return Object.entries(table).map(([key, d]): UniformDeclaration =>
    d.type === "bool"
      ? { key, glslType: "bool", default: d.default, label: d.label }
      : { key, glslType: d.type, default: d.default, range: { min: d.min, max: d.max }, label: d.label },
  );
}

type NumberDef = Extract<ParamDef, { readonly type: "float" | "int" }>;

const clampTo = (d: NumberDef, n: number): number => {
  const clamped = Math.min(d.max, Math.max(d.min, n));
  return d.type === "int" ? Math.round(clamped) : clamped;
};

/** `values` read against `table`: numbers clamped to their hard range, ints
 *  rounded, anything missing or mistyped its default. */
export function readParams<T extends ParamTable>(
  table: T,
  values: Readonly<Record<string, UniformValue | undefined>>,
): ParamValues<T> {
  const out: Record<string, number | boolean> = {};
  for (const [key, d] of Object.entries(table)) {
    const v = values[key];
    if (d.type === "bool") {
      out[key] = typeof v === "boolean" ? v : d.default;
    } else {
      out[key] = clampTo(d, typeof v === "number" && Number.isFinite(v) ? v : d.default);
    }
  }
  // Object.entries drops the table's key types; the loop wrote every key of
  // `table` with the value type its def names, which is ParamValues<T>.
  return out as ParamValues<T>;
}

export function defaults<T extends ParamTable>(table: T): ParamValues<T> {
  return readParams(table, {});
}

export function uniformDeclarations<K extends string>(
  types: Readonly<Record<K, GlslType>>,
  values: Readonly<Record<K, UniformValue>>,
): UniformDeclaration[] {
  const out: UniformDeclaration[] = [];
  for (const key in types) out.push({ key, glslType: types[key], default: values[key] });
  return out;
}

/** `patch` with each number clamped to its param's hard range and ints
 *  rounded, as every write from the panel goes into the bag. A NaN is dropped,
 *  so the param keeps its value; an infinity clamps to the bound. */
export function withinRange<T extends ParamTable>(table: T, patch: Partial<ParamValues<T>>): Partial<ParamValues<T>> {
  const out: Record<string, unknown> = { ...patch };
  for (const [key, v] of Object.entries(patch)) {
    const d = table[key];
    if (d && d.type !== "bool" && typeof v === "number") {
      if (Number.isNaN(v)) delete out[key];
      else out[key] = clampTo(d, v);
    }
  }
  // Every key came from `patch` and keeps its value's type, only clamped.
  return out as Partial<ParamValues<T>>;
}

export const qualify = (id: string, values: Readonly<Record<string, unknown>>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(values).map(([k, v]) => [`${id}.${k}`, v]));

/** The transform's own entries of a bag, by key: numbers and booleans only,
 *  the derived "{id}#{key}" entries never (a "#" isn't a "."). */
export function unqualify(id: string, bag: Readonly<Record<string, unknown>>): Record<string, UniformValue> {
  const prefix = `${id}.`;
  const out: Record<string, UniformValue> = {};
  for (const [k, v] of Object.entries(bag)) {
    if (!k.startsWith(prefix)) continue;
    if (typeof v === "number" || typeof v === "boolean") out[k.slice(prefix.length)] = v;
  }
  return out;
}
