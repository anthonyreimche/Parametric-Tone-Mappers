import { describe, expect, it } from "vitest";
import { activate } from "../src/index";
import { resetActive } from "../src/panel/Panel";
import type { GlslType, PipelineContribution } from "../src/safelight";
import { fakeApi } from "./support/fake-api";

const registered = (): PipelineContribution[] => {
  const rig = fakeApi();
  activate(rig.api);
  return rig.pipelines;
};

const VECTORS: Readonly<Record<GlslType, number>> = {
  float: 1, int: 1, bool: 1, vec2: 1, vec3: 1, vec4: 1, ivec2: 1, ivec3: 1, ivec4: 1, mat3: 3, mat4: 4, sampler2D: 1,
};

describe("activate", () => {
  it("registers both transforms and the Tone mapper panel", () => {
    const rig = fakeApi();
    activate(rig.api);
    expect(rig.pipelines.map((c) => c.id)).toEqual(["parametric-tonemappers.agx", "parametric-tonemappers.filmic"]);
    expect(rig.panels.map((p) => [p.id, p.title])).toEqual([["parametric-tonemappers.panel", "Tone mapper"]]);
    expect(rig.panels[0].defaultDock).toEqual({ module: "develop", direction: "right", order: 4, width: 268 });
    expect(rig.panels[0].onReset).toBe(resetActive);
  });

  // The transform's settings are photo-level (the display transform is per photo and derives from the
  // photo's bag), and the core offers a panel under a mask's "+ Adjust" only when it has a mask contribution.
  it("does not offer the panel inside masks", () => {
    const rig = fakeApi();
    activate(rig.api);
    expect("mask" in rig.panels[0]).toBe(false);
  });

  // Spec §5.1: at most 32 uniform vectors each, a mat3 counting 3.
  it("keeps each transform's derived uniforms within the 32-vector budget", () => {
    for (const t of registered()) {
      const vectors = (t.derive?.uniforms ?? []).reduce((n, u) => n + VECTORS[u.glslType], 0);
      expect(vectors, t.id).toBeGreaterThan(0);
      expect(vectors, t.id).toBeLessThanOrEqual(32);
    }
  });
});
