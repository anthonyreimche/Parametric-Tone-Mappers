// Parametric Tone Mappers, a Safelight extension. GPL-3.0-or-later. See LICENSE.
//
// Constants transcribed from Ansel (src/pixel/chromatic_adaptation.h and
// src/common/colorspaces_inline_conversions.h at 2fadf8a366): CAT16 D50↔D65,
// CIE 2006 LMS (Richard A. Kirk, "Chromaticity coordinates for graphic arts
// based on CIE 2006 LMS with even spacing of Munsell colours",
// https://doi.org/10.2352/issn.2169-2629.2019.27.38) and Filmlight Yrg.
// Copyright (C) 2020-2021, 2025 Aurélien PIERRE; 2021 Pascal Obry; 2021 Ralf Brown; 2022 Martin Bařinka; 2022 Sakari Kapanen; 2023 Luca Zulberti (src/pixel/chromatic_adaptation.h).
// Copyright (C) 2017 Tobias Ellinghaus; 2018-2022, 2025 Aurélien PIERRE; 2018, 2020-2021 Pascal Obry; 2019 Edgardo Hoszowski; 2019, 2021 Philippe Weyland; 2019 Roman Lebedev; 2020 Harold le Clément de Saint-Marcq; 2020-2021 Ralf Brown; 2021-2022 Sakari Kapanen; 2022 Martin Bařinka (src/common/colorspaces_inline_conversions.h).
// GPL-3.0-or-later.

import { apply, type Mat3, type Vec3 } from "./mat3";

export const XYZ_D50_TO_D65_CAT16: Mat3 = [
  9.89466254e-1, -4.00304626e-2, 4.40530317e-2,
  -5.40518733e-3, 1.00666069e0, -1.75551955e-3,
  -4.03920992e-4, 1.5076803e-2, 1.30210211e0,
];
export const XYZ_D65_TO_D50_CAT16: Mat3 = [
  1.01085433e0, 4.07086103e-2, -3.41445825e-2,
  5.42814201e-3, 9.93581926e-1, 1.15592039e-3,
  2.50722468e-4, -1.14918759e-2, 7.67964947e-1,
];
export const XYZ_D65_TO_LMS_2006: Mat3 = [
  0.257085, 0.859943, -0.031061,
  -0.394427, 1.1758, 0.106423,
  0.064856, -0.07625, 0.559067,
];
export const LMS_2006_TO_XYZ_D65: Mat3 = [
  1.80794659, -1.2997166, 0.34785879,
  0.6178396, 0.39595453, -0.04104687,
  -0.1254696, 0.20478038, 1.74274183,
];
export const FILMLIGHT_TO_LMS: Mat3 = [0.95, 0.38, 0.0, 0.05, 0.62, 0.03, 0.0, 0.0, 0.97];
export const LMS_TO_FILMLIGHT: Mat3 = [
  1.0877193, -0.66666667, 0.02061856,
  -0.0877193, 1.66666667, -0.05154639,
  0.0, 0.0, 1.03092784,
];

export function lmsToYrg(lms: Vec3): Vec3 {
  const Y = 0.68990272 * lms[0] + 0.34832189 * lms[1];
  const a = lms[0] + lms[1] + lms[2];
  const n: Vec3 = a === 0 ? [0, 0, 0] : [lms[0] / a, lms[1] / a, lms[2] / a];
  const rgb = apply(LMS_TO_FILMLIGHT, n);
  return [Y, rgb[0], rgb[1]];
}

export function yrgToLms(yrg: Vec3): Vec3 {
  const lms = apply(FILMLIGHT_TO_LMS, [yrg[1], yrg[2], 1 - yrg[1] - yrg[2]]);
  const d = 0.68990272 * lms[0] + 0.34832189 * lms[1];
  const k = d === 0 ? 0 : yrg[0] / d;
  return [lms[0] * k, lms[1] * k, lms[2] * k];
}

export const xyzD50ToYrg = (xyz: Vec3): Vec3 =>
  lmsToYrg(apply(XYZ_D65_TO_LMS_2006, apply(XYZ_D50_TO_D65_CAT16, xyz)));

export const yrgToXyzD50 = (yrg: Vec3): Vec3 =>
  apply(XYZ_D65_TO_D50_CAT16, apply(LMS_2006_TO_XYZ_D65, yrgToLms(yrg)));
