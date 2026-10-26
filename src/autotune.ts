// This file is part of darktable,
// Copyright (C) 2025-2026 darktable developers.
// portions Copyright (C) 2019-2020, 2022 Aldric Renaudin; 2019-2026 Aurélien PIERRE; 2019 Diederik ter Rahe; 2019-2022 Pascal Obry; 2019 Tobias Ellinghaus; 2020-2021 Chris Elston; 2020-2022 Diederik Ter Rahe; 2020 Heiko Bauke; 2020-2021 Hubert Kowalski; 2020 Jeronimo Pellegrini; 2020 Marco Carrarini; 2020 Mark-64; 2020 Martin Burri; 2020-2021 Ralf Brown; 2020-2021 rawfiner; 2021 Dan Torop; 2021 Fabio Heer; 2021 lhietal; 2021 luzpaz; 2021 paolodepetrillo; 2021-2022 Sakari Kapanen; 2021 Victor Forsiuk; 2022 Hanno Schwalm; 2022 Martin Bařinka; 2022 Nicolas Auffray; 2022 Philipp Lutz; 2023 Alban Gruin; 2023-2024 Alynx Zhou; 2023 Luca Zulberti; 2025 Guillaume Stutin (src/iop/filmicrgb.c)
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
// Transcribes darktable's AgX _apply_auto_tune_exposure and
// _adjust_relative_exposure_from_exposure_params (agx.c L1042-1168),
// release-5.6.2, and Ansel's filmic rgb apply_autotune (filmicrgb.c
// L3535-3572), 2fadf8a366. It runs in doubles where upstream runs in floats,
// over statistics of the whole captured frame where upstream's pickers
// measure an area of the module's input.
//
// AgX's clamps are darktable's CLAMPF, which sends NaN to the low bound
// (clampf below). filmic's are glib's CLAMP, which lets NaN through, as
// curve-math's clamp does; log2 of a negative norm is NaN there, so
// filmicAutoTune spells out where each end lands. frameStats keeps every
// statistic finite.

import type { AgxParams } from "./agx/params";
import type { Vec3 } from "./colour/mat3";
import { clamp } from "./curve-math";
import { filmicPower } from "./filmic/derive";
import { FILMIC_PARAMS, type FilmicParams } from "./filmic/params";
import { agxPivotEv, agxPivotX } from "./panel/model";
import { withinRange } from "./param-table";
import type { FloatFrame, SafelightAPI } from "./safelight";

export interface FrameStats {
  min: Vec3;
  max: Vec3;
  mean: Vec3;
}

/** Per-channel minimum, maximum and mean over a frame's pixels whose three
 *  channels are all finite; null when there is none. */
export function frameStats(frame: Pick<FloatFrame, "data" | "width" | "height">): FrameStats | null {
  const { data } = frame;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const sum = [0, 0, 0];
  let n = 0;
  for (let i = 0; i < frame.width * frame.height; i++) {
    const o = i * 4;
    if (!Number.isFinite(data[o]) || !Number.isFinite(data[o + 1]) || !Number.isFinite(data[o + 2])) continue;
    for (let c = 0; c < 3; c++) {
      const v = data[o + c];
      if (v < min[c]) min[c] = v;
      if (v > max[c]) max[c] = v;
      sum[c] += v;
    }
    n++;
  }
  if (n === 0) return null;
  return { min: [min[0], min[1], min[2]], max: [max[0], max[1], max[2]], mean: [sum[0] / n, sum[1] / n, sum[2] / n] };
}

const EPSILON = 1e-6;

// CLAMPF (math.h L80).
const clampf = (x: number, lo: number, hi: number): number => (x >= lo ? (x <= hi ? x : hi) : lo);

// The new ends, with the pivot kept at its EV as darktable's picker callback
// does after any picker (_update_pivot_x, L2675).
function agxRange(p: AgxParams, black: number, white: number): Partial<AgxParams> {
  return { range_black_relative_ev: black, range_white_relative_ev: white, curve_pivot_x: agxPivotX({ black, white }, agxPivotEv(p)) };
}

