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
// Transcribes commit_params (sigmoid.c L318-392) with
// _generalized_loglogistic_sigmoid (L299-316), _calculate_adjusted_primaries
// (L394-468) and _get_base_profile (L470-492), release-5.6.2.
//
// commit_params runs in float arithmetic here, as in darktable: its slope is a
// finite difference over 2e-6 at middle grey, where a float's spacing makes
// darktable's default contrast of 1.5 render as a film power of 1.4909. Each
// operation is rounded to float, so the curve is the one darktable draws.
// The matrices run in doubles where darktable runs in floats.

import { columnMajor, IDENTITY, invert, mul, mustInvert, type Mat3, type Vec3 } from "../colour/mat3";
import { ADOBE_RGB, DISPLAY_P3, REC2020, SRGB, type Profile } from "../colour/profiles";
import { matrixFromPrimaries, rotateAndScalePrimary } from "../agx/derive";
import type { GlslType } from "../safelight";
import { MIDDLE_GREY, type SigmoidParams } from "./params";

const f = Math.fround;
const powf = (a: number, b: number): number => f(Math.pow(f(a), f(b)));
const fmaxf = (a: number, b: number): number => (Number.isNaN(a) ? b : Number.isNaN(b) ? a : Math.max(a, b));
const fminf = (a: number, b: number): number => (Number.isNaN(a) ? b : Number.isNaN(b) ? a : Math.min(a, b));

/** The curve's constants: commit_params's module data. */
export interface SigmoidCurve {
  whiteTarget: number;
  paperExposure: number;
  filmFog: number;
  filmPower: number;
  paperPower: number;
}

export interface SigmoidData extends SigmoidCurve {
  blackTarget: number;
  huePreservation: number;
}

// _generalized_loglogistic_sigmoid in floats, for commit_params's slopes.
function loglogisticF(value: number, magnitude: number, paperExp: number, filmFog: number, filmPower: number, paperPower: number): number {
  const clamped = f(fmaxf(value, 0));
  const film = powf(f(filmFog + clamped), filmPower);
  const paper = f(magnitude * powf(f(film / f(paperExp + film)), paperPower));
  return Number.isNaN(paper) ? magnitude : paper;
}

const slopeAtGrey = (magnitude: number, paperExp: number, filmFog: number, filmPower: number, paperPower: number): number => {
  const grey = f(MIDDLE_GREY);
  const delta = f(1e-6);
  const up = loglogisticF(f(grey + delta), magnitude, paperExp, filmFog, filmPower, paperPower);
  const down = loglogisticF(f(grey - delta), magnitude, paperExp, filmFog, filmPower, paperPower);
  return f(f(f(up - down) / 2) / delta);
};

/** commit_params: the skewed log-logistic curve with f(0) = target black,
 *  f(grey) = grey, f(inf) = target white, and a slope at grey set by contrast alone. */
export function sigmoidData(p: SigmoidParams): SigmoidData {
  const grey = f(MIDDLE_GREY);
  const hundredth = f(0.01);

  const refFilmPower = f(p.middle_grey_contrast);
  const refPaperExposure = f(powf(f(0 + grey), refFilmPower) * f(f(1 / grey) - 1));
  const refSlope = slopeAtGrey(1, refPaperExposure, 0, refFilmPower, 1);

  const paperPower = powf(5, f(-f(p.contrast_skewness)));

  const tempWhiteTarget = f(hundredth * f(p.display_white_target));
  const tempWhiteGrey = f(powf(f(tempWhiteTarget / grey), f(1 / paperPower)) - 1);
  const tempPaperExposure = f(powf(grey, 1) * tempWhiteGrey);
  const tempSlope = slopeAtGrey(tempWhiteTarget, tempPaperExposure, 0, 1, paperPower);

  const filmPower = f(refSlope / tempSlope);

  const whiteTarget = f(hundredth * f(p.display_white_target));
  const blackTarget = f(hundredth * f(p.display_black_target));
  const whiteGrey = f(powf(f(whiteTarget / grey), f(1 / paperPower)) - 1);
  const whiteBlack = f(powf(f(blackTarget / whiteTarget), f(-1 / paperPower)) - 1);
  const invFilm = f(1 / filmPower);
  const filmFog = f(f(grey * powf(whiteGrey, invFilm)) / f(powf(whiteBlack, invFilm) - powf(whiteGrey, invFilm)));
  const paperExposure = f(powf(f(filmFog + grey), filmPower) * whiteGrey);

  return {
    whiteTarget,
    blackTarget,
    paperExposure,
    filmFog,
    filmPower,
    paperPower,
    huePreservation: fminf(fmaxf(f(hundredth * f(p.hue_preservation)), 0), 1),
  };
}

/** _get_base_profile. 0 (working profile) is Safelight's working space,
 *  linear Rec.709 (the sRGB profile), from process version 2; version 1, and
 *  params without a version, keep it as Rec2020, darktable's default working
 *  space, as AgX does. */
