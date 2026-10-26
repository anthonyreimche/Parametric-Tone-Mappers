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
// portions Copyright (C) 2017 Tobias Ellinghaus; 2018-2022, 2025 Aurélien PIERRE; 2018, 2020-2021 Pascal Obry; 2019 Edgardo Hoszowski; 2019, 2021 Philippe Weyland; 2019 Roman Lebedev; 2020 Harold le Clément de Saint-Marcq; 2020-2021 Ralf Brown; 2021-2022 Sakari Kapanen; 2022 Martin Bařinka (src/common/colorspaces_inline_conversions.h)
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
// and the export -> pipe hop skipped (Ref 3.1); LMS_to_Yrg and Yrg_to_LMS
// (colorspaces_inline_conversions.h L1014-1075). twin.ts is its TypeScript twin.

import { ENCODE_GLSL, SANITISE_GLSL, compressGlsl, glslMat3 } from "../glsl/common";
import { FILMLIGHT_TO_LMS, LMS_TO_FILMLIGHT } from "../colour/yrg";
import { EXPORT_INPUT, EXPORT_OUTPUT, FILMIC_PIPE, PIPE_LUMA, PIPE_TO_LMS } from "./spaces";

// The uniform names are FILMIC_UNIFORM_TYPES's keys; the host namespaces them
// and these helpers, so they can't collide with the core's or another
// transform's. Global const names aren't rewritten, hence the PTM_ prefix.
export const FILMIC_HELPERS = `const mat3 PTM_F_PIPE = ${glslMat3(FILMIC_PIPE)};
const mat3 PTM_F_PIPE_TO_LMS = ${glslMat3(PIPE_TO_LMS)};
const mat3 PTM_F_EXPORT_INPUT = ${glslMat3(EXPORT_INPUT)};
const mat3 PTM_F_EXPORT_OUTPUT = ${glslMat3(EXPORT_OUTPUT)};
const mat3 PTM_F_LMS_TO_FILMLIGHT = ${glslMat3(LMS_TO_FILMLIGHT)};
const mat3 PTM_F_FILMLIGHT_TO_LMS = ${glslMat3(FILMLIGHT_TO_LMS)};
const float PTM_F_FLT_MAX = 3.402823466e38;
const float PTM_F_Y2006 = 1.05785528;
${SANITISE_GLSL}
${ENCODE_GLSL}
${compressGlsl("fCompress", PIPE_LUMA)}
vec3 fLmsToYrg(vec3 lms) {
  float Y = 0.68990272 * lms.x + 0.34832189 * lms.y;
  float a = lms.x + lms.y + lms.z;
  vec3 n = a == 0.0 ? vec3(0.0) : lms / a;
  vec3 rgb = PTM_F_LMS_TO_FILMLIGHT * n;
  return vec3(Y, rgb.x, rgb.y);
}
vec3 fYrgToLms(vec3 yrg) {
  vec3 lms = PTM_F_FILMLIGHT_TO_LMS * vec3(yrg.y, yrg.z, 1.0 - yrg.y - yrg.z);
  float d = 0.68990272 * lms.x + 0.34832189 * lms.y;
  return lms * (d == 0.0 ? 0.0 : yrg.x / d);
}
vec4 fToYch(vec3 rgb, mat3 toLms) {
  vec3 yrg = fLmsToYrg(toLms * rgb);
  float r = yrg.y - 0.21902143;
  float g = yrg.z - 0.54371398;
  float c = length(vec2(g, r));
  return vec4(yrg.x, c, c != 0.0 ? r / c : 1.0, c != 0.0 ? g / c : 0.0);
}
vec3 fFromYch(vec4 f, mat3 fromLms) {
  return fromLms * fYrgToLms(vec3(f.x, f.y * f.z + 0.21902143, f.y * f.w + 0.54371398));
}
float fSpline(float x) {
  if (x < fNodes.x) {
    if (fDisplay.z == 3.0) {
      if (fM5.x != 0.0) return fM3.z + max(0.0, fM3.x * pow(max(x, 0.0), fM4.x));
      float ty = fNodes.x * fM2.z + fM1.z;
      float v = fM2.z * (x - fNodes.x) / fM1.x;
      return fM1.x * (v / pow(1.0 + pow(v, fM2.x), 1.0 / fM2.x)) + ty;
    }
    if (fDisplay.z == 0.0) return fM1.x + x * (fM2.x + x * (fM3.x + x * (fM4.x + x * fM5.x)));
    if (fDisplay.z == 1.0) return fM1.x + x * (fM2.x + x * (fM3.x + x * fM4.x));
    float xi = fNodes.x - x;
    float rat = xi * (xi * fM2.x + 1.0);
    return fM4.x - fM1.x * rat / (rat + fM3.x);
  }
  if (x > fNodes.y) {
    if (fDisplay.w == 3.0) return fM4.z - max(0.0, fM3.y * pow(max(1.0 - x, 0.0), fM4.y));
    if (fDisplay.w == 0.0) return fM1.y + x * (fM2.y + x * (fM3.y + x * (fM4.y + x * fM5.y)));
    if (fDisplay.w == 1.0) return fM1.y + x * (fM2.y + x * (fM3.y + x * fM4.y));
    float xi = x - fNodes.y;
    float rat = xi * (xi * fM2.y + 1.0);
    return fM4.y + fM1.y * rat / (rat + fM3.y);
  }
  return fM1.z + x * fM2.z;
}
float fToneOne(float v) {
  // A grey source of zero reads +inf upstream, which clamps to 1; dividing by it is undefined here.
  float mapped = v > 0.0 ? (fLog.x > 0.0 ? clamp((log2(v / fLog.x) - fLog.y) / fLog.z, 0.0, 1.0) : 1.0) : 0.0;
  float s = fSpline(mapped);
  return pow(s >= 0.0 ? min(s, fNodes.z) : 0.0, fNodes.w);
}
float fDen(vec3 k, float cs, float sn) {
  return k.x * (0.979381443298969 * cs + 0.391752577319588 * sn)
       + k.y * (0.0206185567010309 * cs + 0.608247422680412 * sn)
       - k.z * (cs + sn);
}
float fClipBlack(vec3 k, float cs, float sn) {
  float den = fDen(k, cs, sn);
  if (den == 0.0) return PTM_F_FLT_MAX;
  float v = -0.427506877216495 * (k.x + 0.856492345150334 * k.y + 0.554995960637719 * k.z) / den;
  return v >= 0.0 ? v : PTM_F_FLT_MAX;
}
float fClipWhiteRaw(vec3 k, float w, float Y, float cs, float sn) {
  float den = fDen(k, cs, sn);
  float t = w * (0.68285981628866 * cs + 0.482137060515464 * sn);
  if (den == 0.0) return PTM_F_FLT_MAX;
  if (Y <= t / den) return PTM_F_FLT_MAX;
  return -0.427506877216495 * (Y * (k.x + 0.856492345150334 * k.y + 0.554995960637719 * k.z) - 0.988237752433297 * w) / (Y * den - t);
}
float fClipWhite(vec3 k, float w, float Y, float cs, float sn) {
  float maxY = PTM_F_Y2006 * w;
  float dY = max(maxY - Y, 0.0);
  float v = dY < 1.0e-3 ? dY / (1.0e-3 * maxY) * fClipWhiteRaw(k, w, (1.0 - 1.0e-3) * maxY, cs, sn) : fClipWhiteRaw(k, w, Y, cs, sn);
  return v >= 0.0 ? v : PTM_F_FLT_MAX;
}
vec3 fRow(mat3 m, int i) {
  return vec3(m[0][i], m[1][i], m[2][i]);
}
vec3 fCheckRgb(vec4 f, float dBlack, float dWhite) {
  vec3 b = fFromYch(f, PTM_F_EXPORT_OUTPUT);
  b += max(-min(b.r, min(b.g, b.b)), 0.0);
  // clamp is undefined for lo > hi, so the bounds go through max and min in the twin's order.
  float Y = min(max((f.x + fToYch(b, PTM_F_EXPORT_INPUT).x) / 2.0, PTM_F_Y2006 * dBlack), PTM_F_Y2006 * dWhite);
  float c = f.y;
  for (int i = 0; i < 3; i++) {
    vec3 k = fRow(PTM_F_EXPORT_OUTPUT, i);
    c = min(c, min(fClipBlack(k, f.z, f.w), fClipWhite(k, dWhite, Y, f.z, f.w)));
  }
  return min(max(fFromYch(vec4(Y, c, f.z, f.w), PTM_F_EXPORT_OUTPUT), 0.0), dWhite);
}`;

