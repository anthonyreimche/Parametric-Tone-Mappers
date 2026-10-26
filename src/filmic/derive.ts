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
// Transcribes dt_iop_filmic_rgb_compute_spline (filmicrgb.c L3686-4003),
// filmic_v3_compute_geometry and filmic_v3_compute_nodes_from_legacy
// (L497-569), the auto-hardness power of gui_changed (L5779-5781), the v8
// bracket (_filmic_agx_build_displaced L2338-2388, filmic_agx_prepare_bracket
// L2390-2459) and the values commit_params (L4005-4113) and process
// (L2847-2848) hand to the shader, at 2fadf8a366. It runs in doubles where
// Ansel runs in floats.

import { clamp, gaussSolve, sigmoidScale } from "../curve-math";
import { IDENTITY, apply, column, columnMajor, columns, invert, mul, scale, type Mat3, type Vec3 } from "../colour/mat3";
import { REC2020, type Profile } from "../colour/profiles";
import { xyzD50ToYrg, yrgToXyzD50 } from "../colour/yrg";
import type { GlslType } from "../safelight";
import { CURVE_POLY_3, CURVE_POLY_4, CURVE_SIGMOID, type FilmicParams } from "./params";

const SAFETY_MARGIN = 0.01;
const TOE_POWER = 1.5;

// glib's CLAMP, as Ansel uses it: with low > high an x not above high gives low, where curve-math's clamp gives high.
const glibClamp = (x: number, low: number, high: number): number => (x > high ? high : x < low ? low : x);

/** output_power: with auto hardness, the power that puts grey on the
 *  identity line (Ref §2.5), unclamped as Ansel's raw defaults leave it. */
export function filmicPower(p: FilmicParams): number {
  if (!p.auto_hardness) return p.output_power;
  return Math.log(p.grey_point_target / 100) / Math.log(-p.black_point_source / (p.white_point_source - p.black_point_source));
}

export interface FilmicSpline {
  x: number[];
  y: number[];
  /** Coefficients by segment: [toe, shoulder, line]. */
  M1: number[];
  M2: number[];
  M3: number[];
  M4: number[];
  M5: number[];
  latitudeMin: number;
  latitudeMax: number;
  contrast: number;
  greyDisplay: number;
  intercept: number;
}

export interface FilmicGeometry {
  greyDisplay: number;
  blackDisplay: number;
  whiteDisplay: number;
  greyLog: number;
  contrast: number;
  intercept: number;
  xmin: number;
  xmax: number;
}

/** filmic_v3_compute_geometry (filmicrgb.c L497-533), for the spline and for
 *  the panel's highlights/shadows sliders. */
export function filmicGeometry(p: FilmicParams, power: number): FilmicGeometry {
  const greyDisplay = p.custom_grey
    ? Math.pow(glibClamp(p.grey_point_target, p.black_point_target, p.white_point_target) / 100, 1 / power)
    : Math.pow(0.1845, 1 / power);
  const dynamicRange = p.white_point_source - p.black_point_source;
  const greyLog = Math.abs(p.black_point_source) / dynamicRange;
  const blackDisplay = Math.pow(glibClamp(p.black_point_target, 0, p.grey_point_target) / 100, 1 / power);
  const whiteDisplay = Math.pow(Math.max(p.white_point_target, p.grey_point_target) / 100, 1 / power);

  const slopeTarget = (p.contrast * dynamicRange) / 8;
  const minContrast =
    Math.max(1, (whiteDisplay - greyDisplay) / (1 - greyLog), (greyDisplay - blackDisplay) / greyLog) + SAFETY_MARGIN;
  const contrast = glibClamp(slopeTarget / (power * Math.pow(greyDisplay, power - 1)), minContrast, 100);
  const intercept = greyDisplay - contrast * greyLog;
  const margin = SAFETY_MARGIN * (whiteDisplay - blackDisplay);
  const xmin = (blackDisplay + margin - intercept) / contrast;
  const xmax = (whiteDisplay - margin - intercept) / contrast;
  return { greyDisplay, blackDisplay, whiteDisplay, greyLog, contrast, intercept, xmin, xmax };
}

