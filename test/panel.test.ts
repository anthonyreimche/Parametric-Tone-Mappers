// @vitest-environment jsdom
// The Tone mapper panel: the switch when the photo uses another transform,
// each transform's tabs, sliders writing live and committing on release, the
// couplings, presets, the actions, and what's hidden when.

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { AGX_DEFAULTS, AGX_PARAMS } from "../src/agx/params";
import { AGX_ID, agxTransform } from "../src/agx/transform";
import { filmicPower } from "../src/filmic/derive";
import { FILMIC_DEFAULTS, FILMIC_PARAMS } from "../src/filmic/params";
import { FILMIC_ID, filmicTransform } from "../src/filmic/transform";
import { AUTO_NO_FRAME, AUTO_UNSUPPORTED, INACTIVE_HINT, OLDER_PROCESSING, TonePanel, resetActive } from "../src/panel/Panel";
import { agxPivotEv, filmicDirect } from "../src/panel/model";
import { AGX_PRESETS } from "../src/panel/presets";
import { readParams, unqualify } from "../src/param-table";
import { initRuntime } from "../src/runtime";
import type { DevelopParams, FloatFrame } from "../src/safelight";
import { fakeApi, frameOf, type Rig, type RigOptions } from "./support/fake-api";

let rig: Rig;

function mount(o: RigOptions, wrap: (panel: React.ReactElement) => React.ReactElement = (panel) => panel) {
  rig = fakeApi(o);
  // The host resolves a pick only while its transform is registered.
  rig.api.registerPipeline(agxTransform());
  rig.api.registerPipeline(filmicTransform());
  initRuntime(rig.api);
  return render(wrap(React.createElement(TonePanel)));
}

const bag = () => rig.develop.getState().paramBag;
const slider = (label: RegExp) => screen.getByRole("slider", { name: label });
const field = (label: string) => screen.getByRole("textbox", { name: label }) as HTMLInputElement;
const button = (name: string) => screen.getByRole("button", { name }) as HTMLButtonElement;
const agxBag = () => readParams(AGX_PARAMS, unqualify(AGX_ID, bag()));
const filmicBag = () => readParams(FILMIC_PARAMS, unqualify(FILMIC_ID, bag()));
const pick = (id: string) => act(() => rig.develop.getState().setParam("displayTransform", id));
const setExposure = (exposure: number) =>
  act(() => rig.develop.setState((s) => ({ params: { ...s.params, exposure } as DevelopParams })));
/** Types into a slider's value field one keystroke at a time, as the core's field passes them on, then leaves it. */
const type = (label: string, keystrokes: readonly string[]) => {
  for (const text of keystrokes) fireEvent.change(field(label), { target: { value: text } });
  fireEvent.blur(field(label));
};
const tuneFrame = () => frameOf(2, 1, (x) => (x === 0 ? [0.0045, 0.01, 0.02] : [2.88, 1, 0.5]));

afterEach(cleanup);

