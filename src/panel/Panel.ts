// Parametric Tone Mappers, a Safelight extension. GPL-3.0-or-later. See LICENSE.

// The Tone mapper panel: the settings of the transform the open photo renders
// with, laid out as its upstream lays them out (controls.ts), or a way to
// switch to one when it renders with another.

import type { ReactElement, ReactNode } from "react";
import { AGX_PARAMS } from "../agx/params";
import { AGX_ID } from "../agx/transform";
import { agxAutoTune, agxReadExposure, filmicAutoTune, measureScene, type FrameStats } from "../autotune";
import { FILMIC_PARAMS } from "../filmic/params";
import { FILMIC_ID } from "../filmic/transform";
import { defaults, qualify, readParams, unqualify, withinRange, type ParamTable, type ParamValues } from "../param-table";
import { api, h } from "../runtime";
import { AGX_TABS, FILMIC_TABS, type ActionId, type Control, type SectionSpec, type TabSpec } from "./controls";
import { CurveGraph, agxGraph, filmicGraph, type GraphData } from "./Graph";
import { agxEdit, agxPivotEv, agxPivotX, agxSetFromAbove, filmicDirect, filmicEdit, filmicLatitudeBalance } from "./model";
import { AGX_PRESETS, AGX_PRIMARIES } from "./presets";

export const PANEL_TITLE = "Tone mapper";
export const INACTIVE_HINT = "This photo uses another display transform. Pick one of these to edit its settings here.";
export const OLDER_PROCESSING =
  "This photo uses the older processing, so Safelight's own highlight shoulder still runs before the transform. Use Update processing in Develop's status bar to give the transform the full range.";
export const AUTO_UNSUPPORTED = "Auto tune needs a Safelight build that can measure the scene before the display transform.";
export const AUTO_NO_FRAME = "Nothing to measure: no photo is rendered yet, or this GPU has no float render targets.";

type Patch<T extends ParamTable> = Partial<ParamValues<T>>;

// `raw` writes the patch without the transform's GUI couplings: upstream's
// pickers and presets set their fields inside a GUI freeze, so a coupling
// would shift the ends they just set.
type Action<T extends ParamTable> =
  | { label: string; scene: true; raw?: true; run(p: ParamValues<T>, stats: FrameStats): Patch<T> }
  | { label: string; scene: false; raw?: true; run(p: ParamValues<T>, exposure: number): Patch<T> };

/** One slider gesture: a drag, a key press or a typed number. Its live writes
 *  couple from the params it started from, as upstream couples a value once,
 *  so the keystrokes of a typed number or the frames of a drag land where one
 *  jump to the last value would. The first write starts it; the commit ends it. */
interface Gesture<T extends ParamTable> {
  from(): ParamValues<T>;
  write(patch: Patch<T>): void;
  commit(label: string): void;
}

/** What the panel draws for a control only one transform has (AgX's pivot in
 *  EV, filmic's highlights/shadows); null for every other kind. */
type Special<T extends ParamTable> = (c: Control<ParamValues<T>>, p: ParamValues<T>, gesture: Gesture<T>) => ReactNode;

interface TransformUi<T extends ParamTable> {
  id: string;
  name: string;
  table: T;
  tabs: readonly TabSpec<ParamValues<T>>[];
  edit(prev: ParamValues<T>, patch: Patch<T>): Patch<T>;
  graph(p: ParamValues<T>): GraphData;
  actions: Partial<Record<ActionId, Action<T>>>;
  special: Special<T>;
  presets?: readonly { name: string; params: ParamValues<T> }[];
  /** "Reset primaries" sets, shown on the tab of that value. */
  resets?: { tab: string; sets: Readonly<Record<string, Patch<T>>> };
}

const decimals = (step: number): number => (String(step).split(".")[1] ?? "").length;

/** A value as its slider shows it: to the step's decimals plus a guard digit,
 *  so a stored ratio times 100 reads 29.46, not 29.462451000000003. Display only. */
const shown = (value: number, step: number): number => Number(value.toFixed(decimals(step) + 1));

interface SliderSpec {
  label: string;
  tooltip: string;
  value: number;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  onChange(v: number): void;
  onCommit(): void;
}

function slider({ label, tooltip, value, min, max, ...rest }: SliderSpec): ReactElement {
  const host = api();
  const now = shown(value, rest.step);
  // A stored value past upstream's soft range widens the span to it, so the slider doesn't pull it back.
  return h(
    "div",
    { key: label, title: tooltip },
    h(host.components.Slider, { label, value: now, min: Math.min(min, now), max: Math.max(max, now), ...rest }),
  );
}

