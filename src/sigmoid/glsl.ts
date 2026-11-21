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
// twin.ts is its TypeScript twin.

import { REC2020_TO_REC709, REC709_TO_REC2020 } from "../colour/profiles";
import { ENCODE_GLSL, SANITISE_GLSL, glslMat3 } from "../glsl/common";

// The uniform names are SIGMOID_UNIFORM_TYPES's keys; the host namespaces them
// and these helpers, so they can't collide with the core's or another
// transform's. sgV2 is false where SL_PROCESS_VERSION is undefined (builds
// before Safelight 3.2.0, where #if on it wouldn't compile): those draw every
// photo as version 1.
//
// sgCurveAt is upstream's curve written as white · (1 / (1 + exposure ·
// base^-power))^skew, which is the same number: GLSL leaves pow(0, y) and
// pow(x < 0, y) undefined, and upstream's pow(fog + x, power) over a bright
// pixel overflows to inf / inf, which upstream catches with isnan and a
// compiler may fold away. A base of 0 is upstream's 0.
// Components picked by a channel index go through sgAt and sgScatter.
export const SIGMOID_HELPERS = `${SANITISE_GLSL}
${ENCODE_GLSL}
bool sgV2() {
  bool v2 = false;
#ifdef SL_PROCESS_VERSION
#if SL_PROCESS_VERSION >= 2
  v2 = true;
#endif
#endif
  return v2;
}
float sgCurveAt(float x) {
  float base = sgCurve.z + max(x, 0.0);
  if (!(base > 0.0)) return 0.0;
  float ratio = 1.0 / (1.0 + sgCurve.y * exp2(-sgCurve.w * log2(base)));
  return sgCurve.x * pow(ratio, sgShape.x);
}
vec3 sgDesaturate(vec3 p) {
  float average = max((p.r + p.g + p.b) / 3.0, 0.0);
  float lowest = min(p.r, min(p.g, p.b));
  float k = lowest < 0.0 ? -average / (lowest - average) : 1.0;
  return average + k * (p - average);
}
ivec3 sgOrder(vec3 p) {
  if (p.r >= p.g) {
    if (p.g > p.b) return ivec3(2, 1, 0);
    if (p.b > p.r) return ivec3(1, 0, 2);
    if (p.b > p.g) return ivec3(1, 2, 0);
    return ivec3(2, 1, 0);
  }
  if (p.r >= p.b) return ivec3(2, 0, 1);
  if (p.b > p.g) return ivec3(0, 1, 2);
  return ivec3(0, 2, 1);
}
float sgAt(vec3 v, int i) {
  return i == 0 ? v.r : (i == 1 ? v.g : v.b);
}
vec3 sgScatter(ivec3 o, float lo, float md, float hi) {
  return vec3(
    o.z == 0 ? hi : (o.y == 0 ? md : lo),
    o.z == 1 ? hi : (o.y == 1 ? md : lo),
    o.z == 2 ? hi : (o.y == 2 ? md : lo));
}
vec3 sgPreserveHue(vec3 i, vec3 pc, float hue) {
  ivec3 o = sgOrder(i);
  float iLo = sgAt(i, o.x);
  float iMd = sgAt(i, o.y);
  float iHi = sgAt(i, o.z);
  float cLo = sgAt(pc, o.x);
  float cMd = sgAt(pc, o.y);
  float cHi = sgAt(pc, o.z);
  float chroma = iHi - iLo;
  float midscale = chroma != 0.0 ? (iMd - iLo) / chroma : 0.0;
  float full = cLo + (cHi - cLo) * midscale;
  float naiveMid = (1.0 - hue) * cMd + hue * full;
  float energy = pc.r + pc.g + pc.b;
  float naiveEnergy = cLo + naiveMid + cHi;
  float loPlusMd = iLo + iMd;
  float blend = loPlusMd != 0.0 ? 2.0 * iLo / loPlusMd : 0.0;
  float target = blend * energy + (1.0 - blend) * naiveEnergy;
  if (naiveMid <= cMd) {
    float mid = ((1.0 - hue) * cMd + hue * (midscale * cHi + (1.0 - midscale) * (target - cHi))) / (1.0 + hue * (1.0 - midscale));
    return sgScatter(o, target - cHi - mid, mid, cHi);
  }
  float mid = ((1.0 - hue) * cMd + hue * (cLo * (1.0 - midscale) + midscale * (target - cLo))) / (1.0 + hue * midscale);
  return sgScatter(o, cLo, mid, target - cLo - mid);
}
vec3 sgPerChannel(vec3 lin, bool v2) {
  vec3 base = sgDesaturate((v2 ? sgPipeToBase : sgPipeToBaseV1) * lin);
  vec3 r = (v2 ? sgBaseToRendering : sgBaseToRenderingV1) * base;
  vec3 pc = vec3(sgCurveAt(r.r), sgCurveAt(r.g), sgCurveAt(r.b));
  return (v2 ? sgRenderingToPipe : sgRenderingToPipeV1) * sgPreserveHue(r, pc, sgShape.z);
}
vec3 sgRgbRatio(vec3 p) {
  vec3 pos = sgDesaturate(p);
  float luma = (pos.r + pos.g + pos.b) / 3.0;
  float mapped = sgCurveAt(luma);
  vec3 pre = luma > 1.0e-9 ? (mapped / luma) * pos : vec3(mapped);
  float lowest = min(pre.r, min(pre.g, pre.b));
  float highest = max(pre.r, max(pre.g, pre.b));
  float eps = 1.0e-6;
  float toWhite = (sgCurve.x - mapped) / (highest - mapped + eps);
  float toBlack = (sgShape.y - mapped) / (lowest - mapped - eps);
  float border = min(toWhite, toBlack);
  float chroma = (mapped - lowest) / (mapped + eps);
  float adjustment = 1.0 / (chroma * border + eps);
  float hyperbolic = 2.0 * chroma / (1.0 - chroma * chroma + eps) * adjustment;
  float z = sqrt(hyperbolic * hyperbolic + 1.0);
  float k = hyperbolic / (1.0 + z) * border;
  return mapped + k * (pre - mapped);
}
vec3 sgRgbRatioIn(vec3 lin, bool v2) {
  if (v2) return sgRgbRatio(lin);
  return ${glslMat3(REC2020_TO_REC709)} * sgRgbRatio(${glslMat3(REC709_TO_REC2020)} * lin);
}`;

export const SIGMOID_GLSL = `vec3 pipelineToDisplay(vec3 lin) {
  bool v2 = sgV2();
  vec3 c = ptmSanitise(lin);
  return ptmEncode(sgShape.w > 0.5 ? sgRgbRatioIn(c, v2) : sgPerChannel(c, v2));
}`;
