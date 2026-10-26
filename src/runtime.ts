// Parametric Tone Mappers, a Safelight extension. GPL-3.0-or-later. See LICENSE.

// The API captured at activate(), and createElement off the app's React
// (an extension must never bundle its own copy: a second React breaks hooks).

import type { Attributes, ComponentType, ReactElement, ReactNode } from "react";
import type { SafelightAPI } from "./safelight";

let current: SafelightAPI | null = null;

export function initRuntime(host: SafelightAPI): void {
  current = host;
}

export function api(): SafelightAPI {
  if (!current) throw new Error("[parametric-tonemappers] api() called before activate()");
  return current;
}

export function h<P extends object>(
  type: string | ComponentType<P>,
  props?: (Attributes & P) | null,
  ...children: ReactNode[]
): ReactElement {
  return api().react.createElement(type, props, ...children);
}
