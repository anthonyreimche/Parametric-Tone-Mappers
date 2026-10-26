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

// filmic's fixed matrices for Safelight: the v8 bracket was fitted in linear
// Rec2020 (Ref §3.1), so the pipe is Rec2020, and the gamut mapper's export
// profile is sRGB, Ansel's default output profile. filmic_v4_prepare_matrices
// (filmicrgb.c L2033-2063) builds the same products per process().

import { mul, row } from "../colour/mat3";
import { REC2020, REC709_TO_REC2020, SRGB } from "../colour/profiles";
import { LMS_2006_TO_XYZ_D65, XYZ_D50_TO_D65_CAT16, XYZ_D65_TO_D50_CAT16, XYZ_D65_TO_LMS_2006 } from "../colour/yrg";

export const FILMIC_PIPE = REC709_TO_REC2020;
export const PIPE_TO_LMS = mul(XYZ_D65_TO_LMS_2006, mul(XYZ_D50_TO_D65_CAT16, REC2020.toXyz));
export const EXPORT_INPUT = mul(XYZ_D65_TO_LMS_2006, mul(XYZ_D50_TO_D65_CAT16, SRGB.toXyz));
export const EXPORT_OUTPUT = mul(SRGB.fromXyz, mul(XYZ_D65_TO_D50_CAT16, LMS_2006_TO_XYZ_D65));
export const PIPE_LUMA = row(REC2020.toXyz, 1);
