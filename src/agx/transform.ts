// Parametric Tone Mappers, a Safelight extension. GPL-3.0-or-later. See LICENSE.

import { declarations, readParams, uniformDeclarations } from "../param-table";
import type { PipelineContribution } from "../safelight";
import { AGX_UNIFORM_TYPES, deriveAgx, type AgxUniforms } from "./derive";
import { AGX_GLSL, AGX_HELPERS } from "./glsl";
import { AGX_DEFAULTS, AGX_PARAMS } from "./params";

export const AGX_ID = "parametric-tonemappers.agx";

/** The uniforms of darktable's scene-referred defaults: what a photo renders
 *  with if derive's results are ever missing. */
export const AGX_DEFAULT_UNIFORMS: AgxUniforms = deriveAgx(AGX_DEFAULTS);

export function agxTransform(): PipelineContribution {
  return {
    id: AGX_ID,
    name: "AgX (parametric)",
    description:
      "AgX: a log encoding over a white and black exposure range, a contrast curve with tunable toe and shoulder, and primaries rotated and attenuated around it so bright colours bleach to white.",
    glsl: AGX_GLSL,
    helpers: AGX_HELPERS,
    skipBaseCurve: true,
    skipToneShoulder: true,
    params: declarations(AGX_PARAMS),
    derive: {
      uniforms: uniformDeclarations(AGX_UNIFORM_TYPES, AGX_DEFAULT_UNIFORMS),
      fn: (values) => deriveAgx(readParams(AGX_PARAMS, values)),
    },
  };
}
