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
// Ported from darktable src/iop/sigmoid.c, release-5.6.2 (20891f6c6f).
//
// The ranges, labels and defaults are the $MIN/$MAX/$DEFAULT/$DESCRIPTION of
// dt_iop_sigmoid_params_t (sigmoid.c L57-73), with one exception: base
// primaries defaults to Rec2020 where upstream defaults to the working
// profile. darktable's working profile is linear Rec2020 unless the user
// changes it; Safelight's is linear Rec.709, so Rec2020 is what renders
// darktable's default.

import { defaults, type ParamTable, type ParamValues } from "../param-table";

/** sigmoid.c L37: the scene and display middle grey the curve maps onto itself. */
export const MIDDLE_GREY = 0.1845;

export const SIGMOID_PARAMS = {
  middle_grey_contrast: { type: "float", default: 1.5, min: 0.1, max: 10, label: "contrast" },
  contrast_skewness: { type: "float", default: 0, min: -1, max: 1, label: "skew" },
  display_white_target: { type: "float", default: 100, min: 20, max: 1600, label: "target white" },
  display_black_target: { type: "float", default: 0.0152, min: 0, max: 15, label: "target black" },
  color_processing: { type: "int", default: 0, min: 0, max: 1, label: "color processing" },
  hue_preservation: { type: "float", default: 100, min: 0, max: 100, label: "preserve hue" },
  red_inset: { type: "float", default: 0, min: 0, max: 0.99, label: "red attenuation" },
  red_rotation: { type: "float", default: 0, min: -0.4, max: 0.4, label: "red rotation" },
  green_inset: { type: "float", default: 0, min: 0, max: 0.99, label: "green attenuation" },
  green_rotation: { type: "float", default: 0, min: -0.4, max: 0.4, label: "green rotation" },
  blue_inset: { type: "float", default: 0, min: 0, max: 0.99, label: "blue attenuation" },
  blue_rotation: { type: "float", default: 0, min: -0.4, max: 0.4, label: "blue rotation" },
  purity: { type: "float", default: 0, min: 0, max: 1, label: "recover purity" },
  base_primaries: { type: "int", default: 1, min: 0, max: 4, label: "base primaries" },
} as const satisfies ParamTable;

export type SigmoidParams = ParamValues<typeof SIGMOID_PARAMS>;

export const SIGMOID_DEFAULTS: SigmoidParams = defaults(SIGMOID_PARAMS);

/** color_processing values (dt_iop_sigmoid_methods_type_t, L40-44). */
export const SIGMOID_METHODS = ["per channel", "RGB ratio"] as const;
export const PER_CHANNEL = 0;

/** base_primaries values, in the combobox order (dt_iop_sigmoid_base_primaries_t, L47-54). */
export const SIGMOID_BASE_PRIMARIES = ["working profile", "Rec2020", "Display P3", "Adobe RGB (compatible)", "sRGB"] as const;
