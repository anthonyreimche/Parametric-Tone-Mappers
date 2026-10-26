import { describe, expect, it } from "vitest";
import { AGX_DEFAULTS, AGX_PARAMS, type AgxParams } from "../src/agx/params";
import { FILMIC_DEFAULTS, FILMIC_PARAMS, type FilmicParams } from "../src/filmic/params";
import { AGX_TABS, FILMIC_TABS, type Control, type TabSpec } from "../src/panel/controls";
import type { ParamTable } from "../src/param-table";

const DEG = 180 / Math.PI;

function controlsOf<P>(tabs: readonly TabSpec<P>[]): Control<P>[] {
  return tabs.flatMap((t) => t.sections.flatMap((s) => s.controls));
}

function keysOf<P>(tabs: readonly TabSpec<P>[]): string[] {
  return controlsOf(tabs).flatMap((c) => ("key" in c ? [String(c.key)] : []));
}

const visible = <P>(c: Control<P>, p: P): boolean => !("when" in c) || !c.when || c.when(p);

/** The keys and action ids the panel draws for `p`. */
function shown<P>(tabs: readonly TabSpec<P>[], p: P): string[] {
  return tabs
    .flatMap((t) => t.sections.filter((s) => !s.when || s.when(p)).flatMap((s) => s.controls.filter((c) => visible(c, p))))
    .flatMap((c) => (c.kind === "action" ? [c.id] : "key" in c ? [String(c.key)] : []));
}

function slidersOf<P>(tabs: readonly TabSpec<P>[]) {
  return controlsOf(tabs).flatMap((c) => (c.kind === "slider" ? [c] : []));
}

function expectSpansInsideHardRanges<P>(tabs: readonly TabSpec<P>[], table: ParamTable): void {
  for (const c of slidersOf(tabs)) {
    const d = table[String(c.key)];
    if (d.type === "bool") throw new Error(String(c.key));
    expect(c.min, String(c.key)).toBeLessThan(c.max);
    expect(c.min / c.scale, String(c.key)).toBeGreaterThanOrEqual(d.min - 1e-9);
    expect(c.max / c.scale, String(c.key)).toBeLessThanOrEqual(d.max + 1e-9);
  }
}

const capitalised = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

function expectUpstreamLabels<P>(tabs: readonly TabSpec<P>[], table: ParamTable): void {
  for (const c of controlsOf(tabs)) {
    if (c.kind !== "slider" && c.kind !== "toggle" && c.kind !== "select") continue;
    expect(c.label, String(c.key)).toBe(capitalised(table[String(c.key)].label));
  }
}

function expectCapitalisedText<P>(tabs: readonly TabSpec<P>[]): void {
  for (const t of tabs) {
    expect(t.tooltip).toMatch(/^[A-Z]/);
    for (const s of t.sections) expect(s.title).toMatch(/^[A-Z]/);
  }
  for (const c of controlsOf(tabs)) {
    if (c.kind === "graph") continue;
    expect(c.label).toMatch(/^[A-Z]/);
    expect(c.tooltip, c.label).toMatch(/^[A-Z]/);
  }
}