/** The "auto tune levels" picker: black from the smallest channel of the
 *  minimum and white from the largest channel of the maximum, in EV from
 *  mid-grey, scaled by dynamic range scaling. A norm at or below zero takes
 *  darktable's 1e-6 floor. */
export function agxAutoTune(p: AgxParams, s: FrameStats): Partial<AgxParams> {
  const k = 1 + p.dynamic_range_scaling;
  const black = clampf(Math.log2(Math.max(EPSILON, Math.min(...s.min)) / 0.18) * k, -20, -0.1);
  const white = clampf(Math.log2(Math.max(EPSILON, Math.max(...s.max)) / 0.18) * k, 0.1, 20);
  return agxRange(p, black, white);
}

/** darktable's "read exposure" with Safelight's Exposure slider as the
 *  effective exposure. */
export function agxReadExposure(p: AgxParams, exposure: number): Partial<AgxParams> {
  const k = 1 + p.dynamic_range_scaling;
  const black = clampf((-8 + 0.5 * exposure) * k, -20, -0.1);
  const white = clampf((4 + 0.8 * exposure) * k, 0.1, 20);
  return agxRange(p, black, white);
}

/** Ansel's auto tune: the grey too with a custom grey, then the ends and the
 *  hardness that puts grey on the identity line. The ends are held to their
 *  hard range first, as the panel stores them, so the hardness is the one of
 *  the ends that render; it is returned unclamped, for withinRange to hold.
 *  Not for filmicEdit: that would shift the ends again by the grey it sets. */
export function filmicAutoTune(p: FilmicParams, s: FrameStats): Partial<FilmicParams> {
  const out: Partial<FilmicParams> = {};
  // The MAX_RGB norm, Ansel's default preserve_color (the v8 path ignores it).
  if (p.custom_grey) out.grey_point_source = clamp((100 * Math.max(...s.mean)) / 2, 0.001, 100);
  // Without a custom grey this is the stored grey the panel hides, not 18.45 %, as Ansel measures against it.
  const grey = (out.grey_point_source ?? p.grey_point_source) / 100;
  const k = 1 + p.security_factor / 100;
  // log2 of a white of 0 is -inf, which CLAMP takes to the floor of 1. A
  // negative white is NaN there and Ansel stores it; the floor stands in,
  // since withinRange would drop a NaN and leave the old white.
  const evMax = clamp(Math.log2(Math.max(...s.max) / grey), 1, 16);
  const white = (Number.isNaN(evMax) ? 1 : evMax) * k;
  // A black of 0 clamps to -16 and is then scaled; a negative black is NaN,
  // CLAMP lets it through, and fmaxf(NaN, -16) answers -16 unscaled.
  const evMin = clamp(Math.log2(Math.max(...s.min) / grey), -16, -1) * k;
  const black = Number.isNaN(evMin) ? -16 : Math.max(evMin, -16);
  const held = { ...p, ...withinRange(FILMIC_PARAMS, { black_point_source: black, white_point_source: white }) };
  return {
    ...out,
    black_point_source: held.black_point_source,
    white_point_source: held.white_point_source,
    output_power: filmicPower({ ...held, auto_hardness: true }),
  };
}

export const SCENE_SPACE = { encoding: "linear", primaries: "rec2020" } as const;

/** Statistics of the scene the display transform receives, over what the
 *  view shows, in linear Rec.2020 (the pipe both upstreams measure in). */
export async function measureScene(host: SafelightAPI): Promise<FrameStats | "unsupported" | "no frame"> {
  if (!host.develop.captureFloatFrame) return "unsupported";
  const params = host.stores.useDevelopStore.getState().params;
  const frame = await host.develop.captureFloatFrame(params, { point: "scene", space: SCENE_SPACE });
  if (!frame) return "no frame";
  // The frame names its point; any other is not the scene.
  if (frame.point !== "scene") return "unsupported";
  return frameStats(frame) ?? "no frame";
}
