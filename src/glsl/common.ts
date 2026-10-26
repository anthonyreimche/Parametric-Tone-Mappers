// Parametric Tone Mappers, a Safelight extension. GPL-3.0-or-later. See LICENSE.
//
// GLSL both transforms splice into their helpers, and their TypeScript twins.
// compressGlsl/compressNegatives transcribe darktable's AgX _compress_into_gamut
// (src/iop/agx.c L707-771, release-5.6.2) and Ansel's filmic_agx_compress_negatives
// (src/iop/filmicrgb.c L2462-2492, 2fadf8a366), the same Blender AgX luminance
// compensation with different coefficients.
// Copyright (C) 2025-2026 darktable developers (src/iop/agx.c).
// Copyright (C) 2019-2020, 2022 Aldric Renaudin; 2019-2026 Aurélien PIERRE; 2019 Diederik ter Rahe; 2019-2022 Pascal Obry; 2019 Tobias Ellinghaus; 2020-2021 Chris Elston; 2020-2022 Diederik Ter Rahe; 2020 Heiko Bauke; 2020-2021 Hubert Kowalski; 2020 Jeronimo Pellegrini; 2020 Marco Carrarini; 2020 Mark-64; 2020 Martin Burri; 2020-2021 Ralf Brown; 2020-2021 rawfiner; 2021 Dan Torop; 2021 Fabio Heer; 2021 lhietal; 2021 luzpaz; 2021 paolodepetrillo; 2021-2022 Sakari Kapanen; 2021 Victor Forsiuk; 2022 Hanno Schwalm; 2022 Martin Bařinka; 2022 Nicolas Auffray; 2022 Philipp Lutz; 2023 Alban Gruin; 2023-2024 Alynx Zhou; 2023 Luca Zulberti; 2025 Guillaume Stutin (src/iop/filmicrgb.c).
// GPL-3.0-or-later.

import { columnMajor, type Mat3, type Vec3 } from "../colour/mat3";

export function glslFloat(x: number): string {
  const s = x.toPrecision(10);
  return /[.e]/.test(s) ? s : `${s}.0`;
}

export const glslVec3 = (v: Vec3): string => `vec3(${v.map(glslFloat).join(", ")})`;

export const glslMat3 = (m: Mat3): string => `mat3(${columnMajor(m).map(glslFloat).join(", ")})`;

// Safelight decodes a transform's output as the sRGB curve; the sign is kept
// and there's no ceiling, so out-of-gamut colours reach the core's output
// stage signed. mix with a bvec3 selects, so pow's result for a branch not
// taken can't leak in.
export const ENCODE_GLSL = `vec3 ptmEncode(vec3 x) {
  vec3 a = abs(x);
  vec3 e = mix(a * 12.92, 1.055 * pow(a, vec3(1.0 / 2.4)) - 0.055, greaterThanEqual(a, vec3(0.0031308)));
  return sign(x) * e;
}`;

// isnan may be folded away by some compilers; the clamp still bounds infinities.
export const SANITISE_GLSL = `vec3 ptmSanitise(vec3 c) {
  return vec3(
    isnan(c.r) ? 0.0 : clamp(c.r, -1.0e6, 1.0e6),
    isnan(c.g) ? 0.0 : clamp(c.g, -1.0e6, 1.0e6),
    isnan(c.b) ? 0.0 : clamp(c.b, -1.0e6, 1.0e6));
}`;

export function compressGlsl(name: string, k: Vec3): string {
  return `vec3 ${name}(vec3 p) {
  vec3 k = ${glslVec3(k)};
  float inputY = dot(p, k);
  float mx = max(p.r, max(p.g, p.b));
  vec3 opp = vec3(mx) - p;
  float yComp = max(opp.r, max(opp.g, opp.b)) - dot(opp, k) + inputY;
  float offset = max(-min(p.r, min(p.g, p.b)), 0.0);
  vec3 q = p + offset;
  float mq = max(q.r, max(q.g, q.b));
  vec3 oppQ = vec3(mq) - q;
  float yNew = max(oppQ.r, max(oppQ.g, oppQ.b)) - dot(oppQ, k) + dot(q, k);
  float ratio = (yNew > yComp && yNew > 1.0e-6) ? yComp / yNew : 1.0;
  return ratio * q;
}`;
}

export function encodeSrgb(x: number): number {
  const a = Math.abs(x);
  const e = a < 0.0031308 ? a * 12.92 : 1.055 * Math.pow(a, 1 / 2.4) - 0.055;
  return Math.sign(x) * e;
}

export function decodeSrgb(y: number): number {
  const a = Math.abs(y);
  const d = a < 0.04045 ? a / 12.92 : Math.pow((a + 0.055) / 1.055, 2.4);
  return Math.sign(y) * d;
}

export function sanitise(v: Vec3): Vec3 {
  const s = (c: number) => (Number.isNaN(c) ? 0 : Math.min(1e6, Math.max(-1e6, c)));
  return [s(v[0]), s(v[1]), s(v[2])];
}

export function compressNegatives(p: Vec3, k: Vec3): Vec3 {
  const dot = (v: Vec3) => v[0] * k[0] + v[1] * k[1] + v[2] * k[2];
  const max3 = (v: Vec3) => Math.max(v[0], v[1], v[2]);
  const inputY = dot(p);
  const mx = max3(p);
  const opp: Vec3 = [mx - p[0], mx - p[1], mx - p[2]];
  const yComp = max3(opp) - dot(opp) + inputY;
  const offset = Math.max(-Math.min(p[0], p[1], p[2]), 0);
  const q: Vec3 = [p[0] + offset, p[1] + offset, p[2] + offset];
  const mq = max3(q);
  const oppQ: Vec3 = [mq - q[0], mq - q[1], mq - q[2]];
  const yNew = max3(oppQ) - dot(oppQ) + dot(q);
  const ratio = yNew > yComp && yNew > 1e-6 ? yComp / yNew : 1;
  return [ratio * q[0], ratio * q[1], ratio * q[2]];
}
