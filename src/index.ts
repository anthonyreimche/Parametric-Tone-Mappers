// Parametric Tone Mappers, a Safelight extension. GPL-3.0-or-later. See LICENSE.
//
// Two display transforms with settings: darktable's AgX (agx/, from darktable
// release-5.6.2) and Ansel's filmic rgb v8 (filmic/, from Ansel 2fadf8a366).
// The core runs their derive functions on the main thread and binds the
// results; their GLSL is per-pixel. The Tone mapper panel (panel/) edits the
// settings of the one the open photo renders with.

import { agxTransform } from "./agx/transform";
import { filmicTransform } from "./filmic/transform";
import { PANEL_TITLE, TonePanel, resetActive } from "./panel/Panel";
import { initRuntime } from "./runtime";
import type { SafelightAPI } from "./safelight";

export function activate(host: SafelightAPI): void {
  initRuntime(host);
  host.registerPipeline(agxTransform());
  host.registerPipeline(filmicTransform());
  host.registerPanel({
    id: "parametric-tonemappers.panel",
    title: PANEL_TITLE,
    component: TonePanel,
    defaultDock: { module: "develop", direction: "right", order: 4, width: 268 },
    onReset: resetActive,
  });
}

/** The host sweeps a deactivated extension's transforms and panel itself. */
export function deactivate(): void {}
