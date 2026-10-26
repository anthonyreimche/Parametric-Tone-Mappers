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
// (colorspaces_inline_conversions.h L614-753). twin.ts is its TypeScript twin.

import { ENCODE_GLSL, SANITISE_GLSL, compressGlsl } from "../glsl/common";

// The uniform names are AGX_UNIFORM_TYPES's keys; the host namespaces them and
// these helpers, so they can't collide with the core's or another transform's.
export const AGX_HELPERS = `${SANITISE_GLSL}
${ENCODE_GLSL}
${compressGlsl("agxCompress", [0.2658180370250449, 0.59846986045365, 0.1357121025213052])}
float agxSigmoid(float u, float p) {
  return u / pow(1.0 + pow(u, p), 1.0 / p);
}
float agxCurve(float x) {
  float y;
  if (x < agxToe.x) {
    if (agxToeFallback.x > 0.5) {
      y = x < 0.0 ? agxCurveC.z : agxCurveC.z + max(0.0, agxToeFallback.y * pow(x, agxToeFallback.z));
    } else {
      y = agxToe.z * agxSigmoid(agxCurveC.x * (x - agxToe.x) / agxToe.z, agxToe.w) + agxToe.y;
    }
  } else if (x <= agxShoulder.x) {
    y = agxCurveC.x * x + agxCurveC.y;
  } else {
    if (agxShFallback.x > 0.5) {
      y = x >= 1.0 ? agxCurveC.w : agxCurveC.w - max(0.0, agxShFallback.y * pow(1.0 - x, agxShFallback.z));
    } else {
      y = agxShoulder.z * agxSigmoid(agxCurveC.x * (x - agxShoulder.x) / agxShoulder.z, agxShoulder.w) + agxShoulder.y;
    }
  }
  return y >= agxCurveC.z ? min(y, agxCurveC.w) : agxCurveC.z;
}
float agxHueOf(vec3 c, float mx, float delta) {
  float h;
  if (c.r == mx) h = (c.g - c.b) / delta;
  else if (c.g == mx) h = 2.0 + (c.b - c.r) / delta;
  else h = 4.0 + (c.r - c.g) / delta;
  h = h / 6.0;
  return h - floor(h);
}
vec3 agxToHsv(vec3 c) {
  float mn = min(c.r, min(c.g, c.b));
  float mx = max(c.r, max(c.g, c.b));
  float delta = mx - mn;
  if (abs(mx) > 1.0e-6 && abs(delta) > 1.0e-6) return vec3(agxHueOf(c, mx, delta), delta / mx, mx);
  return vec3(0.0, 0.0, mx);
}
vec3 agxFromHsv(vec3 hsv) {
  float chroma = hsv.y * hsv.z;
  float mn = hsv.z - chroma;
  float h = hsv.x * 6.0;
  float i = floor(h);
  float fc = (h - i) * chroma;
  float top = chroma + mn;
  float inc = fc + mn;
  float dec = top - fc;
  if (i == 0.0) return vec3(top, inc, mn);
  if (i == 1.0) return vec3(dec, top, mn);
  if (i == 2.0) return vec3(mn, top, inc);
  if (i == 3.0) return vec3(mn, dec, top);
  if (i == 4.0) return vec3(inc, mn, top);
  return vec3(top, mn, dec);
}
float agxLogEncode(float v) {
  return clamp((log2(max(1.0e-6, v / 0.18)) - agxRange.x) / agxRange.y, 0.0, 1.0);
}
vec3 agxToneMap(vec3 r) {
  float hBefore = agxHue.x > 0.5 ? agxToHsv(r).x : 0.0;
  vec3 t = vec3(agxCurve(agxLogEncode(r.r)), agxCurve(agxLogEncode(r.g)), agxCurve(agxLogEncode(r.b)));
  if (agxRange.w > 0.5) {
    vec3 v = agxLook.x * t + agxLook.y;
    t = vec3(
      v.r > 0.0 ? pow(v.r, agxLook.z) : v.r,
      v.g > 0.0 ? pow(v.g, agxLook.z) : v.g,
      v.b > 0.0 ? pow(v.b, agxLook.z) : v.b);
    float luma = dot(agxLumaY, t);
    t = luma + agxLook.w * (t - luma);
  }
  t = pow(max(t, vec3(0.0)), vec3(agxRange.z));
  if (agxHue.x > 0.5) {
    vec3 hsv = agxToHsv(t);
    float d = hsv.x - hBefore;
    float h = (1.0 - agxHue.y) * (d - roundEven(d)) + hBefore;
    hsv.x = h - floor(h);
    return agxFromHsv(hsv);
  }
  return t;
}`;

export const AGX_GLSL = `vec3 pipelineToDisplay(vec3 lin) {
  vec3 base = agxCompress(agxPipeToBase * ptmSanitise(lin));
  vec3 r = agxToneMap(agxBaseToRendering * base);
  return ptmEncode(agxRenderingToPipe * r);
}`;
