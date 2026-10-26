// This file is part of darktable,
// Copyright (C) 2025-2026 darktable developers.
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
// Transcribes init_presets and its setters (agx.c L317-398, L2485-2654),
// release-5.6.2: the three primaries sets and the six presets that are always
// created. The "scene-referred default" preset only exists in darktable under
// the AgX workflow and equals this extension's defaults.

import { AGX_DEFAULTS, type AgxParams } from "../agx/params";

const deg = (d: number): number => (d * Math.PI) / 180;

/** _set_default_curve_and_look_params: the base of every preset. */
const CURVE_AND_LOOK: Partial<AgxParams> = {
  look_slope: 1, look_brightness: 1, look_lift: 0, look_saturation: 1, look_original_hue_mix_ratio: 0.6,
  range_black_relative_ev: -10, range_white_relative_ev: 6.5, dynamic_range_scaling: 0.1,
  curve_contrast_around_pivot: 3.0, curve_linear_ratio_below_pivot: 0, curve_linear_ratio_above_pivot: 0,
  curve_toe_power: 1.5, curve_shoulder_power: 3.3,
  curve_target_display_black_ratio: 0, curve_target_display_white_ratio: 1,
  auto_gamma: false, curve_gamma: 2.2, curve_pivot_x: 10 / 16.5, curve_pivot_y_linear_output: 0.18,
};

const PLAIN: Partial<AgxParams> = { disable_primaries_adjustments: false, completely_reverse_primaries: false };

/** _set_blenderlike_primaries ("classic" here), _set_smooth_primaries and
 *  _set_unmodified_primaries. Each sets every primaries field, so spreading
 *  one over another replaces the whole set. */
export const AGX_PRIMARIES: Readonly<Record<"classic" | "smooth" | "unmodified", Partial<AgxParams>>> = {
  classic: {
    ...PLAIN, base_primaries: 2,
    red_inset: 0.29462451, green_inset: 0.25861925, blue_inset: 0.14641371,
    red_rotation: 0.03540329, green_rotation: -0.02108586, blue_rotation: -0.06305724,
    master_outset_ratio: 1, master_unrotation_ratio: 0,
    red_outset: 0.290776401758, green_outset: 0.263155400753, blue_outset: 0.045810721815,
    red_unrotation: 0.03540329, green_unrotation: -0.02108586, blue_unrotation: -0.06305724,
  },
  smooth: {
    ...PLAIN, base_primaries: 1,
    red_inset: 0.1, green_inset: 0.1, blue_inset: 0.15,
    red_rotation: deg(2), green_rotation: deg(-1), blue_rotation: deg(-3),
    master_outset_ratio: 0, master_unrotation_ratio: 1,
    red_outset: 0.1, green_outset: 0.1, blue_outset: 0.15,
    red_unrotation: deg(2), green_unrotation: deg(-1), blue_unrotation: deg(-3),
  },
  unmodified: {
    ...PLAIN, base_primaries: 2,
    red_inset: 0, green_inset: 0, blue_inset: 0, red_rotation: 0, green_rotation: 0, blue_rotation: 0,
    master_outset_ratio: 1, master_unrotation_ratio: 1,
    red_outset: 0, green_outset: 0, blue_outset: 0, red_unrotation: 0, green_unrotation: 0, blue_unrotation: 0,
  },
};

const pivotY = (gamma: number): number => Math.pow(0.18, 1 / gamma);

// _calculate_slope_gamma_compensation(2.4, 0.18^(1/2.4)) at the default
// pivot output of 0.18, whose target ratios (0 and 1) leave the clamp in
// _calculate_pivot_y_at_gamma idle. darktable multiplies Blender's slope of
// 2.4 by it, so the compensation at render time lands on 2.4.
const BLENDER_CONTRAST = 2.4 * ((2.4 * Math.pow(pivotY(2.4), 1.4)) / (2.2 * Math.pow(pivotY(2.2), 1.2)));

const make = (...parts: Partial<AgxParams>[]): AgxParams =>
  parts.reduce<AgxParams>((acc, part) => ({ ...acc, ...part }), { ...AGX_DEFAULTS, ...CURVE_AND_LOOK });

const classicBase = make(AGX_PRIMARIES.classic, {
  curve_shoulder_power: 1.5, curve_toe_power: 1.5, curve_gamma: 2.4, curve_contrast_around_pivot: BLENDER_CONTRAST,
});

const sigmoidDefault = make(AGX_PRIMARIES.classic, {
  look_original_hue_mix_ratio: 1, curve_contrast_around_pivot: 3.07, curve_toe_power: 1.4, curve_shoulder_power: 3.71,
});

export const AGX_PRESETS: readonly { name: string; params: AgxParams }[] = [
  { name: "unmodified base primaries", params: make(AGX_PRIMARIES.unmodified) },
  { name: "classic | base", params: classicBase },
  { name: "classic | punchy", params: { ...classicBase, look_brightness: 1 / 1.35 ** 2, look_lift: 0, look_saturation: 1.4 } },
  { name: "sigmoid-like | default", params: sigmoidDefault },
  {
    name: "sigmoid-like | smooth",
    params: {
      ...sigmoidDefault, ...AGX_PRIMARIES.smooth,
      look_original_hue_mix_ratio: 0, curve_contrast_around_pivot: 2.98, curve_toe_power: 1.61, curve_shoulder_power: 3.02,
    },
  },
  { name: "smooth", params: make(AGX_PRIMARIES.smooth) },
];