export function filmicSpline(p: FilmicParams, power: number): FilmicSpline {
  const { greyDisplay, blackDisplay, whiteDisplay, greyLog, contrast, intercept, xmin, xmax } = filmicGeometry(p, power);

  // filmic_v3_compute_nodes_from_legacy.
  const latitude = glibClamp(p.latitude, 0, 100) / 100;
  const balance = glibClamp(p.balance, -50, 50) / 100;
  let toeLog = (1 - latitude) * greyLog + latitude * xmin;
  let shoulderLog = (1 - latitude) * greyLog + latitude * xmax;
  const correction = balance > 0 ? 2 * balance * (shoulderLog - greyLog) : 2 * balance * (greyLog - toeLog);
  toeLog = Math.max(toeLog - correction, xmin);
  shoulderLog = Math.min(shoulderLog - correction, xmax);
  const toeDisplay = toeLog * contrast + intercept;
  const shoulderDisplay = shoulderLog * contrast + intercept;

  const x = [0, toeLog, greyLog, shoulderLog, 1];
  const y = [blackDisplay, toeDisplay, greyDisplay, shoulderDisplay, whiteDisplay];
  const M1 = [0, 0, y[1] - contrast * x[1]];
  const M2 = [0, 0, contrast];
  const M3 = [0, 0, 0];
  const M4 = [0, 0, 0];
  const M5 = [0, 0, 0];
  if (p.shadows === CURVE_SIGMOID || p.highlights === CURVE_SIGMOID) {
    M3[2] = y[0];
    M4[2] = y[4];
  }

  const Tl = x[1];
  if (p.shadows === CURVE_SIGMOID) {
    const dx = Math.max(1e-6, x[1]);
    const dy = Math.max(1e-6, y[1] - y[0]);
    M1[0] = -sigmoidScale(1, 1 - y[0], 1 - x[1], 1 - y[1], contrast, TOE_POWER);
    M2[0] = TOE_POWER;
    M4[0] = (contrast * dx) / dy;
    M3[0] = dy / Math.pow(dx, M4[0]);
    M5[0] = dy / dx > contrast ? 1 : 0;
  } else if (p.shadows === CURVE_POLY_4) {
    const [m5, m4, m3, m2, m1] = gaussSolve(
      [0, 0, 0, 0, 1, 0, 0, 0, 1, 0, Tl ** 4, Tl ** 3, Tl ** 2, Tl, 1, 4 * Tl ** 3, 3 * Tl ** 2, 2 * Tl, 1, 0, 12 * Tl ** 2, 6 * Tl, 2, 0, 0],
      [y[0], 0, y[1], contrast, 0],
      5,
    );
    [M1[0], M2[0], M3[0], M4[0], M5[0]] = [m1, m2, m3, m4, m5];
  } else if (p.shadows === CURVE_POLY_3) {
    const [m4, m3, m2, m1] = gaussSolve(
      [0, 0, 0, 1, Tl ** 3, Tl ** 2, Tl, 1, 3 * Tl ** 2, 2 * Tl, 1, 0, 6 * Tl, 2, 0, 0],
      [y[0], y[1], contrast, 0],
      4,
    );
    [M1[0], M2[0], M3[0], M4[0], M5[0]] = [m1, m2, m3, m4, 0];
  } else {
    [M1[0], M2[0], M3[0]] = rational(x[1] - x[0], y[1] - y[0], contrast);
    M4[0] = toeDisplay;
  }

  const Sl = x[3];
  if (p.highlights === CURVE_SIGMOID) {
    const dx = Math.max(1e-6, 1 - x[3]);
    const dy = Math.max(1e-6, y[4] - y[3]);
    M4[1] = (contrast * dx) / dy;
    M3[1] = dy / Math.pow(dx, M4[1]);
    M5[1] = 1;
  } else if (p.highlights === CURVE_POLY_3) {
    const [m4, m3, m2, m1] = gaussSolve(
      [1, 1, 1, 1, Sl ** 3, Sl ** 2, Sl, 1, 3 * Sl ** 2, 2 * Sl, 1, 0, 6 * Sl, 2, 0, 0],
      [y[4], y[3], contrast, 0],
      4,
    );
    [M1[1], M2[1], M3[1], M4[1], M5[1]] = [m1, m2, m3, m4, 0];
  } else if (p.highlights === CURVE_POLY_4) {
    const [m5, m4, m3, m2, m1] = gaussSolve(
      [1, 1, 1, 1, 1, 4, 3, 2, 1, 0, Sl ** 4, Sl ** 3, Sl ** 2, Sl, 1, 4 * Sl ** 3, 3 * Sl ** 2, 2 * Sl, 1, 0, 12 * Sl ** 2, 6 * Sl, 2, 0, 0],
      [y[4], 0, y[3], contrast, 0],
      5,
    );
    [M1[1], M2[1], M3[1], M4[1], M5[1]] = [m1, m2, m3, m4, m5];
  } else {
    [M1[1], M2[1], M3[1]] = rational(x[4] - x[3], y[4] - y[3], contrast);
    M4[1] = shoulderDisplay;
  }

  return { x, y, M1, M2, M3, M4, M5, latitudeMin: x[1], latitudeMax: x[3], contrast, greyDisplay, intercept };
}

