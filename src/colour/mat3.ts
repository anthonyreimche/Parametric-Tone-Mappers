// Parametric Tone Mappers, a Safelight extension. GPL-3.0-or-later. See LICENSE.

// Row-major 3×3 matrices, written as upstream writes them (M·v). GLSL takes
// matrices column-major, so uploads go through columnMajor().

export type Vec3 = readonly [number, number, number];
export type Mat3 = readonly [number, number, number, number, number, number, number, number, number];

export const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export function mul(a: Mat3, b: Mat3): Mat3 {
  const e = (r: number, c: number) => a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
  return [e(0, 0), e(0, 1), e(0, 2), e(1, 0), e(1, 1), e(1, 2), e(2, 0), e(2, 1), e(2, 2)];
}

export function apply(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

/** The inverse, or null when `m` is singular to working precision. */
export function invert(m: Mat3): Mat3 | null {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  // |det| is at most the product of the row lengths (Hadamard); within rounding of 0 against it, m is singular.
  if (!(Math.abs(det) > Number.EPSILON * Math.hypot(a, b, c) * Math.hypot(d, e, f) * Math.hypot(g, h, i))) return null;
  return [
    A / det, -(b * i - c * h) / det, (b * f - c * e) / det,
    B / det, (a * i - c * g) / det, -(a * f - c * d) / det,
    C / det, -(a * h - b * g) / det, (a * e - b * d) / det,
  ];
}

export function mustInvert(m: Mat3): Mat3 {
  const inv = invert(m);
  if (!inv) throw new Error("singular colour matrix");
  return inv;
}

export const diag = (v: Vec3): Mat3 => [v[0], 0, 0, 0, v[1], 0, 0, 0, v[2]];

/** The matrix whose columns are c0, c1, c2. */
export const columns = (c0: Vec3, c1: Vec3, c2: Vec3): Mat3 => [
  c0[0], c1[0], c2[0], c0[1], c1[1], c2[1], c0[2], c1[2], c2[2],
];

export const column = (m: Mat3, i: number): Vec3 => [m[i], m[3 + i], m[6 + i]];
export const row = (m: Mat3, i: number): Vec3 => [m[i * 3], m[i * 3 + 1], m[i * 3 + 2]];
export const scale = (v: Vec3, k: number): Vec3 => [v[0] * k, v[1] * k, v[2] * k];

export const columnMajor = (m: Mat3): number[] => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];

export const fromColumnMajor = (a: readonly number[]): Mat3 => [a[0], a[3], a[6], a[1], a[4], a[7], a[2], a[5], a[8]];
