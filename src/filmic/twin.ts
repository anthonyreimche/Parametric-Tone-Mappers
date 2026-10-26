// This file is part of the Ansel project.
// Copyright (C) 2019-2020, 2022 Aldric Renaudin.
// Copyright (C) 2019-2026 Aurélien PIERRE.
// Copyright (C) 2019 Diederik ter Rahe.
// Copyright (C) 2019-2022 Pascal Obry.
// Copyright (C) 2019 Tobias Ellinghaus.
// Copyright (C) 2020-2021 Chris Elston.
// Copyright (C) 2020-2022 Diederik Ter Rahe.
// Copyright (C) 2020 Heiko Bauke.
// Copyright (C) 2020-2021 Hubert Kowalski.
// Copyright (C) 2020 Jeronimo Pellegrini.
// Copyright (C) 2020 Marco Carrarini.
// Copyright (C) 2020 Mark-64.
// Copyright (C) 2020 Martin Burri.
// Copyright (C) 2020-2021 Ralf Brown.
// Copyright (C) 2020-2021 rawfiner.
// Copyright (C) 2021 Dan Torop.
// Copyright (C) 2021 Fabio Heer.
// Copyright (C) 2021 lhietal.
// Copyright (C) 2021 luzpaz.
// Copyright (C) 2021 paolodepetrillo.
// Copyright (C) 2021-2022 Sakari Kapanen.
// Copyright (C) 2021 Victor Forsiuk.
// Copyright (C) 2022 Hanno Schwalm.
// Copyright (C) 2022 Martin Bařinka.
// Copyright (C) 2022 Nicolas Auffray.
// Copyright (C) 2022 Philipp Lutz.
// Copyright (C) 2023 Alban Gruin.
// Copyright (C) 2023-2024 Alynx Zhou.
// Copyright (C) 2023 Luca Zulberti.
// Copyright (C) 2025 Guillaume Stutin.
//
// Ansel is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// Ansel is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Ansel.  If not, see <http://www.gnu.org/licenses/>.
//
// Transcribes filmic_agx (filmicrgb.c L2495-2587), RGB_tone_mapping_v4
// (L2133-2150), filmic_spline (L1063-1160), log_tonemapping (L1047-1051),
// pipe_RGB_to_Ych and Ych_to_pipe_RGB (L1741-1777), and gamut_mapping_simd
// with its helpers (L1779-2030), at 2fadf8a366, with the export profile sRGB
// and the export -> pipe hop skipped (Ref 3.1). The TypeScript twin of the
// GLSL in glsl.ts, in doubles where Ansel and the shader run in floats. The
// Yrg conversions are src/colour/yrg.ts's, the negatives compression
// src/glsl/common.ts's.

import { apply, fromColumnMajor, type Mat3, type Vec3 } from "../colour/mat3";
import { lmsToYrg, yrgToLms } from "../colour/yrg";
import { compressNegatives, sanitise } from "../glsl/common";
import type { FilmicUniforms } from "./derive";
import { CURVE_POLY_3, CURVE_POLY_4, CURVE_SIGMOID } from "./params";
import { EXPORT_INPUT, EXPORT_OUTPUT, FILMIC_PIPE, PIPE_LUMA, PIPE_TO_LMS } from "./spaces";

const FLT_MAX = 3.4028234663852886e38;
const Y_1931_TO_2006 = 1.05785528;
const R0 = 0.21902143;
const G0 = 0.54371398;

// Y, chroma, cos(hue), sin(hue).
type Ych = [number, number, number, number];

function toYch(rgb: Vec3, toLms: Mat3): Ych {
  const yrg = lmsToYrg(apply(toLms, rgb));
  const r = yrg[1] - R0;
  const g = yrg[2] - G0;
  const c = Math.hypot(g, r);
  return [yrg[0], c, c !== 0 ? r / c : 1, c !== 0 ? g / c : 0];
}

const fromYch = (f: Ych, fromLms: Mat3): Vec3 =>
  apply(fromLms, yrgToLms([f[0], f[1] * f[2] + R0, f[1] * f[3] + G0]));

