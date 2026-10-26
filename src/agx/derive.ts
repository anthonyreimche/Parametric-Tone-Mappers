// This file is part of darktable,
// Copyright (C) 2025-2026 darktable developers.
// portions Copyright (C) 2023 darktable developers (src/common/custom_primaries.c)
// portions Copyright (C) 2010-2026 darktable developers (src/common/colorspaces.c)
//
// darktable is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// darktable is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with darktable.  If not, see <http://www.gnu.org/licenses/>.
//
// Transcribes _calculate_tone_mapping_params (agx.c L773-958),
// _get_primaries_params (L960-1002) and _create_matrices (L1222-1324),
// release-5.6.2, with the helpers they call: dt_rotate_and_scale_primary
// (custom_primaries.c L23-94) and dt_make_transposed_matrices_from_primaries_
// and_whitepoint (colorspaces.c L2561-2600). It runs in doubles where
// darktable runs in floats.

import { clamp, sigmoidScale } from "../curve-math";
import { apply, columnMajor, columns, diag, invert, mul, mustInvert, row, type Mat3, type Vec3 } from "../colour/mat3";
import { ADOBE_RGB, DISPLAY_P3, REC2020, SRGB, type Profile, type Xy } from "../colour/profiles";
import type { GlslType } from "../safelight";
import type { AgxParams } from "./params";

const EPS = 1e-6;
const DEFAULT_GAMMA = 2.2;
const FALLBACK_COEFF_MAX = 1e9;
const FLT_MAX = 3.4028234663852886e38;
const FLT_EPSILON = 1.1920928955078125e-7;
const ZERO: Vec3 = [0, 0, 0];

export interface AgxCurve {
  blackEv: number;
  rangeEv: number;
  gamma: number;
  pivotX: number;
  pivotY: number;
  slope: number;
  intercept: number;
  targetBlack: number;
  targetWhite: number;
  toeTx: number;
  toeTy: number;
  toeScale: number;
  toePower: number;
  needConvexToe: boolean;
  toeFallbackPower: number;
  toeFallbackCoeff: number;
  shTx: number;
  shTy: number;
  shScale: number;
  shPower: number;
  needConcaveShoulder: boolean;
  shFallbackPower: number;
  shFallbackCoeff: number;
  lookPower: number;
  lookTuned: boolean;
  restoreHue: boolean;
  /** _apply_slope_lift's m and b: v = m·x + b. */
  lookM: number;
  lookB: number;
}

/** _calculate_fallback_curve_coefficient (L700-705). The result is read only
 *  while the matching need flag is set, where the power is below 1 and the
 *  coefficient at most 1e6. Elsewhere pow underflows to 0 and darktable's
 *  division gives inf; the cap keeps the value finite for the uniform. */
const fallbackCoefficient = (dx: number, dy: number, power: number): number =>
  Math.min(FALLBACK_COEFF_MAX, dy / Math.pow(dx, power));

const pivotYAt = (p: AgxParams, gamma: number): number =>
  Math.pow(
    clamp(p.curve_pivot_y_linear_output, p.curve_target_display_black_ratio, p.curve_target_display_white_ratio),
    1 / gamma,
  );

