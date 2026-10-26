// Parametric Tone Mappers, a Safelight extension. GPL-3.0-or-later. See LICENSE.

// The slice of Safelight's extension API this extension touches, mirrored from
// the app's src/extensions/types.ts, src/extensions/ui-kit.tsx,
// src/extensions/pipelines.ts, src/modules/develop/mask-scope.tsx,
// src/rendering/float-frame.ts and src/state/develop-store.ts (core 3.1.0
// with display transform params and the scene capture point). Extensions are
// standalone bundles, so the host's source is not on the type path; React
// types come from @types/react (dev only).

import type { ButtonHTMLAttributes, ComponentType, CSSProperties, ReactNode } from "react";

export type GlslType =
  | "float" | "int" | "bool"
  | "vec2" | "vec3" | "vec4"
  | "ivec2" | "ivec3" | "ivec4"
  | "mat3" | "mat4"
  | "sampler2D";

export type UniformValue = number | number[] | boolean;

export interface UniformDeclaration {
  key: string;
  glslType: GlslType;
  default: UniformValue;
  range?: { min: number; max: number; step?: number };
  label?: string;
}

export interface TransformDerive {
  uniforms: UniformDeclaration[];
  fn(values: Readonly<Record<string, UniformValue>>): Record<string, UniformValue>;
}

export interface PipelineContribution {
  id: string;
  name: string;
  description?: string;
  glsl?: string;
  skipBaseCurve?: boolean;
  skipToneShoulder?: boolean;
  params?: UniformDeclaration[];
  helpers?: string;
  derive?: TransformDerive;
}

export interface StoreApi<T> {
  (): T;
  <U>(selector: (state: T) => U): U;
  getState(): T;
  setState(partial: Partial<T> | ((s: T) => Partial<T>)): void;
  subscribe(listener: (state: T, prev: T) => void): () => void;
}

/** Core develop params: opaque here bar the fields this extension reads. */
export type DevelopParams = Record<string, unknown> & {
  readonly __develop: unique symbol;
  /** The photo's own display transform pick; null follows the Preferences default. */
  readonly displayTransform: string | null;
  /** Missing or 1 for edits made on older processing. */
  readonly processVersion?: number;
  /** Basic panel Exposure, EV. */
  readonly exposure: number;
};

export interface DevelopStoreState {
  photoId: string | null;
  params: DevelopParams;
  /** Extension params by qualified key; values come back from storage, so unknown. */
  paramBag: Record<string, unknown>;
  setParam(key: "displayTransform", value: string | null): void;
  setDynParams(patch: Record<string, unknown>): void;
  commitEdit(label: string): Promise<void>;
}

/** The Preferences default display transform (src/extensions/pipelines.ts). */
export interface PipelineStoreState {
  /** What a photo without its own pick renders with, while it is registered. */
  activeId: string;
}

/** The params a panel edits: the photo's bag, or one mask's (maskId set).
 *  Reads see the store as it is now, not as the render was handed it. */
export interface ParamScope {
  maskId: string | null;
  /** A param by qualified key; falls back to the param's registered default
   *  when the scope stores nothing. */
  getParam(key: string): unknown;
  /** The stored values by qualified key, without defaults. */
  getParams(): Readonly<Record<string, unknown>>;
  setParams(patch: Record<string, unknown>): void;
  commit(label: string): void;
}

export interface PanelContribution {
  id: string;
  title: string;
  component: ComponentType;
  defaultDock?: { module: "develop"; direction: "right"; order?: number; width?: number };
  onReset?: () => void;
}

export interface SliderProps {
  label: string;
  value: number;
  onChange(value: number): void;
  onCommit?(): void;
  min?: number;
  max?: number;
  step?: number;
  defaultValue?: number;
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  active?: boolean;
  full?: boolean;
}

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps {
  value: string;
  onChange(value: string): void;
  options?: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  title?: string;
}

export interface SegmentedControlProps {
  value: string;
  onChange(value: string): void;
  options: { value: string; label: ReactNode; title?: string }[];
  size?: "sm" | "md";
}

export interface ToggleProps {
  checked: boolean;
  onChange(checked: boolean): void;
  label?: ReactNode;
  ariaLabel?: string;
}

// Row, Stack and Section take their children through h's rest arguments, so
// their props leave `children` optional where the core types it required.
export interface RowProps {
  children?: ReactNode;
  gap?: number;
  align?: CSSProperties["alignItems"];
  justify?: CSSProperties["justifyContent"];
  wrap?: boolean;
  style?: CSSProperties;
}

export interface StackProps {
  children?: ReactNode;
  gap?: number;
  style?: CSSProperties;
}

export interface SectionProps {
  title: ReactNode;
  right?: ReactNode;
  children?: ReactNode;
}

export interface UiKit {
  Button: ComponentType<ButtonProps>;
  Select: ComponentType<SelectProps>;
  SegmentedControl: ComponentType<SegmentedControlProps>;
  Toggle: ComponentType<ToggleProps>;
  Row: ComponentType<RowProps>;
  Stack: ComponentType<StackProps>;
  Section: ComponentType<SectionProps>;
  tokens: Readonly<Record<"surface0" | "surface2" | "border" | "textPrimary" | "textSecondary" | "textMuted" | "accent", string>>;
}

export interface StageSpace {
  encoding: "linear" | "perceptual";
  primaries?: "rec709" | "rec2020";
}

export interface FloatFrame {
  data: Float32Array;
  width: number;
  height: number;
  space: StageSpace;
  point: "pre-output" | "output" | "scene";
}

/** A live capture's options: the frame's point and space, and its long edge in
 *  pixels (1280 by default). */
export interface FloatCaptureOptions {
  point?: "pre-output" | "output" | "scene";
  space?: StageSpace;
  maxEdge?: number;
}

export interface SafelightAPI {
  version: 1;
  extensionId: string;
  react: typeof import("react");
  registerPipeline(c: PipelineContribution): void;
  registerPanel(c: PanelContribution): void;
  settings: {
    get<T>(key: string, fallback: T): T;
    set(key: string, value: unknown): void;
  };
  components: { Slider: ComponentType<SliderProps> };
  ui: UiKit;
  stores: { useDevelopStore: StoreApi<DevelopStoreState>; usePipelineStore: StoreApi<PipelineStoreState> };
  develop: {
    useParamScope(): ParamScope;
    /** Safelight 3.1.0 and later; the "scene" point needs the build with it. */
    captureFloatFrame?(params: DevelopParams, options?: FloatCaptureOptions): Promise<FloatFrame | null>;
  };
  pipelines: {
    effectiveId(displayTransform: string | null): string;
    /** Safelight builds that list transform params. */
    paramKeys?(id: string): string[];
  };
}