// The "safe" rational segment's a, b, c (L3915-3929, L3987-4001). The square
// root's radicand can go negative; upstream lets the NaN through.
function rational(dx: number, dy: number, g: number): [number, number, number] {
  const b = g / (2 * dy) + (Math.sqrt((dx * g / dy + 1) ** 2 - 4) - 1) / (2 * dx);
  const c = ((dy / g) * (b * dx * dx + dx)) / (b * dx * dx + dx - dy / g);
  return [c * g, b, c];
}

interface Anchors {
  inset: Vec3;
  rotation: Vec3;
  outset: Vec3;
  outsetRotation: Vec3;
}

// filmic_agx_prepare_bracket (L2390-2459), verbatim (Ref §2.7.4). The keys are
// the version param: 5 no bleach (also upstream's default branch), 6 low, 7
// medium, 8 high, 9 extra bleach.
export const BRACKETS: Readonly<Record<5 | 6 | 7 | 8 | 9, Anchors>> = {
  5: {
    inset: [0.5991055, 0.6, 0.3300009],
    rotation: [0.0571015, 0.1999891, 0.088611],
    outset: [0.761433, 0.752267, 0.465293],
    outsetRotation: [-0.0034297, 0.1952448, -0.0480109],
  },
  6: {
    inset: [0.6410825, 0.689811, 0.3194529],
    rotation: [0.0405734, 0.1631286, 0.0350584],
    outset: [0.784757, 0.789387, 0.445403],
    outsetRotation: [-0.0057845, 0.1593207, -0.0592955],
  },
  7: {
    inset: [0.650954, 0.7488775, 0.3517703],
    rotation: [0.0278602, 0.1214671, -0.0228829],
    outset: [0.793082, 0.815169, 0.460318],
    outsetRotation: [-0.0053781, 0.1187604, -0.0794801],
  },
  8: {
    inset: [0.6379749, 0.7878689, 0.3753822],
    rotation: [0.0106096, 0.0582598, -0.0696729],
    outset: [0.790237, 0.831376, 0.465406],
    outsetRotation: [-0.008007, 0.05711, -0.091222],
  },
  9: {
    inset: [0.5770235, 0.8102094, 0.400039],
    rotation: [-0.008106, -0.0034008, -0.1035236],
    outset: [0.76642, 0.83802, 0.46513],
    outsetRotation: [-0.0122011, -0.0021732, -0.0971215],
  },
};

const anchorsFor = (version: number): Anchors =>
  version === 5 || version === 6 || version === 7 || version === 8 || version === 9 ? BRACKETS[version] : BRACKETS[5];

// _filmic_agx_build_displaced: each primary compressed toward white and rotated
// in Yrg at constant luminance, the set rescaled to share the work white. The
// inset clamp is CLAMPF (L2366), so it is the shared clamp.
export function buildDisplaced(work: Profile, inset: Vec3, rotation: Vec3): Mat3 | null {
  const whiteXyz = apply(work.toXyz, [1, 1, 1]);
  const white = xyzD50ToYrg(whiteXyz);
  const displaced = (i: number): Vec3 => {
    const q = xyzD50ToYrg(column(work.toXyz, i));
    const dr = q[1] - white[1];
    const dg = q[2] - white[2];
    const s = 1 - clamp(inset[i], 0, 0.9);
    const cos = Math.cos(rotation[i]);
    const sin = Math.sin(rotation[i]);
    return yrgToXyzD50([q[0], white[1] + s * (cos * dr - sin * dg), white[2] + s * (sin * dr + cos * dg)]);
  };
  const cols = [displaced(0), displaced(1), displaced(2)] as const;
  const inv = invert(columns(cols[0], cols[1], cols[2]));
  if (!inv) return null;
  const k = apply(inv, whiteXyz);
  return mul(work.fromXyz, columns(scale(cols[0], k[0]), scale(cols[1], k[1]), scale(cols[2], k[2])));
}

