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
// Ported from darktable src/iop/agx.c, release-5.6.2 (20891f6c6f).
//
// The ranges and labels are the $MIN/$MAX/$DESCRIPTION of dt_iop_agx_params_t
// (agx.c L97-155). The defaults are darktable's scene-referred ones: the
// default curve and look (_set_default_curve_and_look_params, L2485-2513) with
// the blender-like primaries (_set_blenderlike_primaries, L317-345), which is
// what a new instance gets in a scene-referred workflow (reload_defaults).

import { defaults, type ParamTable, type ParamValues } from "../param-table";

export const AGX_PARAMS = {
  look_lift: { type: "float", default: 0, min: -1, max: 1, label: "lift" },
  look_slope: { type: "float", default: 1, min: 0, max: 10, label: "slope" },
  look_brightness: { type: "float", default: 1, min: 0, max: 100, label: "brightness" },
  look_saturation: { type: "float", default: 1, min: 0, max: 10, label: "saturation" },
  look_original_hue_mix_ratio: { type: "float", default: 0.6, min: 0, max: 1, label: "preserve hue" },
  range_black_relative_ev: { type: "float", default: -10, min: -20, max: -0.1, label: "black relative exposure" },
  range_white_relative_ev: { type: "float", default: 6.5, min: 0.1, max: 20, label: "white relative exposure" },
  dynamic_range_scaling: { type: "float", default: 0.1, min: -0.5, max: 2, label: "dynamic range scaling" },
  curve_pivot_x: { type: "float", default: 10 / 16.5, min: 0, max: 1, label: "pivot relative exposure" },
  curve_pivot_y_linear_output: { type: "float", default: 0.18, min: 0, max: 1, label: "pivot target output" },
  curve_contrast_around_pivot: { type: "float", default: 3.0, min: 0.1, max: 10, label: "contrast" },
  curve_linear_ratio_below_pivot: { type: "float", default: 0, min: 0, max: 1, label: "toe start" },
  curve_linear_ratio_above_pivot: { type: "float", default: 0, min: 0, max: 1, label: "shoulder start" },
  curve_toe_power: { type: "float", default: 1.5, min: 0, max: 10, label: "toe power" },
  curve_shoulder_power: { type: "float", default: 3.3, min: 0, max: 10, label: "shoulder power" },
  curve_gamma: { type: "float", default: 2.2, min: 0.01, max: 100, label: "curve y gamma" },
  auto_gamma: { type: "bool", default: false, label: "keep the pivot on the diagonal" },
  curve_target_display_black_ratio: { type: "float", default: 0, min: 0, max: 0.15, label: "target black" },
  curve_target_display_white_ratio: { type: "float", default: 1, min: 0.2, max: 1, label: "target white" },
  base_primaries: { type: "int", default: 2, min: 0, max: 5, label: "base primaries" },
  disable_primaries_adjustments: { type: "bool", default: false, label: "disable adjustments" },
  red_inset: { type: "float", default: 0.29462451, min: 0, max: 0.99, label: "red attenuation" },
  red_rotation: { type: "float", default: 0.03540329, min: -0.5236, max: 0.5236, label: "red rotation" },
  green_inset: { type: "float", default: 0.25861925, min: 0, max: 0.99, label: "green attenuation" },
  green_rotation: { type: "float", default: -0.02108586, min: -0.5236, max: 0.5236, label: "green rotation" },
  blue_inset: { type: "float", default: 0.14641371, min: 0, max: 0.99, label: "blue attenuation" },
  blue_rotation: { type: "float", default: -0.06305724, min: -0.5236, max: 0.5236, label: "blue rotation" },
  master_outset_ratio: { type: "float", default: 1, min: 0, max: 2, label: "master purity boost" },
  master_unrotation_ratio: { type: "float", default: 0, min: 0, max: 2, label: "master rotation reversal" },
  red_outset: { type: "float", default: 0.290776401758, min: 0, max: 0.99, label: "red purity boost" },
  red_unrotation: { type: "float", default: 0.03540329, min: -0.5236, max: 0.5236, label: "red reverse rotation" },
  green_outset: { type: "float", default: 0.263155400753, min: 0, max: 0.99, label: "green purity boost" },
  green_unrotation: { type: "float", default: -0.02108586, min: -0.5236, max: 0.5236, label: "green reverse rotation" },
  blue_outset: { type: "float", default: 0.045810721815, min: 0, max: 0.99, label: "blue purity boost" },
  blue_unrotation: { type: "float", default: -0.06305724, min: -0.5236, max: 0.5236, label: "blue reverse rotation" },
  completely_reverse_primaries: { type: "bool", default: false, label: "reverse all" },
} as const satisfies ParamTable;

export type AgxParams = ParamValues<typeof AGX_PARAMS>;

export const AGX_DEFAULTS: AgxParams = defaults(AGX_PARAMS);

/** base_primaries values, in the combobox order (dt_iop_agx_base_primaries_t, L87-95). */
export const AGX_BASE_PRIMARIES = ["export profile", "working profile", "Rec2020", "Display P3", "Adobe RGB (compatible)", "sRGB"] as const;