describe("AgX controls", () => {
  it("show every param but curve_pivot_x once, and the pivot as EV", () => {
    const keys = keysOf(AGX_TABS);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.sort()).toEqual(Object.keys(AGX_PARAMS).filter((k) => k !== "curve_pivot_x").sort());
    expect(AGX_TABS.flatMap((t) => t.sections.flatMap((s) => s.controls)).some((c) => c.kind === "pivot")).toBe(true);
  });

  it("give the pivot darktable's label and tooltip", () => {
    const pivot = controlsOf(AGX_TABS).find((c) => c.kind === "pivot");
    expect(pivot).toEqual({ kind: "pivot", label: "Pivot relative exposure", tooltip: "Set the pivot's input exposure in EV relative to mid-gray" });
  });

  it("keep each slider's span inside the param's hard range, in display units", () => {
    expectSpansInsideHardRanges(AGX_TABS, AGX_PARAMS);
  });

  it("use darktable's tabs", () => {
    expect(AGX_TABS.map((t) => t.label)).toEqual(["Settings", "Primaries"]);
  });

  it("label every control with its param's upstream description, first letter capitalised", () => {
    expectUpstreamLabels(AGX_TABS, AGX_PARAMS);
    expectCapitalisedText(AGX_TABS);
  });

  it("scale percent ratios by 100, radians to degrees, and leave EV and plain numbers", () => {
    const expected = { "%": 100, "°": DEG, EV: 1, "": 1 };
    for (const c of slidersOf(AGX_TABS)) expect(c.scale, String(c.key)).toBe(expected[c.unit]);
    const units = new Map(slidersOf(AGX_TABS).map((c) => [String(c.key), c.unit]));
    expect(units.get("red_rotation")).toBe("°");
    expect(units.get("blue_unrotation")).toBe("°");
    expect(units.get("range_white_relative_ev")).toBe("EV");
    expect(units.get("look_saturation")).toBe("%");
    expect(units.get("curve_contrast_around_pivot")).toBe("");
  });

  it("offer the five base primaries the extension renders", () => {
    const select = controlsOf(AGX_TABS).find((c) => c.kind === "select");
    expect(select?.kind === "select" ? select.options : []).toEqual([
      [1, "Working profile"],
      [2, "Rec2020"],
      [3, "Display P3"],
      [4, "Adobe RGB (compatible)"],
      [5, "sRGB"],
    ]);
  });

  it("set the primaries sliders to 0 on a double-click, and the master sliders to 1, as darktable does", () => {
    const zeros = ["red", "green", "blue"].flatMap((c) => [`${c}_inset`, `${c}_rotation`, `${c}_outset`, `${c}_unrotation`]);
    const resets = Object.fromEntries(slidersOf(AGX_TABS).flatMap((c) => (c.reset === undefined ? [] : [[String(c.key), c.reset]])));
    expect(resets).toEqual({
      ...Object.fromEntries(zeros.map((k) => [k, 0])),
      master_outset_ratio: 1,
      master_unrotation_ratio: 1,
    });
    for (const c of slidersOf(AGX_TABS)) {
      if (c.reset === undefined) continue;
      const d = AGX_PARAMS[c.key as keyof typeof AGX_PARAMS];
      if (d.type === "bool") throw new Error(String(c.key));
      expect(c.reset, String(c.key)).toBeGreaterThanOrEqual(d.min);
      expect(c.reset, String(c.key)).toBeLessThanOrEqual(d.max);
    }
  });

  it("word the exposure and base primaries tooltips for controls Safelight has", () => {
    const tip = (id: string) => {
      const c = controlsOf(AGX_TABS).find((x) => (x.kind === "action" ? x.id === id : "key" in x && x.key === id));
      return c && c.kind !== "graph" ? c.tooltip : "";
    };
    expect(tip("agxAutoTune")).toBe("Set black and white relative exposure from the image in view");
    expect(tip("agxReadExposure")).toBe("Read exposure from the Exposure slider");
    expect(tip("base_primaries")).toBe("Color space primaries to use as the base for below adjustments. Working profile is Rec2020 here.");
    for (const c of controlsOf(AGX_TABS)) {
      if (c.kind !== "graph") expect(c.tooltip, c.label).not.toMatch(/selected area|exposure module|export profile/);
    }
  });

  it("carry the three actions the panel runs", () => {
    const ids = controlsOf(AGX_TABS).flatMap((c) => (c.kind === "action" ? [c.id] : []));
    expect(ids.sort()).toEqual(["agxAutoTune", "agxReadExposure", "agxSetFromAbove"]);
  });

  it("hide the gamma slider while the pivot follows the diagonal", () => {
    const base: AgxParams = AGX_DEFAULTS;
    expect(shown(AGX_TABS, base)).toContain("curve_gamma");
    expect(shown(AGX_TABS, { ...base, auto_gamma: true })).not.toContain("curve_gamma");
    expect(shown(AGX_TABS, { ...base, auto_gamma: true })).toContain("auto_gamma");
  });

  it("hide every primaries adjustment, and only those, when adjustments are disabled", () => {
    const all = shown(AGX_TABS, AGX_DEFAULTS);
    const off = shown(AGX_TABS, { ...AGX_DEFAULTS, disable_primaries_adjustments: true });
    expect(all.filter((k) => !off.includes(k)).sort()).toEqual(
      [
        ...["red", "green", "blue"].flatMap((c) => [`${c}_inset`, `${c}_rotation`, `${c}_outset`, `${c}_unrotation`]),
        "master_outset_ratio", "master_unrotation_ratio", "completely_reverse_primaries", "agxSetFromAbove",
      ].sort(),
    );
    expect(off).toContain("base_primaries");
    expect(off).toContain("disable_primaries_adjustments");
  });

  it("hide the restore sliders, and keep the toggle and the attenuations, under reverse all", () => {
    const all = shown(AGX_TABS, AGX_DEFAULTS);
    const reversed = shown(AGX_TABS, { ...AGX_DEFAULTS, completely_reverse_primaries: true });
    expect(all.filter((k) => !reversed.includes(k)).sort()).toEqual(
      [
        ...["red", "green", "blue"].flatMap((c) => [`${c}_outset`, `${c}_unrotation`]),
        "master_outset_ratio", "master_unrotation_ratio",
      ].sort(),
    );
    expect(reversed).toContain("completely_reverse_primaries");
    expect(reversed).toContain("red_inset");
  });

  it("grey out set from above under reverse all, as darktable does, instead of hiding it", () => {
    const reversed = { ...AGX_DEFAULTS, completely_reverse_primaries: true };
    const button = controlsOf(AGX_TABS).find((c) => c.kind === "action" && c.id === "agxSetFromAbove");
    if (button?.kind !== "action" || !button.enabled) throw new Error("set from above has no enabled predicate");
    expect(button.when).toBeUndefined();
    expect(shown(AGX_TABS, reversed)).toContain("agxSetFromAbove");
    expect(button.enabled(AGX_DEFAULTS)).toBe(true);
    expect(button.enabled(reversed)).toBe(false);
    expect(shown(AGX_TABS, { ...AGX_DEFAULTS, disable_primaries_adjustments: true })).not.toContain("agxSetFromAbove");
  });
});

