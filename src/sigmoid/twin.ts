// This file is part of darktable,
// Copyright (C) 2020-2026 darktable developers.
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
// Transcribes _generalized_loglogistic_sigmoid (sigmoid.c L299-316),
// _desaturate_negative_values (L494-504), _pixel_channel_order (L513-564),
// process_loglogistic_rgb_ratio (L566-654), _preserve_hue_and_energy
// (L656-701) and process_loglogistic_per_channel (L703-761), release-5.6.2.
// The TypeScript twin of the GLSL in glsl.ts, in doubles where darktable and
// the shader run in floats.

import { apply, fromColumnMajor, type Vec3 } from "../colour/mat3";
import { REC2020_TO_REC709, REC709_TO_REC2020 } from "../colour/profiles";
import { sanitise } from "../glsl/common";
import { curveOf, type SigmoidCurve, type SigmoidUniforms } from "./derive";

/** The tone curve at a scene-linear value. */
export function loglogistic(value: number, c: SigmoidCurve): number {
  // fmaxf: a NaN value is 0.
  const clamped = value > 0 ? value : 0;
  const film = Math.pow(c.filmFog + clamped, c.filmPower);
  const paper = c.whiteTarget * Math.pow(film / (c.paperExposure + film), c.paperPower);
  return Number.isNaN(paper) ? c.whiteTarget : paper;
}

function desaturateNegatives(p: Vec3): Vec3 {
  const average = Math.max((p[0] + p[1] + p[2]) / 3, 0);
  const min = Math.min(p[0], p[1], p[2]);
  const k = min < 0 ? -average / (min - average) : 1;
  return [average + k * (p[0] - average), average + k * (p[1] - average), average + k * (p[2] - average)];
}

/** [min, mid, max] channel indices, with upstream's tie-breaks. */
function channelOrder(p: Vec3): [number, number, number] {
  if (p[0] >= p[1]) {
    if (p[1] > p[2]) return [2, 1, 0];
    if (p[2] > p[0]) return [1, 0, 2];
    if (p[2] > p[1]) return [1, 2, 0];
    return [2, 1, 0];
  }
  if (p[0] >= p[2]) return [2, 0, 1];
  if (p[2] > p[1]) return [0, 1, 2];
  return [0, 2, 1];
}

function rgbRatio(p: Vec3, c: SigmoidCurve, blackTarget: number): Vec3 {
  const pos = desaturateNegatives(p);
  const luma = (pos[0] + pos[1] + pos[2]) / 3;
  const mapped = loglogistic(luma, c);
  const pre: Vec3 = luma > 1e-9 ? [pos[0] * (mapped / luma), pos[1] * (mapped / luma), pos[2] * (mapped / luma)] : [mapped, mapped, mapped];
  const [iMin, , iMax] = channelOrder(pre);
  const min = pre[iMin];
  const max = pre[iMax];
  const epsilon = 1e-6;
  const toWhite = (c.whiteTarget - mapped) / (max - mapped + epsilon);
  const toBlack = (blackTarget - mapped) / (min - mapped - epsilon);
  const border = Math.min(toWhite, toBlack);
  const chroma = (mapped - min) / (mapped + epsilon);
  const adjustment = 1 / (chroma * border + epsilon);
  const hyperbolic = ((2 * chroma) / (1 - chroma * chroma + epsilon)) * adjustment;
  const z = Math.sqrt(hyperbolic * hyperbolic + 1);
  const k = (hyperbolic / (1 + z)) * border;
  return [mapped + k * (pre[0] - mapped), mapped + k * (pre[1] - mapped), mapped + k * (pre[2] - mapped)];
}

function preserveHueAndEnergy(input: Vec3, perChannel: Vec3, hue: number): Vec3 {
  const [lo, md, hi] = channelOrder(input);
  const chroma = input[hi] - input[lo];
  const midscale = chroma !== 0 ? (input[md] - input[lo]) / chroma : 0;
  const fullCorrection = perChannel[lo] + (perChannel[hi] - perChannel[lo]) * midscale;
  const naiveMid = (1 - hue) * perChannel[md] + hue * fullCorrection;
  const energy = perChannel[0] + perChannel[1] + perChannel[2];
  const naiveEnergy = perChannel[lo] + naiveMid + perChannel[hi];
  const minPlusMid = input[lo] + input[md];
  const blend = minPlusMid !== 0 ? (2 * input[lo]) / minPlusMid : 0;
  const target = blend * energy + (1 - blend) * naiveEnergy;
  const out: [number, number, number] = [0, 0, 0];
  if (naiveMid <= perChannel[md]) {
    const mid =
      ((1 - hue) * perChannel[md] + hue * (midscale * perChannel[hi] + (1 - midscale) * (target - perChannel[hi]))) /
      (1 + hue * (1 - midscale));
    out[lo] = target - perChannel[hi] - mid;
    out[md] = mid;
    out[hi] = perChannel[hi];
  } else {
    const mid =
      ((1 - hue) * perChannel[md] + hue * (perChannel[lo] * (1 - midscale) + midscale * (target - perChannel[lo]))) /
      (1 + hue * midscale);
    out[lo] = perChannel[lo];
    out[md] = mid;
    out[hi] = target - perChannel[lo] - mid;
  }
  return out;
}

/** One pixel through Sigmoid: Safelight's linear Rec.709 in, display-linear
 *  Rec.709 out (signed where the colour leaves sRGB), before encoding. The
 *  photo's process version picks the matrices, and the working profile RGB
 *  ratio runs in, as SL_PROCESS_VERSION does in the GLSL; without one it is
 *  version 1. */
export function sigmoidPixel(lin: Vec3, u: SigmoidUniforms, processVersion?: number): Vec3 {
  const v2 = (processVersion ?? 1) >= 2;
  const c = curveOf(u);
  const [, blackTarget, hue, method] = u.sgShape;
  const pipe = sanitise(lin);
  if (method > 0.5) {
    return v2 ? rgbRatio(pipe, c, blackTarget) : apply(REC2020_TO_REC709, rgbRatio(apply(REC709_TO_REC2020, pipe), c, blackTarget));
  }
  const base = desaturateNegatives(apply(fromColumnMajor(v2 ? u.sgPipeToBase : u.sgPipeToBaseV1), pipe));
  const rendering = apply(fromColumnMajor(v2 ? u.sgBaseToRendering : u.sgBaseToRenderingV1), base);
  const perChannel: Vec3 = [loglogistic(rendering[0], c), loglogistic(rendering[1], c), loglogistic(rendering[2], c)];
  return apply(fromColumnMajor(v2 ? u.sgRenderingToPipe : u.sgRenderingToPipeV1), preserveHueAndEnergy(rendering, perChannel, hue));
}