const agxSpecial: Special<typeof AGX_PARAMS> = (c, p, gesture) => {
  if (c.kind !== "pivot") return null;
  return slider({
    label: `${c.label} (EV)`,
    tooltip: c.tooltip,
    value: agxPivotEv(p),
    min: p.range_black_relative_ev,
    max: p.range_white_relative_ev,
    step: 0.01,
    defaultValue: 0,
    onChange: (ev) => {
      const from = gesture.from();
      gesture.write({ curve_pivot_x: agxPivotX({ black: from.range_black_relative_ev, white: from.range_white_relative_ev }, ev) });
    },
    onCommit: () => gesture.commit(c.label),
  });
};

const filmicSpecial: Special<typeof FILMIC_PARAMS> = (c, p, gesture) => {
  if (c.kind !== "direct") return null;
  return slider({
    label: `${c.label} (%)`,
    tooltip: c.tooltip,
    value: filmicDirect(p)[c.side],
    min: c.min,
    max: c.max,
    step: 0.1,
    defaultValue: c.reset,
    onChange: (v) => {
      const from = gesture.from();
      const was = filmicDirect(from);
      gesture.write(c.side === "toe" ? filmicLatitudeBalance(from, v, was.shoulder) : filmicLatitudeBalance(from, was.toe, v));
    },
    onCommit: () => gesture.commit(c.label),
  });
};

const AGX_UI: TransformUi<typeof AGX_PARAMS> = {
  id: AGX_ID,
  name: "AgX",
  table: AGX_PARAMS,
  tabs: AGX_TABS,
  edit: agxEdit,
  graph: agxGraph,
  special: agxSpecial,
  actions: {
    agxAutoTune: { label: "AgX auto tune levels", scene: true, run: agxAutoTune },
    agxReadExposure: { label: "AgX read exposure", scene: false, run: agxReadExposure },
    agxSetFromAbove: { label: "AgX set from above", scene: false, run: agxSetFromAbove },
  },
  presets: AGX_PRESETS,
  resets: { tab: "primaries", sets: AGX_PRIMARIES },
};

const FILMIC_UI: TransformUi<typeof FILMIC_PARAMS> = {
  id: FILMIC_ID,
  name: "Filmic",
  table: FILMIC_PARAMS,
  tabs: FILMIC_TABS,
  edit: filmicEdit,
  graph: filmicGraph,
  special: filmicSpecial,
  actions: { filmicAutoTune: { label: "Filmic auto tune levels", scene: true, raw: true, run: filmicAutoTune } },
};

function choose(id: string): void {
  const dev = api().stores.useDevelopStore.getState();
  dev.setParam("displayTransform", id);
  void dev.commitEdit("Display transform");
}

function resetTo<T extends ParamTable>(ui: TransformUi<T>): void {
  const dev = api().stores.useDevelopStore.getState();
  dev.setDynParams(qualify(ui.id, defaults(ui.table)));
  void dev.commitEdit(`${ui.name} reset`);
}

/** Resets the open photo's transform to upstream's defaults (PanelContribution.onReset). */
export function resetActive(): void {
  const host = api();
  const id = host.pipelines.effectiveId(host.stores.useDevelopStore.getState().params.displayTransform);
  if (id === AGX_ID) resetTo(AGX_UI);
  else if (id === FILMIC_ID) resetTo(FILMIC_UI);
}

function Inactive(): ReactElement {
  const ui = api().ui;
  return h(
    ui.Stack,
    { gap: 8 },
    h("p", { style: { margin: 0, color: ui.tokens.textSecondary, fontSize: 11 } }, INACTIVE_HINT),
    h(
      ui.Row,
      { gap: 6, wrap: true },
      h(ui.Button, { onClick: () => choose(AGX_ID) }, "Use AgX (parametric)"),
      h(ui.Button, { onClick: () => choose(FILMIC_ID) }, "Use Filmic RGB (parametric)"),
    ),
  );
}