describe("filmic controls", () => {
  it("show every declared param once, latitude and balance through highlights and shadows", () => {
    const keys = keysOf(FILMIC_TABS);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.sort()).toEqual(Object.keys(FILMIC_PARAMS).filter((k) => k !== "latitude" && k !== "balance").sort());
    const directs = FILMIC_TABS.flatMap((t) => t.sections.flatMap((s) => s.controls)).filter((c) => c.kind === "direct");
    expect(directs.map((c) => (c.kind === "direct" ? c.side : ""))).toEqual(["shoulder", "toe"]);
  });

  it("give highlights and shadows Ansel's soft range of 0.1 to 90 % and default of 10 %", () => {
    const directs = controlsOf(FILMIC_TABS).flatMap((c) => (c.kind === "direct" ? [[c.min, c.max, c.reset]] : []));
    expect(directs).toEqual([[0.1, 90, 10], [0.1, 90, 10]]);
  });

  it("use Ansel's tabs, without reconstruct", () => {
    expect(FILMIC_TABS.map((t) => t.label)).toEqual(["Scene", "Look", "Display"]);
  });

  it("keep each slider's span inside the param's hard range", () => {
    expectSpansInsideHardRanges(FILMIC_TABS, FILMIC_PARAMS);
  });

  it("label every control with its param's upstream description, first letter capitalised", () => {
    expectUpstreamLabels(FILMIC_TABS, FILMIC_PARAMS);
    expectCapitalisedText(FILMIC_TABS);
  });

  it("show filmic's percent params as stored", () => {
    for (const c of slidersOf(FILMIC_TABS)) expect(c.scale, String(c.key)).toBe(1);
    const units = new Map(slidersOf(FILMIC_TABS).map((c) => [String(c.key), c.unit]));
    expect(units.get("white_point_source")).toBe("EV");
    expect(units.get("grey_point_source")).toBe("%");
    expect(units.get("contrast")).toBe("");
  });

  it("offer every colour science the extension renders and the four curve shapes", () => {
    const selects = new Map(controlsOf(FILMIC_TABS).flatMap((c) => (c.kind === "select" ? [[String(c.key), c.options] as const] : [])));
    expect(selects.get("version")?.map(([v]) => v)).toEqual([5, 6, 7, 8, 9]);
    expect(selects.get("highlights")?.map(([v]) => v)).toEqual([0, 1, 2, 3]);
    expect(selects.get("shadows")).toEqual(selects.get("highlights"));
    expect(selects.get("highlights")?.map(([, name]) => name)).toEqual(["Hard", "Soft", "Safe", "Perceptual"]);
    expect(selects.get("version")?.map(([, name]) => name)).toEqual([
      "V8 (AgX, no bleach)",
      "V8 (AgX, low bleach)",
      "V8 (AgX, medium bleach)",
      "V8 (AgX, high bleach)",
      "V8 (AgX, extra bleach)",
    ]);
    for (const [key, options] of selects) {
      const d = FILMIC_PARAMS[key as keyof typeof FILMIC_PARAMS];
      if (d.type === "bool") throw new Error(key);
      for (const [v] of options) expect(v >= d.min && v <= d.max, `${key} ${v}`).toBe(true);
    }
  });

  it("use Ansel's display tooltips and word the exposure and colour science ones for Safelight", () => {
    const tip = (key: string) => {
      const c = controlsOf(FILMIC_TABS).find((x) => "key" in x && x.key === key);
      return c && c.kind !== "graph" ? c.tooltip : "";
    };
    expect(tip("black_point_target")).toBe("Luminance of output pure black, this should be 0% except if you want a faded look");
    expect(tip("grey_point_target")).toBe("Middle gray value of the target display or color space. you should never touch that unless you know what you are doing.");
    expect(tip("white_point_target")).toBe("Luminance of output pure white, this should be 100% except if you want a faded look");
    expect(tip("custom_grey")).toBe("Enable to input custom middle-gray values. this is not recommended in general. fix the global exposure with the Exposure slider instead. disable to use standard 18.45 % middle gray.");
    expect(tip("version")).toContain("on the color preservation slider");
    expect(tip("version")).not.toContain("saturation slider");
  });

  it("carry the one action the panel runs", () => {
    const ids = controlsOf(FILMIC_TABS).flatMap((c) => (c.kind === "action" ? [c.id] : []));
    expect(ids).toEqual(["filmicAutoTune"]);
  });

  it("show hardness only with auto hardness off, and the grey points only with custom grey", () => {
    const base: FilmicParams = FILMIC_DEFAULTS;
    const now = shown(FILMIC_TABS, base);
    expect(now).not.toContain("output_power");
    expect(now).not.toContain("grey_point_source");
    expect(now).not.toContain("grey_point_target");
    expect(shown(FILMIC_TABS, { ...base, auto_hardness: false })).toContain("output_power");
    const custom = shown(FILMIC_TABS, { ...base, custom_grey: true });
    expect(custom).toContain("grey_point_source");
    expect(custom).toContain("grey_point_target");
  });
});
