// A stand-in Safelight API over real React and zustand: the develop store
// holds params and a bag and records commits, dropping one that changes
// nothing as the core does; the pipeline store holds the Preferences default;
// the ui kit and the Slider are plain DOM so Testing Library can find controls
// by their labels. The param scope renews with the bag as the core's does, and
// maskScope stands in for the Masking panel's scope over a mask's own bag. The
// Slider reproduces the core Slider's reset, value field and commit points but
// not its pointer drag or animation-frame coalescing (a mouse-up stands in for
// the end of a drag).

import * as React from "react";
import { create } from "zustand";
import type {
  ButtonProps,
  DevelopParams,
  DevelopStoreState,
  FloatCaptureOptions,
  FloatFrame,
  PanelContribution,
  ParamScope,
  PipelineContribution,
  PipelineStoreState,
  RowProps,
  SafelightAPI,
  SectionProps,
  SegmentedControlProps,
  SelectProps,
  SliderProps,
  StackProps,
  StoreApi,
  ToggleProps,
  UiKit,
} from "../../src/safelight";

const e = React.createElement;

const BUILT_IN_TRANSFORM = "core.pipeline";

const MaskContext = React.createContext<ParamScope | null>(null);

// A transform's params keep their defaults in the core's param registry, by qualified key.
function registeredDefault(pipelines: readonly PipelineContribution[], key: string): unknown {
  for (const c of pipelines) for (const u of c.params ?? []) if (`${c.id}.${u.key}` === key) return u.default;
  return undefined;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const definedKeys = (r: Record<string, unknown>): string[] => Object.keys(r).filter((k) => r[k] !== undefined);

// The core's sameEdit (src/catalog/edit-equality.ts) over the plain values a test stores: arrays and records by
// content, a key set to undefined as absent.
function same(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => same(x, b[i]));
  }
  if (!isRecord(a) || !isRecord(b)) return false;
  const keys = definedKeys(a);
  return keys.length === definedKeys(b).length && keys.every((k) => same(a[k], b[k]));
}

/** The develop store with the masks' own bags by mask id: the core keeps each in its photo's params.masks, so a
 *  mask's edit is part of the photo's. */
export interface FakeDevelopState extends DevelopStoreState {
  maskBags: Record<string, Record<string, unknown>>;
  /** Adds a mask that was there before any edit, as the masks the Masking panel opens are: part of the last
   *  step's look too. */
  addMask(id: string, bag: Record<string, unknown>): void;
}

const lookOf = (s: FakeDevelopState) => ({ params: s.params, paramBag: s.paramBag, maskBags: s.maskBags });

const ui: UiKit = {
  Button: ({ variant: _v, size: _s, active, full: _f, children, ...rest }: ButtonProps) =>
    e("button", { type: "button", "aria-pressed": active, ...rest }, children),
  Select: ({ value, onChange, options, ariaLabel, placeholder, disabled, title }: SelectProps) =>
    e(
      "select",
      { value, title, "aria-label": ariaLabel, disabled, onChange: (ev: React.ChangeEvent<HTMLSelectElement>) => onChange(ev.target.value) },
      e("option", { value: "" }, placeholder ?? ""),
      ...(options ?? []).map((o) => e("option", { key: o.value, value: o.value }, o.label)),
    ),
  SegmentedControl: ({ value, onChange, options }: SegmentedControlProps) =>
    e(
      "div",
      { role: "group" },
      ...options.map((o) =>
        e("button", { key: o.value, type: "button", title: o.title, "aria-pressed": o.value === value, onClick: () => onChange(o.value) }, o.label),
      ),
    ),
  Toggle: ({ checked, onChange, label, ariaLabel }: ToggleProps) =>
    e(
      "label",
      null,
      e("input", {
        type: "checkbox",
        checked,
        "aria-label": ariaLabel ?? (typeof label === "string" ? label : undefined),
        onChange: (ev: React.ChangeEvent<HTMLInputElement>) => onChange(ev.target.checked),
      }),
      label,
    ),
  Row: ({ children }: RowProps) => e("div", null, children),
  Stack: ({ children }: StackProps) => e("div", null, children),
  Section: ({ title, right, children }: SectionProps) =>
    e("section", { "aria-label": typeof title === "string" ? title : undefined }, e("h3", null, title), right, children),
  tokens: {
    surface0: "var(--color-surface-0)",
    surface2: "var(--color-surface-2)",
    border: "var(--color-border)",
    textPrimary: "var(--color-text-primary)",
    textSecondary: "var(--color-text-secondary)",
    textMuted: "var(--color-text-muted)",
    accent: "var(--color-accent)",
  },
};