/** The spline at the log-encoded scene value x in [0, 1], before the output power. */
export function filmicSplineAt(x: number, u: FilmicUniforms): number {
  const [latMin, latMax] = u.fNodes;
  const [, , shadows, highlights] = u.fDisplay;
  const [m1, m2, m3, m4, m5] = [u.fM1, u.fM2, u.fM3, u.fM4, u.fM5];
  if (x < latMin) {
    if (shadows === CURVE_SIGMOID) {
      if (m5[0] !== 0) return m3[2] + Math.max(0, m3[0] * Math.pow(Math.max(x, 0), m4[0]));
      const ty = latMin * m2[2] + m1[2];
      const v = (m2[2] * (x - latMin)) / m1[0];
      return m1[0] * (v / Math.pow(1 + Math.pow(v, m2[0]), 1 / m2[0])) + ty;
    }
    if (shadows === CURVE_POLY_4) return m1[0] + x * (m2[0] + x * (m3[0] + x * (m4[0] + x * m5[0])));
    if (shadows === CURVE_POLY_3) return m1[0] + x * (m2[0] + x * (m3[0] + x * m4[0]));
    const xi = latMin - x;
    const rat = xi * (xi * m2[0] + 1);
    return m4[0] - (m1[0] * rat) / (rat + m3[0]);
  }
  if (x > latMax) {
    // compute_spline always sets the perceptual shoulder's power-curve flag.
    if (highlights === CURVE_SIGMOID) return m4[2] - Math.max(0, m3[1] * Math.pow(Math.max(1 - x, 0), m4[1]));
    if (highlights === CURVE_POLY_4) return m1[1] + x * (m2[1] + x * (m3[1] + x * (m4[1] + x * m5[1])));
    if (highlights === CURVE_POLY_3) return m1[1] + x * (m2[1] + x * (m3[1] + x * m4[1]));
    const xi = x - latMax;
    const rat = xi * (xi * m2[1] + 1);
    return m4[1] + (m1[1] * rat) / (rat + m3[1]);
  }
  return m1[2] + x * m2[2];
}

function toneMap(rgb: Vec3, u: FilmicUniforms): Vec3 {
  const [grey, black, range] = u.fLog;
  const [, , y4, power] = u.fNodes;
  const one = (v: number): number => {
    // A grey source of 0 divides by zero upstream: a positive channel reads +inf, which clamps to 1.
    const mapped = v > 0 ? (grey > 0 ? Math.min(1, Math.max(0, (Math.log2(v / grey) - black) / range)) : 1) : 0;
    const s = filmicSplineAt(mapped, u);
    return Math.pow(s >= 0 ? Math.min(s, y4) : 0, power);
  };
  return [one(rgb[0]), one(rgb[1]), one(rgb[2])];
}

const DEN_R = [0.979381443298969, 0.391752577319588] as const;
const DEN_G = [0.0206185567010309, 0.608247422680412] as const;

function denominator(k: Vec3, cos: number, sin: number): number {
  return k[0] * (DEN_R[0] * cos + DEN_R[1] * sin) + k[1] * (DEN_G[0] * cos + DEN_G[1] * sin) - k[2] * (cos + sin);
}

function clipBlack(k: Vec3, cos: number, sin: number): number {
  const den = denominator(k, cos, sin);
  if (den === 0) return FLT_MAX;
  const v = (-0.427506877216495 * (k[0] + 0.856492345150334 * k[1] + 0.554995960637719 * k[2])) / den;
  return v >= 0 ? v : FLT_MAX;
}

function clipWhiteRaw(k: Vec3, white: number, Y: number, cos: number, sin: number): number {
  const den = denominator(k, cos, sin);
  const target = white * (0.68285981628866 * cos + 0.482137060515464 * sin);
  if (den === 0) return FLT_MAX;
  if (Y <= target / den) return FLT_MAX;
  return (
    (-0.427506877216495 * (Y * (k[0] + 0.856492345150334 * k[1] + 0.554995960637719 * k[2]) - 0.988237752433297 * white)) /
    (Y * den - target)
  );
}