export function TonePanel(): ReactElement {
  const host = api();
  const { useDevelopStore, usePipelineStore } = host.stores;
  const pick = useDevelopStore((s) => s.params.displayTransform);
  const processVersion = useDevelopStore((s) => s.params.processVersion);
  const photoId = useDevelopStore((s) => s.photoId);
  // A photo without a pick follows the Preferences default, so a change of it draws again.
  usePipelineStore((s) => s.activeId);
  const id = host.pipelines.effectiveId(pick);
  // Keyed per transform and photo, so either change starts from the saved tab, with no message and no gesture.
  const key = `${id}:${photoId}`;
  if (id === AGX_ID) return h(Body<typeof AGX_PARAMS>, { key, ui: AGX_UI, processVersion });
  if (id === FILMIC_ID) return h(Body<typeof FILMIC_PARAMS>, { key, ui: FILMIC_UI, processVersion });
  return h(Inactive, null);
}

/** `processVersion` is the photo's, as the pick and Exposure are, wherever the panel is shown.
 *  The transform's own values come from the param scope. */
interface BodyProps<T extends ParamTable> {
  ui: TransformUi<T>;
  processVersion: number | undefined;
}

function Body<T extends ParamTable>({ ui, processVersion }: BodyProps<T>): ReactElement {
  const host = api();
  const { useRef, useState } = host.react;
  const kit = host.ui;
  const dev = host.stores.useDevelopStore;
  const scope = host.develop.useParamScope();
  const tabKey = `${ui.id}.tab`;
  const [tab, setTab] = useState<string>(() => host.settings.get(tabKey, ui.tabs[0].value));
  const [message, setMessage] = useState<string | null>(null);
  // The collapsibles' state lives in settings; this re-renders when one flips.
  const [, bump] = useState(0);
  // A gesture's start: its params, the bag as it stored them, and the bag keys the gesture's writes have set.
  const started = useRef<{ from: ParamValues<T>; stored: Readonly<Record<string, unknown>>; keys: Set<string> } | null>(null);
  // The scope is renewed whenever its bag changes, so a render reads the values it was handed; a write
  // that follows an await reads them again, to edit what is there when it lands.
  const read = (): ParamValues<T> => readParams(ui.table, unqualify(ui.id, scope.getParams()));
  const p = read();
  const base = defaults(ui.table);

  // The couplings see the patch held to the hard range, as upstream's sliders hold a value before they couple it.
  const coupled = (from: ParamValues<T>, patch: Patch<T>, raw: boolean): Record<string, unknown> => {
    const held = withinRange(ui.table, patch);
    return qualify(ui.id, withinRange(ui.table, raw ? held : ui.edit(from, held)));
  };
  /** A toggle, menu, button or preset: written and committed at once, coupled from the params as they are. */
  const write = (patch: Patch<T>, label: string, raw = false) => {
    scope.setParams(coupled(read(), patch, raw));
    scope.commit(label);
  };
  const start = () => (started.current ??= { from: read(), stored: scope.getParams(), keys: new Set<string>() });
  const gesture: Gesture<T> = {
    from: () => start().from,
    // A key an earlier write set goes back to what the start stored unless this write sets it too, so the bag
    // holds what one jump from the start would, where this value skips a coupling an earlier one made.
    write: (patch) => {
      const { from, stored, keys } = start();
      const next = coupled(from, patch, false);
      for (const k of Object.keys(next)) keys.add(k);
      const laid: Record<string, unknown> = {};
      for (const k of keys) laid[k] = k in next ? next[k] : stored[k];
      scope.setParams(laid);
    },
    commit: (label) => {
      started.current = null;
      scope.commit(label);
    },
  };
  // A one-key patch: `key` is one of the table's keys and `value` has its param's type.
  const one = (key: string, value: number | boolean): Patch<T> => ({ [key]: value }) as Patch<T>;

  const run = async (id: ActionId) => {
    const action = ui.actions[id];
    if (!action) return;
    setMessage(null);
    if (!action.scene) return write(action.run(read(), dev.getState().params.exposure), action.label, action.raw);
    const photo = dev.getState().photoId;
    let stats: FrameStats | "unsupported" | "no frame";
    try {
      stats = await measureScene(host);
    } catch {
      stats = "no frame";
    }
    // A capture belongs to the photo and the transform it started on.
    const now = dev.getState();
    if (now.photoId !== photo || host.pipelines.effectiveId(now.params.displayTransform) !== ui.id) return;
    if (stats === "unsupported") setMessage(AUTO_UNSUPPORTED);
    else if (stats === "no frame") setMessage(AUTO_NO_FRAME);
    else write(action.run(read(), stats), action.label, action.raw);
  };

  const control = (c: Control<ParamValues<T>>, i: number): ReactNode => {
    if ("when" in c && c.when && !c.when(p)) return null;
    switch (c.kind) {
      case "slider":
        return slider({
          label: c.unit ? `${c.label} (${c.unit})` : c.label,
          tooltip: c.tooltip,
          value: (p[c.key] as number) * c.scale,
          min: c.min,
          max: c.max,
          step: c.step,
          defaultValue: (c.reset ?? (base[c.key] as number)) * c.scale,
          onChange: (v) => gesture.write(one(c.key, v / c.scale)),
          onCommit: () => gesture.commit(c.label),
        });
      case "toggle":
        return h(
          "div",
          { key: c.key, title: c.tooltip },
          h(kit.Toggle, { checked: p[c.key] as boolean, label: c.label, onChange: (v: boolean) => write(one(c.key, v), c.label) }),
        );
      case "select": {
        const v = p[c.key] as number;
        // base_primaries 0 (export profile) isn't offered; it renders as Rec2020.
        const offered = c.options.some(([o]) => o === v) ? v : c.options[1][0];
        return h(kit.Select, {
          key: c.key,
          ariaLabel: c.label,
          title: c.tooltip,
          value: String(offered),
          options: c.options.map(([o, label]) => ({ value: String(o), label })),
          onChange: (s: string) => write(one(c.key, Number(s)), c.label),
        });
      }
      case "action": {
        const unsupported = ui.actions[c.id]?.scene === true && !host.develop.captureFloatFrame;
        const greyed = c.enabled !== undefined && !c.enabled(p);
        return h(
          kit.Button,
          { key: c.id, size: "sm", disabled: unsupported || greyed, title: unsupported ? AUTO_UNSUPPORTED : c.tooltip, onClick: () => void run(c.id) },
          c.label,
        );
      }
      case "graph":
        return h(CurveGraph, { key: `graph-${i}`, ...ui.graph(p) });
      default:
        return ui.special(c, p, gesture);
    }
  };

  const section = (s: SectionSpec<ParamValues<T>>): ReactNode => {
    if (s.when && !s.when(p)) return null;
    const openKey = `${ui.id}.open.${s.title}`;
    const open = !s.collapsed || host.settings.get(openKey, false);
    // "Show curve" already starts with the verb the toggle's name adds.
    const noun = s.title.toLowerCase().replace(/^show /, "");
    const toggle = s.collapsed
      ? h(
          kit.Button,
          {
            variant: "ghost",
            size: "sm",
            "aria-label": `${open ? "Hide" : "Show"} ${noun}`,
            onClick: () => {
              host.settings.set(openKey, !open);
              bump((n) => n + 1);
            },
          },
          open ? "Hide" : "Show",
        )
      : undefined;
    return h(kit.Section, { key: s.title, title: s.title, right: toggle }, open ? h(kit.Stack, { gap: 6 }, ...s.controls.map(control)) : null);
  };

  const menu = (label: string, names: readonly string[], apply: (name: string) => void): ReactElement =>
    h(kit.Select, { key: label, ariaLabel: label, placeholder: label, value: "", options: names.map((n) => ({ value: n, label: n })), onChange: apply });

  const active = ui.tabs.find((t) => t.value === tab) ?? ui.tabs[0];
  const { presets, resets } = ui;
  return h(
    kit.Stack,
    { gap: 10 },
    (processVersion ?? 1) < 2 ? h("p", { style: { margin: 0, color: kit.tokens.textMuted, fontSize: 11 } }, OLDER_PROCESSING) : null,
    presets
      ? menu("Preset", presets.map((x) => x.name), (name) => {
          const preset = presets.find((x) => x.name === name);
          if (preset) write(preset.params, `${ui.name} preset: ${name}`, true);
        })
      : null,
    h(kit.SegmentedControl, {
      value: active.value,
      options: ui.tabs.map((t) => ({ value: t.value, label: t.label, title: t.tooltip })),
      onChange: (v: string) => {
        host.settings.set(tabKey, v);
        setTab(v);
      },
    }),
    resets && active.value === resets.tab
      ? menu("Reset primaries", Object.keys(resets.sets), (name) => {
          const set = resets.sets[name];
          if (set) write(set, `${ui.name} reset primaries: ${name}`);
        })
      : null,
    ...active.sections.map(section),
    message ? h("p", { style: { margin: 0, color: kit.tokens.textSecondary, fontSize: 11 } }, message) : null,
  );
}