// Keys that move a focused range input's value (the core's VALUE_KEYS): a key-up
// commits after these only, not after undo or redo.
const VALUE_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"]);

// The core Slider's contract (src/ui/components/Slider.tsx): its own defaults for
// the span and the reset, a double-click resetting and committing, a key-up
// committing after a value key, and a value field that passes a typed finite
// number on past the span and commits when it loses focus.
const Slider = ({ label, value, onChange, onCommit, min = -100, max = 100, step = 1, defaultValue = 0 }: SliderProps) =>
  e(
    React.Fragment,
    null,
    e("input", {
      type: "range",
      "aria-label": label,
      value,
      min,
      max,
      step,
      onChange: (ev: React.ChangeEvent<HTMLInputElement>) => onChange(Number(ev.target.value)),
      onMouseUp: onCommit,
      onKeyUp: (ev: React.KeyboardEvent<HTMLInputElement>) => {
        if (VALUE_KEYS.has(ev.key)) onCommit?.();
      },
      onDoubleClick: () => {
        onChange(defaultValue);
        onCommit?.();
      },
    }),
    e("input", {
      type: "text",
      "aria-label": `${label} value`,
      value: value > 0 ? `+${value}` : String(value),
      onChange: (ev: React.ChangeEvent<HTMLInputElement>) => {
        const raw = ev.target.value;
        if (raw === "" || raw === "-" || raw === ".") return;
        const n = Number(raw);
        if (Number.isFinite(n)) onChange(n);
      },
      onBlur: () => onCommit?.(),
    }),
  );

export interface Rig {
  api: SafelightAPI;
  develop: StoreApi<FakeDevelopState>;
  /** The labels of the commits that recorded a step, oldest first. */
  commits: string[];
  captures: FloatCaptureOptions[];
  pipelines: PipelineContribution[];
  panels: PanelContribution[];
  settings: Map<string, unknown>;
}

export interface RigOptions {
  bag?: Record<string, unknown>;
  displayTransform?: string | null;
  processVersion?: number;
  exposure?: number;
  /** What captureFloatFrame resolves, or a promise the test settles when the capture should land;
   *  `"missing"` leaves the method off the API, and `"fails"` makes it reject. */
  frame?: FloatFrame | null | Promise<FloatFrame | null> | "missing" | "fails";
  /** The Preferences default a photo without a pick follows, at the start. */
  defaultTransform?: string;
}