function clipWhite(k: Vec3, white: number, Y: number, cos: number, sin: number): number {
  const maxY = Y_1931_TO_2006 * white;
  const dY = Math.max(maxY - Y, 0);
  const v = dY < 1e-3 ? (dY / (1e-3 * maxY)) * clipWhiteRaw(k, white, (1 - 1e-3) * maxY, cos, sin) : clipWhiteRaw(k, white, Y, cos, sin);
  return v >= 0 ? v : FLT_MAX;
}

const rowOf = (m: Mat3, i: number): Vec3 => [m[i * 3], m[i * 3 + 1], m[i * 3 + 2]];

function clipChroma(white: number, Y: number, cos: number, sin: number, chroma: number): number {
  const rows = [0, 1, 2].map((i) => rowOf(EXPORT_OUTPUT, i));
  const maxWhite = Math.min(...rows.map((k) => clipWhite(k, white, Y, cos, sin)));
  const maxBlack = Math.min(...rows.map((k) => clipBlack(k, cos, sin)));
  return Math.min(chroma, maxBlack, maxWhite);
}

function checkRgb(f: Ych, black: number, white: number): Vec3 {
  const b = fromYch(f, EXPORT_OUTPUT);
  const off = Math.max(-Math.min(b[0], b[1], b[2]), 0);
  const yb = toYch([b[0] + off, b[1] + off, b[2] + off], EXPORT_INPUT)[0];
  const Y = Math.min(Y_1931_TO_2006 * white, Math.max(Y_1931_TO_2006 * black, (f[0] + yb) / 2));
  const c = clipChroma(white, Y, f[2], f[3], f[1]);
  const out = fromYch([Y, c, f[2], f[3]], EXPORT_OUTPUT);
  const inRange = (v: number) => Math.min(white, Math.max(0, v));
  return [inRange(out[0]), inRange(out[1]), inRange(out[2])];
}

/** One pixel through filmic v8: Safelight's linear Rec.709 in, display-linear
 *  sRGB out (Ansel's export RGB under an sRGB output profile). */
export function filmicPixel(lin: Vec3, u: FilmicUniforms): Vec3 {
  const [dBlack, dWhite] = u.fDisplay;
  const compressed = compressNegatives(sanitise(apply(FILMIC_PIPE, lin)), PIPE_LUMA);
  const original = toYch(compressed, PIPE_TO_LMS);
  const rendered = apply(fromColumnMajor(u.fOutset), toneMap(apply(fromColumnMajor(u.fInset), compressed), u));
  const final = toYch(rendered, PIPE_TO_LMS);
  const chroma = Math.min(original[1], final[1]);
  const beta = u.fLog[3];
  const rMix = beta * original[1] * original[2] + (1 - beta) * chroma * final[2];
  const gMix = beta * original[1] * original[3] + (1 - beta) * chroma * final[3];
  const n = Math.hypot(gMix, rMix);
  const reference: Ych = [original[0], original[1], n > 1e-9 ? rMix / n : original[2], n > 1e-9 ? gMix / n : original[3]];
  let f: Ych = [
    Math.min(Y_1931_TO_2006 * dWhite, Math.max(Y_1931_TO_2006 * dBlack, final[0])),
    chroma,
    reference[2],
    reference[3],
  ];
  // filmic_desaturate_v4 at saturation 0: only the brightening re-saturation rule acts.
  const co = reference[1] * reference[0];
  let cf = f[1] * f[0];
  if (f[0] > reference[0] && co < cf) cf = (co + cf) / 2;
  f[1] = f[0] > 0 ? Math.max(cf / f[0], 0) : cf > 0 ? FLT_MAX : 0;
  // gamut_check_Yrg_filmic.
  const r = f[1] * f[2] + R0;
  const g = f[1] * f[3] + G0;
  let maxC = f[1];
  if (r < 0) maxC = Math.min(-R0 / f[2], maxC);
  if (g < 0) maxC = Math.min(-G0 / f[3], maxC);
  if (r + g > 1) maxC = Math.min((1 - R0 - G0) / (f[2] + f[3]), maxC);
  f = [f[0], maxC, f[2], f[3]];
  return checkRgb(f, dBlack, dWhite);
}
