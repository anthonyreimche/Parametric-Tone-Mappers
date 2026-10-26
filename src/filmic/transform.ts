// Parametric Tone Mappers, a Safelight extension. GPL-3.0-or-later. See LICENSE.

import { declarations, readParams, uniformDeclarations } from "../param-table";
import type { PipelineContribution } from "../safelight";
import { FILMIC_UNIFORM_TYPES, deriveFilmic, type FilmicUniforms } from "./derive";
import { FILMIC_GLSL, FILMIC_HELPERS } from "./glsl";
import { FILMIC_DEFAULTS, FILMIC_PARAMS } from "./params";

export const FILMIC_ID = "parametric-tonemappers.filmic";

/** The uniforms of the raw-file defaults: what a photo renders with if
 *  derive's results are ever missing. */
export const FILMIC_DEFAULT_UNIFORMS: FilmicUniforms = deriveFilmic(FILMIC_DEFAULTS);

export function filmicTransform(): PipelineContribution {
  return {
    id: FILMIC_ID,
    name: "Filmic RGB (parametric)",
    description:
      "Filmic RGB, colour science v8: a log encoding over a white and black exposure range, an S curve with latitude and a perceptual toe and shoulder, rendered per channel inside a bracket of displaced primaries so bright colours bleach toward white, then gamut-mapped into sRGB.",
    glsl: FILMIC_GLSL,
    helpers: FILMIC_HELPERS,
    skipBaseCurve: true,
    skipToneShoulder: true,
    params: declarations(FILMIC_PARAMS),
    derive: {
      uniforms: uniformDeclarations(FILMIC_UNIFORM_TYPES, FILMIC_DEFAULT_UNIFORMS),
      fn: (values) => deriveFilmic(readParams(FILMIC_PARAMS, values)),
    },
  };
}