export function fakeApi(o: RigOptions = {}): Rig {
  const commits: string[] = [];
  const captures: FloatCaptureOptions[] = [];
  const pipelines: PipelineContribution[] = [];
  const panels: PanelContribution[] = [];
  const settings = new Map<string, unknown>();
  // The core's params are opaque to the extension; this object stands in.
  const params = {
    displayTransform: o.displayTransform ?? null,
    processVersion: o.processVersion ?? 2,
    exposure: o.exposure ?? 0,
  } as unknown as DevelopParams;
  const develop = create<FakeDevelopState>()((set, get) => ({
    photoId: "p1",
    params,
    paramBag: o.bag ?? {},
    maskBags: {},
    setParam: (_key, value) => set((s) => ({ params: { ...s.params, displayTransform: value } as DevelopParams })),
    setDynParams: (patch) => set((s) => ({ paramBag: { ...s.paramBag, ...patch } })),
    addMask: (id, bag) => {
      set((s) => ({ maskBags: { ...s.maskBags, [id]: bag } }));
      committed = { ...committed, maskBags: { ...committed.maskBags, [id]: bag } };
    },
    commitEdit: async (label) => {
      const now = lookOf(get());
      if (!get().photoId || same(now, committed)) return;
      committed = now;
      commits.push(label);
    },
  }));
  // The look of the last step: the photo opens on one, as the core seeds its history with it.
  let committed = lookOf(develop.getState());
  const usePipelineStore = create<PipelineStoreState>()(() => ({ activeId: o.defaultTransform ?? BUILT_IN_TRANSFORM }));
  const registered = (id: string): boolean => id === BUILT_IN_TRANSFORM || pipelines.some((c) => c.id === id);
  const makeScope = (): ParamScope => ({
    maskId: null,
    getParam: (key) => develop.getState().paramBag[key] ?? registeredDefault(pipelines, key),
    getParams: () => develop.getState().paramBag,
    setParams: (patch) => develop.getState().setDynParams(patch),
    commit: (label) => void develop.getState().commitEdit(label),
  });
  const frame = o.frame;
  const api: SafelightAPI = {
    version: 1,
    extensionId: "parametric-tonemappers",
    react: React,
    registerPipeline: (c) => void pipelines.push(c),
    registerPanel: (c) => void panels.push(c),
    settings: {
      get: <T,>(key: string, fallback: T): T => (settings.has(key) ? (settings.get(key) as T) : fallback),
      set: (key, value) => void settings.set(key, value),
    },
    components: { Slider },
    ui,
    stores: { useDevelopStore: develop, usePipelineStore },
    develop: {
      // Subscribed to the bag and renewed with it, as the core's scope is, so a write re-renders the component;
      // inside a maskScope provider, the mask's scope instead.
      useParamScope: () => {
        const mask = React.useContext(MaskContext);
        const bag = develop((s) => s.paramBag);
        const photo = React.useMemo(makeScope, [bag]);
        return mask ?? photo;
      },
      ...(frame === "missing"
        ? {}
        : {
            captureFloatFrame: async (_params: DevelopParams, opts?: FloatCaptureOptions) => {
              captures.push(opts ?? {});
              if (frame === "fails") throw new Error("the capture failed");
              return frame ?? null;
            },
          }),
    },
    pipelines: {
      // The pick while it is registered, else the default while it is, else the built-in.
      effectiveId: (pick) => {
        const fallback = usePipelineStore.getState().activeId;
        if (pick && registered(pick)) return pick;
        return registered(fallback) ? fallback : BUILT_IN_TRANSFORM;
      },
      // The declared keys of a registered transform, as the core lists them: none for an id it doesn't know.
      paramKeys: (id) => (pipelines.find((c) => c.id === id)?.params ?? []).map((u) => `${id}.${u.key}`),
    },
  };
  return { api, develop, commits, captures, pipelines, panels, settings };
}

/** The Masking panel's scope over one mask's bag (src/modules/develop/mask-scope.tsx):
 *  a component under `Provider` reads and writes that bag, renewed as it changes, and
 *  commits through the develop store; the photo's bag is left as it is. */
export interface MaskRig {
  Provider: React.ComponentType<{ children?: React.ReactNode }>;
  bag(): Record<string, unknown>;
}

export function maskScope(rig: Rig, initial: Record<string, unknown> = {}): MaskRig {
  const id = "m1";
  rig.develop.getState().addMask(id, initial);
  const bag = (): Record<string, unknown> => rig.develop.getState().maskBags[id] ?? {};
  const Provider = ({ children }: { children?: React.ReactNode }) => {
    const held = rig.develop((s) => s.maskBags[id]);
    const scope = React.useMemo<ParamScope>(
      () => ({
        maskId: id,
        getParam: (key) => bag()[key] ?? registeredDefault(rig.pipelines, key),
        getParams: bag,
        setParams: (patch) => rig.develop.setState((s) => ({ maskBags: { ...s.maskBags, [id]: { ...bag(), ...patch } } })),
        commit: (label) => void rig.develop.getState().commitEdit(label),
      }),
      [held],
    );
    return e(MaskContext.Provider, { value: scope }, children);
  };
  return { Provider, bag };
}

/** A FloatFrame of w×h pixels from an RGB function, alpha 1. */
export function frameOf(w: number, h: number, rgb: (x: number, y: number) => [number, number, number]): FloatFrame {
  const data = new Float32Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set([...rgb(x, y), 1], (y * w + x) * 4);
  return { data, width: w, height: h, space: { encoding: "linear", primaries: "rec2020" }, point: "scene" };
}