export function sigmoidBaseProfile(index: number, processVersion?: number): Profile {
  if (index === 1) return REC2020;
  if (index === 2) return DISPLAY_P3;
  if (index === 3) return ADOBE_RGB;
  if (index === 4) return SRGB;
  return (processVersion ?? 1) >= 2 ? SRGB : REC2020;
}

export interface SigmoidMatrices {
  pipeToBase: Mat3;
  baseToRendering: Mat3;
  renderingToPipe: Mat3;
}

const displaced = (base: Profile, scaling: (i: number) => number, rotation: Vec3): Mat3 | null =>
  matrixFromPrimaries(
    [
      rotateAndScalePrimary(base, scaling(0), rotation[0], 0),
      rotateAndScalePrimary(base, scaling(1), rotation[1], 1),
      rotateAndScalePrimary(base, scaling(2), rotation[2], 2),
    ],
    base.white,
  );

function adjusted(base: Profile, pipeToBase: Mat3, inset: Vec3, rotation: Vec3, purity: number): SigmoidMatrices | null {
  const toXyz = displaced(base, (i) => 1 - inset[i], rotation);
  const restoredToXyz = displaced(base, (i) => 1 - purity * inset[i], rotation);
  const renderingToBase = restoredToXyz && invert(mul(base.fromXyz, restoredToXyz));
  if (!toXyz || !renderingToBase) return null;
  return {
    pipeToBase,
    baseToRendering: mul(base.fromXyz, toXyz),
    renderingToPipe: mul(mustInvert(pipeToBase), renderingToBase),
  };
}

/** The pipe is Safelight's working space, linear Rec.709; pipeToBase carries
 *  the conversion darktable's pipe needs only where the base isn't the working
 *  profile, and is exactly the identity where it is (as darktable makes it).
 *  Displaced primaries with a singular matrix render as the unmodified ones. */
export function sigmoidMatrices(p: SigmoidParams, processVersion?: number): SigmoidMatrices {
  const base = sigmoidBaseProfile(p.base_primaries, processVersion);
  const pipeToBase = base === SRGB ? IDENTITY : mul(base.fromXyz, SRGB.toXyz);
  const m =
    adjusted(base, pipeToBase, [p.red_inset, p.green_inset, p.blue_inset], [p.red_rotation, p.green_rotation, p.blue_rotation], p.purity) ??
    adjusted(base, pipeToBase, [0, 0, 0], [0, 0, 0], 0);
  // A profile's own primaries are never singular.
  if (!m) throw new Error("singular colour matrix");
  return m;
}

export const SIGMOID_UNIFORM_TYPES = {
  sgPipeToBase: "mat3",
  sgBaseToRendering: "mat3",
  sgRenderingToPipe: "mat3",
  sgPipeToBaseV1: "mat3",
  sgBaseToRenderingV1: "mat3",
  sgRenderingToPipeV1: "mat3",
  sgCurve: "vec4",
  sgShape: "vec4",
} as const satisfies Readonly<Record<string, GlslType>>;

export type SigmoidUniforms = Record<keyof typeof SIGMOID_UNIFORM_TYPES, number[]>;

/** Every uniform the Sigmoid GLSL reads, matrices column-major. derive.fn
 *  isn't told the photo's process version, so the matrices come twice: as
 *  version 2 and later draw them, and with the V1 suffix as version 1 does.
 *  Packing: sgCurve (white target, paper exposure, film fog, film power),
 *  sgShape (paper power, black target, hue preservation, colour processing). */
export function deriveSigmoid(p: SigmoidParams): SigmoidUniforms {
  const d = sigmoidData(p);
  const m = sigmoidMatrices(p, 2);
  const v1 = sigmoidMatrices(p, 1);
  return {
    sgPipeToBase: columnMajor(m.pipeToBase),
    sgBaseToRendering: columnMajor(m.baseToRendering),
    sgRenderingToPipe: columnMajor(m.renderingToPipe),
    sgPipeToBaseV1: columnMajor(v1.pipeToBase),
    sgBaseToRenderingV1: columnMajor(v1.baseToRendering),
    sgRenderingToPipeV1: columnMajor(v1.renderingToPipe),
    sgCurve: [d.whiteTarget, d.paperExposure, d.filmFog, d.filmPower],
    sgShape: [d.paperPower, d.blackTarget, d.huePreservation, p.color_processing],
  };
}

/** The curve constants deriveSigmoid packed. */
export const curveOf = (u: SigmoidUniforms): SigmoidCurve => ({
  whiteTarget: u.sgCurve[0],
  paperExposure: u.sgCurve[1],
  filmFog: u.sgCurve[2],
  filmPower: u.sgCurve[3],
  paperPower: u.sgShape[0],
});