export const FILMIC_GLSL = `vec3 pipelineToDisplay(vec3 lin) {
  vec3 compressed = fCompress(ptmSanitise(PTM_F_PIPE * lin));
  vec4 o = fToYch(compressed, PTM_F_PIPE_TO_LMS);
  vec3 t = fInset * compressed;
  vec3 rendered = fOutset * vec3(fToneOne(t.r), fToneOne(t.g), fToneOne(t.b));
  vec4 f = fToYch(rendered, PTM_F_PIPE_TO_LMS);
  float chroma = min(o.y, f.y);
  float beta = fLog.w;
  float rMix = beta * o.y * o.z + (1.0 - beta) * chroma * f.z;
  float gMix = beta * o.y * o.w + (1.0 - beta) * chroma * f.w;
  float n = length(vec2(gMix, rMix));
  vec4 ref = vec4(o.x, o.y, n > 1.0e-9 ? rMix / n : o.z, n > 1.0e-9 ? gMix / n : o.w);
  f = vec4(min(max(f.x, PTM_F_Y2006 * fDisplay.x), PTM_F_Y2006 * fDisplay.y), chroma, ref.z, ref.w);
  float co = ref.y * ref.x;
  float cf = f.y * f.x;
  if (f.x > ref.x && co < cf) cf = (co + cf) / 2.0;
  f.y = f.x > 0.0 ? max(cf / f.x, 0.0) : (cf > 0.0 ? PTM_F_FLT_MAX : 0.0);
  float r = f.y * f.z + 0.21902143;
  float g = f.y * f.w + 0.54371398;
  float maxC = f.y;
  if (r < 0.0) maxC = min(-0.21902143 / f.z, maxC);
  if (g < 0.0) maxC = min(-0.54371398 / f.w, maxC);
  if (r + g > 1.0) maxC = min((1.0 - 0.21902143 - 0.54371398) / (f.z + f.w), maxC);
  f.y = maxC;
  return ptmEncode(fCheckRgb(f, fDisplay.x, fDisplay.y));
}`;