export function displacedMatrix(version: number, which: "inset" | "outset"): Mat3 | null {
  const a = anchorsFor(version);
  return which === "inset" ? buildDisplaced(REC2020, a.inset, a.rotation) : buildDisplaced(REC2020, a.outset, a.outsetRotation);
}

/** The v8 bracket; identity both ways on degenerate primaries, as upstream. */
export function filmicBracket(version: number): { inset: Mat3; outset: Mat3 } {
  const inset = displacedMatrix(version, "inset");
  const recovery = displacedMatrix(version, "outset");
  const outset = recovery && invert(recovery);
  return inset && outset ? { inset, outset } : { inset: IDENTITY, outset: IDENTITY };
}

export const FILMIC_UNIFORM_TYPES = {
  fInset: "mat3",
  fOutset: "mat3",
  fM1: "vec4",
  fM2: "vec4",
  fM3: "vec4",
  fM4: "vec4",
  fM5: "vec4",
  fNodes: "vec4",
  fLog: "vec4",
  fDisplay: "vec4",
} as const satisfies Readonly<Record<string, GlslType>>;

export type FilmicUniforms = Record<keyof typeof FILMIC_UNIFORM_TYPES, number[]>;

// A double beyond float32's range would upload as Infinity; NaN makes the core bind the uniform's default.
const f32 = (v: number): number => (Number.isFinite(Math.fround(v)) ? v : NaN);
const pack = (v: readonly number[]): number[] => v.map(f32);

/** Packing: fM1..fM5 (toe, shoulder, line, 0), fNodes (latitude min,
 *  latitude max, spline-domain white y[4], output power), fLog (grey source, black
 *  source EV, dynamic range EV, hue mix beta, whose clamp is CLAMPF at L4098),
 *  fDisplay (display-linear black and white, y[0] and y[4] raised to the power;
 *  shadows curve, highlights curve).
 *  A value float32 cannot hold is NaN, except a perceptual shoulder's M3[1],
 *  which is 0. */
export function deriveFilmic(p: FilmicParams): FilmicUniforms {
  const power = filmicPower(p);
  const s = filmicSpline(p, power);
  const { inset, outset } = filmicBracket(p.version);
  const seg = (m: readonly number[]) => pack([m[0], m[1], m[2], 0]);
  // A perceptual segment reads its fallback coefficient and power (M3, M4) only when its flag M5 is set (L1085, L1122);
  // compute_spline always sets the shoulder flag (L3948), so only the toe arm fires.
  const fallback = (m: readonly number[]) => [
    p.shadows === CURVE_SIGMOID && s.M5[0] === 0 ? 0 : m[0],
    p.highlights === CURVE_SIGMOID && s.M5[1] === 0 ? 0 : m[1],
    m[2],
  ];
  const m3 = fallback(s.M3);
  // Past float32, Ansel's M3[1] (L3947) is inf, and M4[2] - fmaxf(0, inf·powf(…)) (L1125) is flat white, as 0 gives,
  // wherever that powf flushes to zero; a subnormal-keeping CPU renders black in a band above the node.
  if (p.highlights === CURVE_SIGMOID && !Number.isFinite(Math.fround(m3[1]))) m3[1] = 0;
  return {
    fInset: pack(columnMajor(inset)),
    fOutset: pack(columnMajor(outset)),
    fM1: seg(s.M1),
    fM2: seg(s.M2),
    fM3: seg(m3),
    fM4: seg(fallback(s.M4)),
    fM5: seg(s.M5),
    fNodes: pack([s.latitudeMin, s.latitudeMax, s.y[4], power]),
    fLog: pack([
      p.custom_grey ? p.grey_point_source / 100 : 0.1845,
      p.black_point_source,
      p.white_point_source - p.black_point_source,
      0.5 * (clamp(p.saturation / 100, -1, 1) + 1),
    ]),
    fDisplay: pack([Math.pow(s.y[0], power), Math.pow(s.y[4], power), p.shadows, p.highlights]),
  };
}