describe("a photo on another transform", () => {
  it("offers both transforms, each one undo step", () => {
    mount({ displayTransform: "rendering.aces" });
    expect(screen.getByText(INACTIVE_HINT)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Use AgX (parametric)" }));
    expect(rig.develop.getState().params.displayTransform).toBe(AGX_ID);
    expect(rig.commits).toEqual(["Display transform"]);
  });

  it("switches to filmic the same way", () => {
    mount({ displayTransform: null });
    fireEvent.click(screen.getByRole("button", { name: "Use Filmic RGB (parametric)" }));
    expect(rig.develop.getState().params.displayTransform).toBe(FILMIC_ID);
    expect(rig.commits).toEqual(["Display transform"]);
  });

  it("shows no settings, and treats a pick that is no longer registered as another transform", () => {
    mount({ displayTransform: "gone.transform" });
    expect(screen.getByText(INACTIVE_HINT)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Settings" })).toBeNull();
    expect(screen.queryByRole("slider")).toBeNull();
  });

  it("shows the settings of the Preferences default for a photo without a pick", () => {
    mount({ displayTransform: null, defaultTransform: AGX_ID });
    expect(screen.queryByText(INACTIVE_HINT)).toBeNull();
    expect(screen.getByRole("button", { name: "Settings" })).toBeTruthy();
  });

  it("follows a change of the Preferences default on a photo without a pick", () => {
    mount({ displayTransform: null });
    expect(screen.getByText(INACTIVE_HINT)).toBeTruthy();
    act(() => rig.api.stores.usePipelineStore.setState({ activeId: AGX_ID }));
    expect(screen.getByRole("button", { name: "Settings" })).toBeTruthy();
  });

  it("starts afresh when the photo changes transform", async () => {
    mount({ displayTransform: AGX_ID, frame: null });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Auto tune levels" })));
    expect(screen.getByText(AUTO_NO_FRAME)).toBeTruthy();
    pick(FILMIC_ID);
    expect(screen.queryByText(AUTO_NO_FRAME)).toBeNull();
    expect(screen.getByRole("button", { name: "Scene" })).toBeTruthy();
  });

  it("starts afresh when another photo opens", async () => {
    mount({ displayTransform: AGX_ID, frame: null });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Auto tune levels" })));
    act(() => rig.develop.setState({ photoId: "p2" }));
    expect(screen.queryByText(AUTO_NO_FRAME)).toBeNull();
  });

  it("couples a gesture on the next photo from that photo's values, not the last one's", () => {
    mount({ displayTransform: AGX_ID, bag: { [`${AGX_ID}.range_white_relative_ev`]: 9 } });
    fireEvent.change(field("White relative exposure (EV) value"), { target: { value: "8" } });
    act(() => rig.develop.setState({ photoId: "p2", paramBag: {} }));
    type("Black relative exposure (EV) value", ["-12"]);
    expect(agxPivotEv(agxBag())).toBeCloseTo(0, 9);
  });

  it("doesn't draw again for a core edit it doesn't show", () => {
    let draws = 0;
    mount({ displayTransform: AGX_ID }, (panel) => React.createElement(React.Profiler, { id: "panel", onRender: () => draws++ }, panel));
    const before = draws;
    setExposure(1.5);
    expect(draws).toBe(before);
  });
});

describe("AgX", () => {
  it("shows darktable's tabs and writes a slider live, committing on release", () => {
    mount({ displayTransform: AGX_ID });
    expect(screen.getByRole("button", { name: "Settings" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Primaries" })).toBeTruthy();
    fireEvent.change(slider(/^White relative exposure/), { target: { value: "8" } });
    expect(bag()[`${AGX_ID}.range_white_relative_ev`]).toBe(8);
    expect(rig.commits).toEqual([]);
    fireEvent.mouseUp(slider(/^White relative exposure/));
    expect(rig.commits).toEqual(["White relative exposure"]);
  });

  it("keeps the pivot's EV when black moves, and commits the drag once", () => {
    mount({ displayTransform: AGX_ID });
    for (const ev of ["-12", "-13", "-14"]) fireEvent.change(slider(/^Black relative exposure/), { target: { value: ev } });
    expect(rig.commits).toEqual([]);
    fireEvent.mouseUp(slider(/^Black relative exposure/));
    expect(bag()[`${AGX_ID}.range_black_relative_ev`]).toBe(-14);
    expect(agxPivotEv(agxBag())).toBeCloseTo(0, 9);
    expect(rig.commits).toEqual(["Black relative exposure"]);
  });

  it("holds a white typed past its hard range before keeping the pivot's EV", () => {
    mount({ displayTransform: AGX_ID });
    type("White relative exposure (EV) value", ["2", "25"]);
    expect(bag()[`${AGX_ID}.range_white_relative_ev`]).toBe(20);
    expect(agxPivotEv(agxBag())).toBeCloseTo(0, 9);
  });

  it("rescales the ends as its hard max does for a scaling typed past it", () => {
    mount({ displayTransform: AGX_ID });
    type("Dynamic range scaling (%) value", ["300"]);
    expect(bag()[`${AGX_ID}.dynamic_range_scaling`]).toBe(2);
    expect(bag()[`${AGX_ID}.range_white_relative_ev`]).toBeCloseTo(6.5 * (3 / 1.1), 9);
    expect(bag()[`${AGX_ID}.range_black_relative_ev`]).toBe(-20);
    expect(agxPivotEv(agxBag())).toBeCloseTo(0, 9);
  });

  it("keeps the pivot's EV through every keystroke of a typed black, in one undo step", () => {
    mount({ displayTransform: AGX_ID });
    type("Black relative exposure (EV) value", ["-", "-0", "-0.", "-0.5"]);
    expect(bag()[`${AGX_ID}.range_black_relative_ev`]).toBe(-0.5);
    expect(agxPivotEv(agxBag())).toBeCloseTo(0, 9);
    expect(rig.commits).toEqual(["Black relative exposure"]);
  });

  it("lands a drag of the dynamic range scaling where one jump to its last value would", () => {
    const tuned = { [`${AGX_ID}.range_black_relative_ev`]: -18, [`${AGX_ID}.range_white_relative_ev`]: 18 };
    mount({ displayTransform: AGX_ID, bag: tuned });
    // At 50 % both ends pass their hard range; the drag doesn't keep what that held them to.
    for (const percent of ["50", "20"]) fireEvent.change(slider(/^Dynamic range scaling/), { target: { value: percent } });
    fireEvent.mouseUp(slider(/^Dynamic range scaling/));
    const dragged = agxBag();
    cleanup();
    mount({ displayTransform: AGX_ID, bag: tuned });
    fireEvent.change(slider(/^Dynamic range scaling/), { target: { value: "20" } });
    expect(dragged).toEqual(agxBag());
    expect(dragged.range_black_relative_ev).toBeCloseTo(-18 * (1.2 / 1.1), 9);
  });

  it("starts each gesture from where the one before it left off, the pivot's included", () => {
    mount({ displayTransform: AGX_ID });
    for (const [name, value] of [[/^White relative exposure/, "8"], [/^Pivot relative exposure/, "2"], [/^Black relative exposure/, "-12"]] as const) {
      fireEvent.change(slider(name), { target: { value } });
      fireEvent.mouseUp(slider(name));
    }
    expect(agxPivotEv(agxBag())).toBeCloseTo(2, 9);
    expect(agxBag().range_white_relative_ev).toBe(8);
    expect(rig.commits).toEqual(["White relative exposure", "Pivot relative exposure", "Black relative exposure"]);
  });

  // A gesture that ends on its start value keeps nothing an earlier frame coupled: the bag is the start's,
  // which stores the value, so the commit records nothing.
  describe("a gesture that ends where it started", () => {
    it("leaves the pivot when the black is retyped to its start", () => {
      const start = { [`${AGX_ID}.range_black_relative_ev`]: -10 };
      mount({ displayTransform: AGX_ID, bag: start });
      type("Black relative exposure (EV) value", ["-", "-1", "-10"]);
      expect(agxPivotEv(agxBag())).toBeCloseTo(0, 9);
      expect(bag()).toEqual(start);
      expect(rig.commits).toEqual([]);
    });

    it("puts the ends back after a dynamic range scaling drag out and back", () => {
      const start = { [`${AGX_ID}.dynamic_range_scaling`]: 0.1 };
      mount({ displayTransform: AGX_ID, bag: start });
      for (const percent of ["50", "10"]) fireEvent.change(slider(/^Dynamic range scaling/), { target: { value: percent } });
      fireEvent.mouseUp(slider(/^Dynamic range scaling/));
      expect([agxBag().range_black_relative_ev, agxBag().range_white_relative_ev]).toEqual([-10, 6.5]);
      expect(bag()).toEqual(start);
      expect(rig.commits).toEqual([]);
    });

    it("leaves the pivot when a white at its hard max is typed past it again", () => {
      const start = { [`${AGX_ID}.range_white_relative_ev`]: 20, [`${AGX_ID}.curve_pivot_x`]: 10 / 30 };
      mount({ displayTransform: AGX_ID, bag: start });
      type("White relative exposure (EV) value", ["2", "25"]);
      expect(agxPivotEv(agxBag())).toBeCloseTo(0, 9);
      expect(bag()).toEqual(start);
      expect(rig.commits).toEqual([]);
    });
  });

  it("records no undo step for a value field left without a change", () => {
    mount({ displayTransform: AGX_ID });
    fireEvent.blur(field("White relative exposure (EV) value"));
    expect(rig.commits).toEqual([]);
  });

  it("shows percentages of the stored ratios", () => {
    mount({ displayTransform: AGX_ID, bag: { [`${AGX_ID}.dynamic_range_scaling`]: 0.25 } });
    expect(Number((slider(/^Dynamic range scaling/) as HTMLInputElement).value)).toBeCloseTo(25, 9);
  });

  it("rounds a converted value to the slider's step, leaving the stored one alone", () => {
    mount({ displayTransform: AGX_ID });
    fireEvent.click(screen.getByRole("button", { name: "Primaries" }));
    expect(field("Red attenuation (%) value").value).toBe("+29.46");
    expect(field("Red rotation (°) value").value).toBe("+2.03");
    expect(bag()[`${AGX_ID}.red_inset`]).toBeUndefined();
  });

  it("holds a typed value past the slider to the param's hard range", () => {
    mount({ displayTransform: AGX_ID });
    fireEvent.click(screen.getByRole("button", { name: "Primaries" }));
    fireEvent.change(field("Red attenuation (%) value"), { target: { value: "150" } });
    expect(bag()[`${AGX_ID}.red_inset`]).toBe(0.99);
    expect(rig.commits).toEqual([]);
    fireEvent.blur(field("Red attenuation (%) value"));
    expect(rig.commits).toEqual(["Red attenuation"]);
  });

  it("widens a slider to a stored value past its soft range instead of pulling it back", () => {
    mount({ displayTransform: AGX_ID, bag: { [`${AGX_ID}.range_white_relative_ev`]: 12 } });
    const white = slider(/^White relative exposure/) as HTMLInputElement;
    expect(Number(white.value)).toBe(12);
    expect([white.min, white.max]).toEqual(["1", "12"]);
    expect(field("White relative exposure (EV) value").value).toBe("+12");
    const black = slider(/^Black relative exposure/) as HTMLInputElement;
    expect([black.min, black.max]).toEqual(["-20", "-1"]);
  });

  it("applies a preset in one undo step", () => {
    mount({ displayTransform: AGX_ID });
    fireEvent.change(screen.getByRole("combobox", { name: "Preset" }), { target: { value: "classic | punchy" } });
    expect(bag()[`${AGX_ID}.look_saturation`]).toBe(1.4);
    expect(rig.commits).toEqual(["AgX preset: classic | punchy"]);
  });

  it("lands a preset's own ends and pivot under another dynamic range scaling", () => {
    mount({
      displayTransform: AGX_ID,
      bag: {
        [`${AGX_ID}.dynamic_range_scaling`]: 0.25,
        [`${AGX_ID}.range_black_relative_ev`]: -8,
        [`${AGX_ID}.range_white_relative_ev`]: 5,
        [`${AGX_ID}.curve_pivot_x`]: 0.3,
        [`${AGX_ID}.auto_gamma`]: true,
      },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Preset" }), { target: { value: "classic | base" } });
    const preset = AGX_PRESETS.find((x) => x.name === "classic | base")!;
    expect(preset.params.dynamic_range_scaling).not.toBe(0.25);
    expect(agxBag()).toEqual(preset.params);
  });

  it("resets the primaries from the Primaries tab in one undo step", () => {
    mount({ displayTransform: AGX_ID });
    fireEvent.click(screen.getByRole("button", { name: "Primaries" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Reset primaries" }), { target: { value: "unmodified" } });
    expect(bag()[`${AGX_ID}.red_inset`]).toBe(0);
    expect(rig.commits).toEqual(["AgX reset primaries: unmodified"]);
  });

  it("offers Reset primaries on the Primaries tab only", () => {
    mount({ displayTransform: AGX_ID });
    expect(screen.queryByRole("combobox", { name: "Reset primaries" })).toBeNull();
  });

  it("resets a primaries slider to zero on a double-click, not to the shipped value", () => {
    mount({ displayTransform: AGX_ID });
    fireEvent.click(screen.getByRole("button", { name: "Primaries" }));
    fireEvent.doubleClick(slider(/^Red attenuation/));
    expect(bag()[`${AGX_ID}.red_inset`]).toBe(0);
    expect(rig.commits).toEqual(["Red attenuation"]);
  });

  it("resets a slider that has no reset value to the shipped one", () => {
    mount({ displayTransform: AGX_ID, bag: { [`${AGX_ID}.look_slope`]: 1.6 } });
    fireEvent.click(screen.getByRole("button", { name: "Show look" }));
    fireEvent.doubleClick(slider(/^Slope/));
    expect(bag()[`${AGX_ID}.look_slope`]).toBe(AGX_DEFAULTS.look_slope);
  });

  it("resets the pivot to mid-gray on a double-click", () => {
    mount({ displayTransform: AGX_ID, bag: { [`${AGX_ID}.curve_pivot_x`]: 0.8 } });
    fireEvent.doubleClick(slider(/^Pivot relative exposure/));
    expect(agxPivotEv({ ...AGX_DEFAULTS, curve_pivot_x: bag()[`${AGX_ID}.curve_pivot_x`] as number })).toBeCloseTo(0, 9);
  });

  it("shows an export-profile base primaries as Rec2020", () => {
    mount({ displayTransform: AGX_ID, bag: { [`${AGX_ID}.base_primaries`]: 0 } });
    fireEvent.click(screen.getByRole("button", { name: "Primaries" }));
    const base = screen.getByRole("combobox", { name: "Base primaries" }) as HTMLSelectElement;
    expect(base.value).toBe("2");
    expect([...base.options].map((o) => o.text)).not.toContain("Export profile");
  });

  it("hides curve y gamma while the pivot stays on the diagonal", () => {
    mount({ displayTransform: AGX_ID, bag: { [`${AGX_ID}.auto_gamma`]: true } });
    fireEvent.click(screen.getByRole("button", { name: "Show advanced curve parameters" }));
    expect(screen.queryByRole("slider", { name: /^Curve y gamma/ })).toBeNull();
  });

  it("shows curve y gamma once the pivot may leave the diagonal", () => {
    mount({ displayTransform: AGX_ID, bag: { [`${AGX_ID}.auto_gamma`]: false } });
    fireEvent.click(screen.getByRole("button", { name: "Show advanced curve parameters" }));
    expect(screen.getByRole("slider", { name: /^Curve y gamma/ })).toBeTruthy();
  });

  it("makes the gamma follow the pivot when the diagonal is kept", () => {
    mount({ displayTransform: AGX_ID, bag: { [`${AGX_ID}.auto_gamma`]: true } });
    fireEvent.change(slider(/^Pivot target output/), { target: { value: "30" } });
    expect(bag()[`${AGX_ID}.curve_gamma`]).toBeCloseTo(Math.log2(0.3) / Math.log2(AGX_DEFAULTS.curve_pivot_x), 9);
  });

  it("rescales both ends with the dynamic range scaling, keeping the pivot's EV, and commits the drag once", () => {
    mount({ displayTransform: AGX_ID });
    for (const percent of ["25", "40", "20"]) fireEvent.change(slider(/^Dynamic range scaling/), { target: { value: percent } });
    expect(rig.commits).toEqual([]);
    fireEvent.mouseUp(slider(/^Dynamic range scaling/));
    // Each step scales by (1 + new) / (1 + previous), so three steps from 10 % land where one would.
    const grown = 1.2 / 1.1;
    expect(bag()[`${AGX_ID}.range_black_relative_ev`]).toBeCloseTo(-10 * grown, 9);
    expect(bag()[`${AGX_ID}.range_white_relative_ev`]).toBeCloseTo(6.5 * grown, 9);
    expect(agxPivotEv(agxBag())).toBeCloseTo(0, 9);
    expect(rig.commits).toEqual(["Dynamic range scaling"]);
  });

  it("hides the primaries' sliders when adjustments are off", () => {
    mount({ displayTransform: AGX_ID, bag: { [`${AGX_ID}.disable_primaries_adjustments`]: true } });
    fireEvent.click(screen.getByRole("button", { name: "Primaries" }));
    expect(screen.queryByRole("slider", { name: /^Red attenuation/ })).toBeNull();
  });

  it("greys out Set from above, rather than hiding it, under Reverse all", () => {
    mount({ displayTransform: AGX_ID, bag: { [`${AGX_ID}.completely_reverse_primaries`]: true } });
    fireEvent.click(screen.getByRole("button", { name: "Primaries" }));
    const set = button("Set from above");
    expect(set.disabled).toBe(true);
    fireEvent.click(set);
    expect(rig.commits).toEqual([]);
    expect(screen.queryByRole("slider", { name: /^Master purity boost/ })).toBeNull();
  });

  it("restores the purity from the attenuation with Set from above, in one undo step", () => {
    mount({ displayTransform: AGX_ID });
    fireEvent.click(screen.getByRole("button", { name: "Primaries" }));
    expect(button("Set from above").disabled).toBe(false);
    fireEvent.click(button("Set from above"));
    expect(bag()[`${AGX_ID}.red_outset`]).toBe(AGX_DEFAULTS.red_inset);
    expect(bag()[`${AGX_ID}.blue_unrotation`]).toBe(AGX_DEFAULTS.blue_rotation);
    expect(bag()[`${AGX_ID}.master_unrotation_ratio`]).toBe(1);
    expect(rig.commits).toEqual(["AgX set from above"]);
  });

  it("switches a toggle and commits at once", () => {
    mount({ displayTransform: AGX_ID });
    fireEvent.click(screen.getByRole("button", { name: "Primaries" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Reverse all" }));
    expect(bag()[`${AGX_ID}.completely_reverse_primaries`]).toBe(true);
    expect(rig.commits).toEqual(["Reverse all"]);
  });

  it("draws the curve in the Show curve section, whose toggle is named for the curve", () => {
    mount({ displayTransform: AGX_ID });
    expect(screen.queryByRole("img", { name: "Curve" })).toBeNull();
    fireEvent.click(button("Show curve"));
    expect(screen.getByRole("img", { name: "Curve" })).toBeTruthy();
    fireEvent.click(button("Hide curve"));
    expect(screen.queryByRole("img", { name: "Curve" })).toBeNull();
    expect(button("Show curve")).toBeTruthy();
  });

  it("remembers the tab and the opened sections", () => {
    mount({ displayTransform: AGX_ID });
    fireEvent.click(screen.getByRole("button", { name: "Show look" }));
    fireEvent.click(screen.getByRole("button", { name: "Primaries" }));
    cleanup();
    render(React.createElement(TonePanel));
    expect(screen.getByRole("slider", { name: /^Red attenuation/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByRole("slider", { name: /^Slope/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Hide look" })).toBeTruthy();
  });

  it("tunes the levels from the scene", async () => {
    mount({ displayTransform: AGX_ID, frame: tuneFrame() });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Auto tune levels" })));
    expect(bag()[`${AGX_ID}.range_white_relative_ev`]).toBeCloseTo(Math.log2(Math.fround(2.88) / 0.18) * 1.1, 5);
    expect(rig.commits).toEqual(["AgX auto tune levels"]);
  });

  it("tunes against the params as they are when the measurement lands", async () => {
    mount({ displayTransform: AGX_ID, frame: tuneFrame() });
    fireEvent.click(screen.getByRole("button", { name: "Auto tune levels" }));
    act(() => rig.develop.getState().setDynParams({ [`${AGX_ID}.dynamic_range_scaling`]: 0.5 }));
    await act(async () => {});
    expect(bag()[`${AGX_ID}.range_white_relative_ev`]).toBeCloseTo(Math.log2(Math.fround(2.88) / 0.18) * 1.5, 5);
  });

  it("drops an auto tune whose capture lands after the photo changed", async () => {
    let land!: (frame: FloatFrame | null) => void;
    const landing = new Promise<FloatFrame | null>((resolve) => (land = resolve));
    mount({ displayTransform: AGX_ID, frame: landing });
    fireEvent.click(screen.getByRole("button", { name: "Auto tune levels" }));
    act(() => rig.develop.setState({ photoId: "p2" }));
    await act(async () => land(tuneFrame()));
    expect(bag()).toEqual({});
    expect(rig.commits).toEqual([]);
  });

  it("says nothing of a capture that found nothing once the photo has changed", async () => {
    let land!: (frame: FloatFrame | null) => void;
    const landing = new Promise<FloatFrame | null>((resolve) => (land = resolve));
    mount({ displayTransform: AGX_ID, frame: landing });
    fireEvent.click(screen.getByRole("button", { name: "Auto tune levels" }));
    act(() => rig.develop.setState({ photoId: "p2" }));
    await act(async () => land(null));
    expect(screen.queryByText(AUTO_NO_FRAME)).toBeNull();
  });

  it("tunes when the capture lands on the same photo", async () => {
    let land!: (frame: FloatFrame | null) => void;
    const landing = new Promise<FloatFrame | null>((resolve) => (land = resolve));
    mount({ displayTransform: AGX_ID, frame: landing });
    fireEvent.click(screen.getByRole("button", { name: "Auto tune levels" }));
    await act(async () => land(tuneFrame()));
    expect(rig.commits).toEqual(["AgX auto tune levels"]);
  });

  it("drops an auto tune whose capture lands after the photo switched transform", async () => {
    let land!: (frame: FloatFrame | null) => void;
    const landing = new Promise<FloatFrame | null>((resolve) => (land = resolve));
    mount({ displayTransform: AGX_ID, frame: landing });
    fireEvent.click(screen.getByRole("button", { name: "Auto tune levels" }));
    pick(FILMIC_ID);
    await act(async () => land(tuneFrame()));
    expect(bag()).toEqual({});
    expect(rig.commits).toEqual([]);
  });

  it("says there is nothing to measure when the capture fails, and writes nothing", async () => {
    mount({ displayTransform: AGX_ID, frame: "fails" });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Auto tune levels" })));
    expect(screen.getByText(AUTO_NO_FRAME)).toBeTruthy();
    expect(bag()).toEqual({});
    expect(rig.commits).toEqual([]);
  });

  it("disables auto tune, saying why, on a core without the scene point", () => {
    mount({ displayTransform: AGX_ID, frame: "missing" });
    const tune = button("Auto tune levels");
    expect(tune.disabled).toBe(true);
    expect(tune.title).toBe(AUTO_UNSUPPORTED);
  });

  it("says when there is no frame to measure", async () => {
    mount({ displayTransform: AGX_ID, frame: null });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Auto tune levels" })));
    expect(screen.getByText(AUTO_NO_FRAME)).toBeTruthy();
    expect(rig.commits).toEqual([]);
  });

  it("reads the photo's Exposure", () => {
    mount({ displayTransform: AGX_ID, exposure: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Read exposure" }));
    expect(bag()[`${AGX_ID}.range_white_relative_ev`]).toBeCloseTo(4.8 * 1.1, 9);
    expect(rig.commits).toEqual(["AgX read exposure"]);
  });

  it("reads the Exposure as it is at the click", () => {
    mount({ displayTransform: AGX_ID, exposure: 0 });
    setExposure(1);
    fireEvent.click(screen.getByRole("button", { name: "Read exposure" }));
    expect(bag()[`${AGX_ID}.range_white_relative_ev`]).toBeCloseTo(4.8 * 1.1, 9);
  });

  it("makes the gamma follow the pivot after reading the exposure when the diagonal is kept", () => {
    mount({ displayTransform: AGX_ID, exposure: 1, bag: { [`${AGX_ID}.auto_gamma`]: true } });
    fireEvent.click(screen.getByRole("button", { name: "Read exposure" }));
    const x = bag()[`${AGX_ID}.curve_pivot_x`] as number;
    expect(bag()[`${AGX_ID}.curve_gamma`]).toBeCloseTo(Math.log2(AGX_DEFAULTS.curve_pivot_y_linear_output) / Math.log2(x), 9);
  });

  it("resets to darktable's defaults, in one undo step", () => {
    mount({ displayTransform: AGX_ID, bag: { [`${AGX_ID}.look_saturation`]: 1.7, [`${AGX_ID}.range_white_relative_ev`]: 9 } });
    act(() => resetActive());
    expect(agxBag()).toEqual(AGX_DEFAULTS);
    expect(bag()[`${AGX_ID}.look_saturation`]).toBe(AGX_DEFAULTS.look_saturation);
    expect(rig.commits).toEqual(["AgX reset"]);
  });
});

describe("filmic", () => {
  // Pixels at 1/16 and 1: the mean 0.53125 puts a custom grey at 26.5625 %.
  const SPREAD = frameOf(2, 1, (x) => (x === 0 ? [0.0625, 0.0625, 0.0625] : [1, 1, 1]));

  it("shows Ansel's tabs and stores highlights as latitude and balance", () => {
    mount({ displayTransform: FILMIC_ID });
    fireEvent.click(screen.getByRole("button", { name: "Look" }));
    fireEvent.change(slider(/^Highlights/), { target: { value: "40" } });
    expect(filmicDirect(filmicBag()).shoulder).toBeCloseTo(40, 3);
    expect(rig.commits).toEqual([]);
    fireEvent.mouseUp(slider(/^Highlights/));
    expect(rig.commits).toEqual(["Highlights"]);
  });

  it("keeps the shadows when highlights move", () => {
    mount({ displayTransform: FILMIC_ID });
    fireEvent.click(screen.getByRole("button", { name: "Look" }));
    const before = filmicDirect(filmicBag()).toe;
    fireEvent.change(slider(/^Highlights/), { target: { value: "40" } });
    expect(filmicDirect(filmicBag()).toe).toBeCloseTo(before, 3);
  });

  it("draws the curve on the Look tab", () => {
    mount({ displayTransform: FILMIC_ID });
    fireEvent.click(screen.getByRole("button", { name: "Look" }));
    expect(screen.getByRole("img", { name: "Curve" })).toBeTruthy();
  });

  it("hides hardness while it's automatic", () => {
    mount({ displayTransform: FILMIC_ID });
    fireEvent.click(screen.getByRole("button", { name: "Look" }));
    expect(screen.queryByRole("slider", { name: /^Hardness/ })).toBeNull();
  });

  it("switches automatic hardness off at the power that rendered, and shows the slider", () => {
    const stored = { [`${FILMIC_ID}.white_point_source`]: 4, [`${FILMIC_ID}.output_power`]: 3 };
    mount({ displayTransform: FILMIC_ID, bag: stored });
    fireEvent.click(screen.getByRole("button", { name: "Look" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Auto adjust hardness" }));
    const rendered = filmicPower({ ...FILMIC_DEFAULTS, white_point_source: 4, output_power: 3 });
    expect(rendered).not.toBeCloseTo(3, 3);
    expect(filmicBag().auto_hardness).toBe(false);
    expect(filmicBag().output_power).toBeCloseTo(rendered, 9);
    expect(slider(/^Hardness/)).toBeTruthy();
    expect(rig.commits).toEqual(["Auto adjust hardness"]);
  });

  it("rescales both ends with the dynamic range scaling, re-derives the hardness, and commits the drag once", () => {
    mount({ displayTransform: FILMIC_ID });
    for (const percent of ["20", "30", "10"]) fireEvent.change(slider(/^Dynamic range scaling/), { target: { value: percent } });
    expect(rig.commits).toEqual([]);
    fireEvent.mouseUp(slider(/^Dynamic range scaling/));
    const now = filmicBag();
    expect(now.black_point_source).toBeCloseTo(FILMIC_DEFAULTS.black_point_source * 1.1, 9);
    expect(now.white_point_source).toBeCloseTo(FILMIC_DEFAULTS.white_point_source * 1.1, 9);
    expect(now.output_power).toBeCloseTo(filmicPower({ ...now, auto_hardness: true }), 9);
    expect(rig.commits).toEqual(["Dynamic range scaling"]);
  });

  it("rescales the ends as -50 % does for a scaling typed past it", () => {
    mount({ displayTransform: FILMIC_ID });
    type("Dynamic range scaling (%) value", ["-", "-1", "-10", "-100"]);
    const now = filmicBag();
    expect(now.security_factor).toBe(-50);
    expect(now.black_point_source).toBeCloseTo(FILMIC_DEFAULTS.black_point_source * 0.5, 9);
    expect(now.white_point_source).toBeCloseTo(FILMIC_DEFAULTS.white_point_source * 0.5, 9);
  });

  it("couples a typed middle gray from the values before the typing, in one undo step", () => {
    mount({ displayTransform: FILMIC_ID, bag: { [`${FILMIC_ID}.custom_grey`]: true } });
    type("Middle gray luminance (%) value", ["0", "0.", "0.5"]);
    const shift = Math.log2(FILMIC_DEFAULTS.grey_point_source / 0.5);
    const now = filmicBag();
    expect(now.grey_point_source).toBe(0.5);
    expect(now.black_point_source).toBeCloseTo(FILMIC_DEFAULTS.black_point_source - shift, 9);
    expect(now.white_point_source).toBeCloseTo(FILMIC_DEFAULTS.white_point_source + shift, 9);
    expect(rig.commits).toEqual(["Middle gray luminance"]);
  });

  // As for AgX's; auto hardness writes the hardness with every scene write, so the start stores the one it keeps.
  describe("a gesture that ends where it started", () => {
    const ends = () => [filmicBag().black_point_source, filmicBag().white_point_source];

    it("puts the ends back after a dynamic range scaling drag out and back", () => {
      const start = { [`${FILMIC_ID}.security_factor`]: 0, [`${FILMIC_ID}.output_power`]: filmicPower(FILMIC_DEFAULTS) };
      mount({ displayTransform: FILMIC_ID, bag: start });
      for (const percent of ["30", "0"]) fireEvent.change(slider(/^Dynamic range scaling/), { target: { value: percent } });
      fireEvent.mouseUp(slider(/^Dynamic range scaling/));
      expect(ends()).toEqual([FILMIC_DEFAULTS.black_point_source, FILMIC_DEFAULTS.white_point_source]);
      expect(bag()).toEqual(start);
      expect(rig.commits).toEqual([]);
    });

    it("leaves the ends unshifted when the middle gray is retyped to its start", () => {
      const start = {
        [`${FILMIC_ID}.custom_grey`]: true,
        [`${FILMIC_ID}.grey_point_source`]: 18.45,
        [`${FILMIC_ID}.output_power`]: filmicPower(FILMIC_DEFAULTS),
      };
      mount({ displayTransform: FILMIC_ID, bag: start });
      type("Middle gray luminance (%) value", ["1", "18", "18.", "18.4", "18.45"]);
      expect(ends()).toEqual([FILMIC_DEFAULTS.black_point_source, FILMIC_DEFAULTS.white_point_source]);
      expect(bag()).toEqual(start);
      expect(rig.commits).toEqual([]);
    });
  });

  it("tunes the levels from the scene", async () => {
    mount({ displayTransform: FILMIC_ID, frame: SPREAD });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Auto tune levels" })));
    expect(filmicBag().white_point_source).toBeCloseTo(Math.log2(1 / 0.1845), 9);
    expect(filmicBag().black_point_source).toBeCloseTo(Math.log2(0.0625 / 0.1845), 9);
    expect(rig.commits).toEqual(["Filmic auto tune levels"]);
  });

  it("keeps the tuned ends under a custom grey, which the grey coupling would shift", async () => {
    mount({ displayTransform: FILMIC_ID, frame: SPREAD, bag: { [`${FILMIC_ID}.custom_grey`]: true } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Auto tune levels" })));
    const now = filmicBag();
    expect(now.grey_point_source).toBeCloseTo(26.5625, 9);
    expect(now.white_point_source).toBeCloseTo(Math.log2(1 / 0.265625), 9);
    expect(now.black_point_source).toBeCloseTo(Math.log2(0.0625 / 0.265625), 9);
    expect(now.output_power).toBeCloseTo(filmicPower({ ...now, auto_hardness: true }), 9);
  });

  it("hides the middle gray sliders until custom values are on", () => {
    mount({ displayTransform: FILMIC_ID });
    expect(screen.queryByRole("slider", { name: /^Middle gray luminance/ })).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: "Use custom middle-gray values" }));
    expect(screen.getByRole("slider", { name: /^Middle gray luminance/ })).toBeTruthy();
  });

  it("offers neither presets nor primaries resets", () => {
    mount({ displayTransform: FILMIC_ID });
    expect(screen.queryByRole("combobox", { name: "Preset" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Reset primaries" })).toBeNull();
  });

  it("resets to Ansel's defaults, in one undo step", () => {
    mount({ displayTransform: FILMIC_ID, bag: { [`${FILMIC_ID}.contrast`]: 2, [`${FILMIC_ID}.custom_grey`]: true } });
    act(() => resetActive());
    expect(filmicBag()).toEqual(FILMIC_DEFAULTS);
    expect(rig.commits).toEqual(["Filmic reset"]);
  });

  it("remembers its own tab apart from AgX's", () => {
    mount({ displayTransform: FILMIC_ID });
    fireEvent.click(screen.getByRole("button", { name: "Look" }));
    pick(AGX_ID);
    expect(screen.getByRole("button", { name: "Primaries" })).toBeTruthy();
    expect(screen.getByRole("slider", { name: /^White relative exposure/ })).toBeTruthy();
    pick(FILMIC_ID);
    expect(screen.getByRole("slider", { name: /^Contrast/ })).toBeTruthy();
  });
});

describe("resetActive", () => {
  it("leaves a photo on another transform alone", () => {
    mount({ displayTransform: "rendering.aces", bag: { [`${AGX_ID}.look_saturation`]: 1.7 } });
    act(() => resetActive());
    expect(bag()[`${AGX_ID}.look_saturation`]).toBe(1.7);
    expect(rig.commits).toEqual([]);
  });
});

describe("older processing", () => {
  it("says the core shoulder still applies", () => {
    mount({ displayTransform: AGX_ID, processVersion: 1 });
    expect(screen.getByText(OLDER_PROCESSING)).toBeTruthy();
  });

  it("says nothing on the current processing", () => {
    mount({ displayTransform: AGX_ID, processVersion: 2 });
    expect(screen.queryByText(OLDER_PROCESSING)).toBeNull();
  });
});