export function agxCurve(p: AgxParams): AgxCurve {
  const blackEv = p.range_black_relative_ev;
  const rangeEv = p.range_white_relative_ev - blackEv;
  const pivotX = clamp(p.curve_pivot_x, EPS, 1 - EPS);
  const autoGamma = Math.log2(p.curve_pivot_y_linear_output) / Math.log2(pivotX);
  // Beyond darktable's guard (pivot output 0, L788-794): output 1 gives it a gamma of -0 and a white frame, so any
  // auto gamma that isn't finite and positive takes the slider's.
  const gamma = p.auto_gamma && autoGamma > 0 && Number.isFinite(autoGamma) ? autoGamma : p.curve_gamma;
  const pivotY = pivotYAt(p, gamma);

  const rangeAdjustedSlope = p.curve_contrast_around_pivot * (rangeEv / 16.5);
  const atGamma = gamma * Math.pow(Math.max(EPS, pivotY), gamma - 1);
  const atDefault = DEFAULT_GAMMA * Math.pow(Math.max(EPS, pivotYAt(p, DEFAULT_GAMMA)), DEFAULT_GAMMA - 1);
  const slope = rangeAdjustedSlope / (atGamma / atDefault);

  const targetBlack = Math.pow(p.curve_target_display_black_ratio, 1 / gamma);
  const toePower = Math.max(0.01, p.curve_toe_power);
  const toeLenY = (pivotY - targetBlack) * p.curve_linear_ratio_below_pivot;
  const toeTx = Math.max(EPS, pivotX - toeLenY / slope);
  const toeTy = pivotY - slope * (pivotX - toeTx);
  const toeScale = -sigmoidScale(1, 1 - targetBlack, 1 - toeTx, 1 - toeTy, slope, toePower);
  const toeDy = Math.max(EPS, toeTy - targetBlack);
  const toeFallbackPower = (slope * toeTx) / toeDy;

  const targetWhite = Math.pow(p.curve_target_display_white_ratio, 1 / gamma);
  const shLenY = (targetWhite - pivotY) * p.curve_linear_ratio_above_pivot;
  const shTx = Math.min(1 - EPS, pivotX + shLenY / slope);
  const shTy = pivotY + slope * (shTx - pivotX);
  const shPower = Math.max(0.01, p.curve_shoulder_power);
  const shDy = Math.max(EPS, targetWhite - shTy);
  const shFallbackPower = (slope * (1 - shTx)) / shDy;

  const brightness = p.look_brightness;
  const lookM = p.look_slope / (1 + p.look_lift);
  return {
    blackEv,
    rangeEv,
    gamma,
    pivotX,
    pivotY,
    slope,
    intercept: toeTy - slope * toeTx,
    targetBlack,
    targetWhite,
    toeTx,
    toeTy,
    toeScale,
    toePower,
    needConvexToe: toeDy / toeTx > slope,
    toeFallbackPower,
    toeFallbackCoeff: fallbackCoefficient(toeTx, toeDy, toeFallbackPower),
    shTx,
    shTy,
    shScale: sigmoidScale(1, targetWhite, shTx, shTy, slope, shPower),
    shPower,
    needConcaveShoulder: shDy / (1 - shTx) > slope,
    shFallbackPower,
    shFallbackCoeff: fallbackCoefficient(1 - shTx, shDy, shFallbackPower),
    lookPower: brightness < 1 ? 1 / Math.sqrt(Math.max(brightness, EPS)) : 1 / brightness,
    lookTuned: p.look_slope !== 1 || brightness !== 1 || p.look_lift !== 0 || p.look_saturation !== 1,
    restoreHue: p.look_original_hue_mix_ratio !== 0,
    lookM,
    lookB: p.look_lift * lookM,
  };
}

/** base_primaries: 0 (export profile) and 1 (working profile) render as
 *  Rec2020, darktable's default working space (spec §5.3). */
export function baseProfile(index: number): Profile {
  if (index === 3) return DISPLAY_P3;
  if (index === 4) return ADOBE_RGB;
  if (index === 5) return SRGB;
  return REC2020;
}

// custom_primaries.c L23-74: the nearest edge of the profile's primaries
// triangle along the ray from white, over each edge's full line, forward only.
function distanceToEdge(p: Profile, cos: number, sin: number): number {
  const x1 = p.white.x;
  const y1 = p.white.y;
  const x2 = x1 + cos;
  const y2 = y1 + sin;
  let best = FLT_MAX;
  for (let i = 0; i < 3; i++) {
    const a = p.primaries[i];
    const b = p.primaries[(i + 1) % 3];
    const den = (x1 - x2) * (a.y - b.y) - (a.x - b.x) * (y1 - y2);
    if (den === 0) continue;
    const t = ((x1 - a.x) * (a.y - b.y) - (a.x - b.x) * (y1 - a.y)) / den;
    if (t >= 0 && t < best) best = t;
  }
  return best;
}

export function rotateAndScalePrimary(p: Profile, scaling: number, rotation: number, i: number): Xy {
  const angle = Math.atan2(p.primaries[i].y - p.white.y, p.primaries[i].x - p.white.x) + rotation;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const d = distanceToEdge(p, cos, sin);
  return { x: p.white.x + scaling * d * cos, y: p.white.y + scaling * d * sin };
}

const sanitizeY = (y: number): number =>
  y < FLT_EPSILON && y >= 0 ? FLT_EPSILON : y < 0 && y > -FLT_EPSILON ? -FLT_EPSILON : y;

/** RGB → XYZ for xy primaries and an xy white (colorspaces.c L2577-2600), or
 *  null when the primaries' matrix is singular. */
export function matrixFromPrimaries(primaries: readonly [Xy, Xy, Xy], white: Xy): Mat3 | null {
  const toXyz = (q: Xy): Vec3 => {
    const y = sanitizeY(q.y);
    return [q.x / y, 1, (1 - q.x - y) / y];
  };
  const m = columns(toXyz(primaries[0]), toXyz(primaries[1]), toXyz(primaries[2]));
  const inv = invert(m);
  return inv && mul(m, diag(apply(inv, toXyz(white))));
}

interface Primaries {
  inset: Vec3;
  rotation: Vec3;
  outset: Vec3;
  unrotation: Vec3;
  masterOutset: number;
  masterUnrotation: number;
}

function primariesOf(p: AgxParams): Primaries {
  const masters = { masterOutset: p.master_outset_ratio, masterUnrotation: p.master_unrotation_ratio };
  if (p.disable_primaries_adjustments) {
    return { inset: ZERO, rotation: ZERO, outset: ZERO, unrotation: ZERO, ...masters };
  }
  const inset: Vec3 = [p.red_inset, p.green_inset, p.blue_inset];
  const rotation: Vec3 = [p.red_rotation, p.green_rotation, p.blue_rotation];
  if (p.completely_reverse_primaries) {
    return { inset, rotation, outset: inset, unrotation: rotation, masterOutset: 1, masterUnrotation: 1 };
  }
  return {
    inset,
    rotation,
    outset: [p.red_outset, p.green_outset, p.blue_outset],
    unrotation: [p.red_unrotation, p.green_unrotation, p.blue_unrotation],
    ...masters,
  };
}

