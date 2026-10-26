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
// Ported from Ansel src/iop/filmicrgb.c, master 2fadf8a366.
//
// The ranges and labels are the $MIN/$MAX/$DESCRIPTION of
// dt_iop_filmicrgb_params_t (filmicrgb.c L243-274), for the 17 fields the
// tone mapping reads. The defaults are a new instance's, with the raw-file
// formula of reload_defaults (L4222-4254) evaluated at Safelight's default
// Exposure.

import { defaults, type ParamTable, type ParamValues } from "../param-table";

// Ansel's raw defaults: white = E + 2.45, black = white - 12, with E the
// exposure the photo starts from (Ansel's applied 0.7 - bias; Safelight's
// default Exposure, 0). Hardness then puts grey on the identity line.
const WHITE = 2.45;
const BLACK = WHITE - 12;
const POWER = Math.log(0.1845) / Math.log(-BLACK / (WHITE - BLACK));

export const FILMIC_PARAMS = {
  grey_point_source: { type: "float", default: 18.45, min: 0, max: 100, label: "middle gray luminance" },
  black_point_source: { type: "float", default: BLACK, min: -16, max: -0.1, label: "black relative exposure" },
  white_point_source: { type: "float", default: WHITE, min: 0.1, max: 16, label: "white relative exposure" },
  security_factor: { type: "float", default: 0, min: -50, max: 200, label: "dynamic range scaling" },
  grey_point_target: { type: "float", default: 18.45, min: 1, max: 50, label: "target middle gray" },
  black_point_target: { type: "float", default: 0.01517634, min: 0, max: 20, label: "target black luminance" },
  white_point_target: { type: "float", default: 100, min: 0, max: 1600, label: "target white luminance" },
  output_power: { type: "float", default: POWER, min: 1, max: 10, label: "hardness" },
  latitude: { type: "float", default: 10, min: 0.01, max: 99, label: "latitude" },
  contrast: { type: "float", default: 1.18, min: 0, max: 5, label: "contrast" },
  saturation: { type: "float", default: 0, min: -200, max: 200, label: "color preservation" },
  balance: { type: "float", default: 0, min: -50, max: 50, label: "shadows ↔ highlights balance" },
  version: { type: "int", default: 7, min: 5, max: 9, label: "color science" },
  auto_hardness: { type: "bool", default: true, label: "auto adjust hardness" },
  custom_grey: { type: "bool", default: false, label: "use custom middle-gray values" },
  shadows: { type: "int", default: 3, min: 0, max: 3, label: "contrast in shadows" },
  highlights: { type: "int", default: 3, min: 0, max: 3, label: "contrast in highlights" },
} as const satisfies ParamTable;

export type FilmicParams = ParamValues<typeof FILMIC_PARAMS>;

export const FILMIC_DEFAULTS: FilmicParams = defaults(FILMIC_PARAMS);

/** version values 5-9 (dt_iop_filmicrgb_colorscience_type_t, L170-182). */
export const FILMIC_VERSIONS: Readonly<Record<number, string>> = {
  5: "v8 (AgX, no bleach)",
  6: "v8 (AgX, low bleach)",
  7: "v8 (AgX, medium bleach)",
  8: "v8 (AgX, high bleach)",
  9: "v8 (AgX, extra bleach)",
};

/** shadows/highlights values (dt_iop_filmicrgb_curve_type_t, L157-167). */
export const FILMIC_CURVES = ["hard", "soft", "safe", "perceptual"] as const;
export const CURVE_POLY_4 = 0;
export const CURVE_POLY_3 = 1;
export const CURVE_RATIONAL = 2;
export const CURVE_SIGMOID = 3;
