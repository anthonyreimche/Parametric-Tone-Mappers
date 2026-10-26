// This file is part of darktable,
// Copyright (C) 2025-2026 darktable developers.
// portions Copyright (C) 2017-2023 darktable developers (src/common/colorspaces_inline_conversions.h)
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
// Transcribes process (agx.c L1326-1414), _agx_tone_mapping (L1057-1101),
// _apply_log_encoding (L679-690), _apply_curve (L594-618) with _line
// (L502-507), _sigmoid, _scaled_sigmoid, _fallback_toe and _fallback_shoulder
// (L555-592), _agx_look (L640-677) with _luminance_from_matrix (L483-489) and
// _lerp_hue (L620-638), release-5.6.2, with dt_RGB_2_HSV and dt_HSV_2_RGB
// (colorspaces_inline_conversions.h L614-753). The TypeScript twin of the GLSL
// in glsl.ts, in doubles where darktable and the shader run in floats.

import { apply, fromColumnMajor, type Vec3 } from "../colour/mat3";
import { compressNegatives, sanitise } from "../glsl/common";
import type { AgxUniforms } from "./derive";

const GAMUT_K: Vec3 = [0.2658180370250449, 0.59846986045365, 0.1357121025213052];

const sigmoid = (u: number, p: number): number => u / Math.pow(1 + Math.pow(u, p), 1 / p);

/** The curve all three channels share, at the log-encoded scene value x in [0, 1]: its output between the
 *  curve's black and white, before the look and the output power. */
export function agxCurveAt(x: number, u: AgxUniforms): number {
  const [toeTx, toeTy, toeScale, toePower] = u.agxToe;
  const [shTx, shTy, shScale, shPower] = u.agxShoulder;
  const [slope, intercept, black, white] = u.agxCurveC;
  const [convex, toeCoeff, toePow] = u.agxToeFallback;
  const [concave, shCoeff, shPow] = u.agxShFallback;
  let y: number;
  if (x < toeTx) {
    y = convex > 0.5
      ? x < 0 ? black : black + Math.max(0, toeCoeff * Math.pow(x, toePow))
      : toeScale * sigmoid((slope * (x - toeTx)) / toeScale, toePower) + toeTy;
  } else if (x <= shTx) {
    y = slope * x + intercept;
  } else {
    y = concave > 0.5
      ? x >= 1 ? white : white - Math.max(0, shCoeff * Math.pow(1 - x, shPow))
      : shScale * sigmoid((slope * (x - shTx)) / shScale, shPower) + shTy;
  }
  // CLAMPF: NaN takes the lower bound.
  return y >= black ? Math.min(y, white) : black;
}

function hue(c: Vec3, mx: number, delta: number): number {
  let h: number;
  if (c[0] === mx) h = (c[1] - c[2]) / delta;
  else if (c[1] === mx) h = 2 + (c[2] - c[0]) / delta;
  else h = 4 + (c[0] - c[1]) / delta;
  h /= 6;
  return h - Math.floor(h);
}

function toHsv(c: Vec3): Vec3 {
  const mn = Math.min(c[0], c[1], c[2]);
  const mx = Math.max(c[0], c[1], c[2]);
  const delta = mx - mn;
  return Math.abs(mx) > 1e-6 && Math.abs(delta) > 1e-6 ? [hue(c, mx, delta), delta / mx, mx] : [0, 0, mx];
}

function fromHsv([h6, s, v]: Vec3): Vec3 {
  const C = s * v;
  const mn = v - C;
  const h = h6 * 6;
  const i = Math.floor(h);
  const fc = (h - i) * C;
  const top = C + mn;
  const inc = fc + mn;
  const dec = top - fc;
  if (i === 0) return [top, inc, mn];
  if (i === 1) return [dec, top, mn];
  if (i === 2) return [mn, top, inc];
  if (i === 3) return [mn, dec, top];
  if (i === 4) return [inc, mn, top];
  return [top, mn, dec];
}

// remainderf(d, 1) rounds the quotient half to even, as GLSL's roundEven does.
const roundEven = (d: number): number => {
  const r = Math.round(d);
  return Math.abs(d % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
};

function lerpHue(original: number, processed: number, mix: number): number {
  const d0 = processed - original;
  const h = (1 - mix) * (d0 - roundEven(d0)) + original;
  return h - Math.floor(h);
}

function toneMap(r: Vec3, u: AgxUniforms): Vec3 {
  const [blackEv, rangeEv, gamma, tuned] = u.agxRange;
  const [restore, mix] = u.agxHue;
  const hBefore = restore > 0.5 ? toHsv(r)[0] : 0;
  const encode = (v: number) =>
    Math.min(1, Math.max(0, (Math.log2(Math.max(1e-6, v / 0.18)) - blackEv) / rangeEv));
  let t: Vec3 = [agxCurveAt(encode(r[0]), u), agxCurveAt(encode(r[1]), u), agxCurveAt(encode(r[2]), u)];
  if (tuned > 0.5) {
    const [m, b, power, sat] = u.agxLook;
    const look = (x: number) => {
      const v = m * x + b;
      return v > 0 ? Math.pow(v, power) : v;
    };
    const powered: Vec3 = [look(t[0]), look(t[1]), look(t[2])];
    const luma = u.agxLumaY[0] * powered[0] + u.agxLumaY[1] * powered[1] + u.agxLumaY[2] * powered[2];
    t = [luma + sat * (powered[0] - luma), luma + sat * (powered[1] - luma), luma + sat * (powered[2] - luma)];
  }
  t = [Math.pow(Math.max(0, t[0]), gamma), Math.pow(Math.max(0, t[1]), gamma), Math.pow(Math.max(0, t[2]), gamma)];
  if (restore > 0.5) {
    const hsv = toHsv(t);
    return fromHsv([lerpHue(hBefore, hsv[0], mix), hsv[1], hsv[2]]);
  }
  return t;
}

/** One pixel through AgX: Safelight's linear Rec.709 in, display-linear
 *  Rec.709 out (signed where the colour leaves sRGB), before encoding. */
export function agxPixel(lin: Vec3, u: AgxUniforms): Vec3 {
  const base = compressNegatives(apply(fromColumnMajor(u.agxPipeToBase), sanitise(lin)), GAMUT_K);
  const rendering = apply(fromColumnMajor(u.agxBaseToRendering), base);
  return apply(fromColumnMajor(u.agxRenderingToPipe), toneMap(rendering, u));
}