export interface AgxMatrices {
  pipeToBase: Mat3;
  baseToRendering: Mat3;
  renderingToPipe: Mat3;
  renderingToXyz: Mat3;
}

const UNADJUSTED: Primaries = { inset: ZERO, rotation: ZERO, outset: ZERO, unrotation: ZERO, masterOutset: 1, masterUnrotation: 1 };

function displacedMatrices(base: Profile, q: Primaries): AgxMatrices | null {
  const pipeToBase = mul(base.fromXyz, SRGB.toXyz);
  const displaced = (scaling: (i: number) => number, rotation: (i: number) => number): Mat3 | null =>
    matrixFromPrimaries(
      [
        rotateAndScalePrimary(base, scaling(0), rotation(0), 0),
        rotateAndScalePrimary(base, scaling(1), rotation(1), 1),
        rotateAndScalePrimary(base, scaling(2), rotation(2), 2),
      ],
      base.white,
    );
  const r2xIn = displaced((i) => 1 - q.inset[i], (i) => q.rotation[i]);
  const r2xOut = displaced((i) => 1 - q.masterOutset * q.outset[i], (i) => q.masterUnrotation * q.unrotation[i]);
  const outsetToBase = r2xOut && invert(mul(base.fromXyz, r2xOut));
  if (!r2xIn || !outsetToBase) return null;
  return {
    pipeToBase,
    baseToRendering: mul(base.fromXyz, r2xIn),
    renderingToPipe: mul(mustInvert(pipeToBase), outsetToBase),
    renderingToXyz: r2xIn,
  };
}

/** The pipe is Safelight's working space, linear Rec.709 (the sRGB profile);
 *  pipeToBase carries the conversion darktable's Rec2020 pipe doesn't need.
 *  Displaced primaries with a singular matrix (master purity boost 2 with a
 *  purity boost of 0.5 puts a primary on white) render as the unmodified
 *  primaries, which is what disable adjustments gives. */
export function agxMatrices(p: AgxParams): AgxMatrices {
  const base = baseProfile(p.base_primaries);
  const m = displacedMatrices(base, primariesOf(p)) ?? displacedMatrices(base, UNADJUSTED);
  // A profile's own primaries are never singular.
  if (!m) throw new Error("singular colour matrix");
  return m;
}

export const AGX_UNIFORM_TYPES = {
  agxPipeToBase: "mat3",
  agxBaseToRendering: "mat3",
  agxRenderingToPipe: "mat3",
  agxLumaY: "vec3",
  agxRange: "vec4",
  agxToe: "vec4",
  agxShoulder: "vec4",
  agxCurveC: "vec4",
  agxToeFallback: "vec4",
  agxShFallback: "vec4",
  agxLook: "vec4",
  agxHue: "vec2",
} as const satisfies Readonly<Record<string, GlslType>>;

export type AgxUniforms = Record<keyof typeof AGX_UNIFORM_TYPES, number[]>;

const flag = (b: boolean): number => (b ? 1 : 0);

/** Every uniform the AgX GLSL reads, matrices column-major. Packing:
 *  agxRange (black EV, range EV, gamma, look tuned), agxToe/agxShoulder
 *  (transition x, transition y, scale, power), agxCurveC (slope, intercept,
 *  target black, target white), agxToeFallback/agxShFallback (needed, coeff,
 *  power, 0), agxLook (m, b, power, saturation), agxHue (restore, mix). */
export function deriveAgx(p: AgxParams): AgxUniforms {
  const c = agxCurve(p);
  const m = agxMatrices(p);
  return {
    agxPipeToBase: columnMajor(m.pipeToBase),
    agxBaseToRendering: columnMajor(m.baseToRendering),
    agxRenderingToPipe: columnMajor(m.renderingToPipe),
    agxLumaY: [...row(m.renderingToXyz, 1)],
    agxRange: [c.blackEv, c.rangeEv, c.gamma, flag(c.lookTuned)],
    agxToe: [c.toeTx, c.toeTy, c.toeScale, c.toePower],
    agxShoulder: [c.shTx, c.shTy, c.shScale, c.shPower],
    agxCurveC: [c.slope, c.intercept, c.targetBlack, c.targetWhite],
    agxToeFallback: [flag(c.needConvexToe), c.toeFallbackCoeff, c.toeFallbackPower, 0],
    agxShFallback: [flag(c.needConcaveShoulder), c.shFallbackCoeff, c.shFallbackPower, 0],
    agxLook: [c.lookM, c.lookB, c.lookPower, p.look_saturation],
    agxHue: [flag(c.restoreHue), p.look_original_hue_mix_ratio],
  };
}
