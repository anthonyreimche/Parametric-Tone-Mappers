// Parametric Tone Mappers, a Safelight extension. GPL-3.0-or-later. See LICENSE.

// RGB spaces as darktable and Ansel build their built-in profiles: lcms2's
// cmsCreateRGBProfile from D65 primaries (darktable's colorspaces.c tables and
// D65 white 0.31271/0.32902), colorants Bradford-adapted to lcms2's D50, and
// primaries/white read back as xy of the adapted colorants and of D50 (Ref
// §1.5). lcms2's s15.16 quantisation of stored tags is not reproduced; in-memory
// profiles keep doubles.
//
// The primaries tables are transcribed from darktable's src/common/colorspaces.c
// and the D65 white from src/common/colorspaces.h (release-5.6.2).
// Copyright (C) 2010-2026 darktable developers; GPL-3.0-or-later.

import { apply, column, columns, diag, mul, mustInvert, type Mat3, type Vec3 } from "./mat3";

export interface Xy {
  readonly x: number;
  readonly y: number;
}

export interface Profile {
  /** RGB → XYZ (D50). */
  readonly toXyz: Mat3;
  /** XYZ (D50) → RGB. */
  readonly fromXyz: Mat3;
  /** The adapted colorants' xy. */
  readonly primaries: readonly [Xy, Xy, Xy];
  /** The media white: D50. */
  readonly white: Xy;
}

const D65: Xy = { x: 0.31271, y: 0.32902 };
const D50: Vec3 = [0.9642, 1.0, 0.8249];
const BRADFORD: Mat3 = [0.8951, 0.2664, -0.1614, -0.7502, 1.7135, 0.0367, 0.0389, -0.0685, 1.0296];

export const xyToXyz = (p: Xy): Vec3 => [p.x / p.y, 1, (1 - p.x - p.y) / p.y];

export function xyzToXy(v: Vec3): Xy {
  const s = v[0] + v[1] + v[2];
  return { x: v[0] / s, y: v[1] / s };
}

function rgbToXyz(primaries: readonly [Xy, Xy, Xy], white: Vec3): Mat3 {
  const p = columns(xyToXyz(primaries[0]), xyToXyz(primaries[1]), xyToXyz(primaries[2]));
  return mul(p, diag(apply(mustInvert(p), white)));
}

function bradford(from: Vec3, to: Vec3): Mat3 {
  const a = apply(BRADFORD, from);
  const b = apply(BRADFORD, to);
  return mul(mul(mustInvert(BRADFORD), diag([b[0] / a[0], b[1] / a[1], b[2] / a[2]])), BRADFORD);
}

function profile(primaries: readonly [Xy, Xy, Xy]): Profile {
  const white = xyToXyz(D65);
  const toXyz = mul(bradford(white, D50), rgbToXyz(primaries, white));
  return {
    toXyz,
    fromXyz: mustInvert(toXyz),
    primaries: [xyzToXy(column(toXyz, 0)), xyzToXy(column(toXyz, 1)), xyzToXy(column(toXyz, 2))],
    white: xyzToXy(D50),
  };
}

export const REC2020 = profile([{ x: 0.708, y: 0.292 }, { x: 0.17, y: 0.797 }, { x: 0.131, y: 0.046 }]);
export const DISPLAY_P3 = profile([{ x: 0.68, y: 0.32 }, { x: 0.265, y: 0.69 }, { x: 0.15, y: 0.06 }]);
export const ADOBE_RGB = profile([{ x: 0.64, y: 0.33 }, { x: 0.21, y: 0.71 }, { x: 0.15, y: 0.06 }]);
export const SRGB = profile([{ x: 0.64, y: 0.33 }, { x: 0.3, y: 0.6 }, { x: 0.15, y: 0.06 }]);

/** Safelight's working values (linear Rec.709, D65) in linear Rec.2020. Both
 *  profiles are adapted by the same Bradford matrix, which cancels, so this is
 *  the plain D65 conversion. */
export const REC709_TO_REC2020 = mul(REC2020.fromXyz, SRGB.toXyz);
export const REC2020_TO_REC709 = mustInvert(REC709_TO_REC2020);
