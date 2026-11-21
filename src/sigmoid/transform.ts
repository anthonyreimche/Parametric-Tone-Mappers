// Parametric Tone Mappers, a Safelight extension. GPL-3.0-or-later. See LICENSE.

import { declarations, readParams, uniformDeclarations } from "../param-table";
import type { PipelineContribution } from "../safelight";
import { SIGMOID_UNIFORM_TYPES, deriveSigmoid, type SigmoidUniforms } from "./derive";
import { SIGMOID_GLSL, SIGMOID_HELPERS } from "./glsl";
import { SIGMOID_DEFAULTS, SIGMOID_PARAMS } from "./params";

export const SIGMOID_ID = "parametric-tonemappers.sigmoid";

/** The uniforms of the defaults: what a photo renders with if derive's results are ever missing. */
export const SIGMOID_DEFAULT_UNIFORMS: SigmoidUniforms = deriveSigmoid(SIGMOID_DEFAULTS);

export function sigmoidTransform(): PipelineContribution {
  return {
    id: SIGMOID_ID,
    name: "Sigmoid (parametric)",
    description:
      "Sigmoid: a smooth log-logistic curve between a display black and white, with contrast and skew, applied per channel with hue preservation and adjustable primaries, or to RGB ratios.",
    glsl: SIGMOID_GLSL,
    helpers: SIGMOID_HELPERS,
    skipBaseCurve: true,
    skipToneShoulder: true,
    params: declarations(SIGMOID_PARAMS),
    derive: {
      uniforms: uniformDeclarations(SIGMOID_UNIFORM_TYPES, SIGMOID_DEFAULT_UNIFORMS),
      fn: (values) => deriveSigmoid(readParams(SIGMOID_PARAMS, values)),
    },
  };
}
