// @vitest-environment jsdom
// The Tone mapper panel on a photo that renders with Sigmoid: darktable's
// controls with their units, what the colour processing hides, the presets,
// the curve, reset, and the switch from another transform.

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { agxTransform } from "../src/agx/transform";
import { filmicTransform } from "../src/filmic/transform";
import { INACTIVE_HINT, TonePanel, resetActive } from "../src/panel/Panel";
import { readParams, unqualify } from "../src/param-table";
import { initRuntime } from "../src/runtime";
import { SIGMOID_DEFAULTS, SIGMOID_PARAMS } from "../src/sigmoid/params";
import { SIGMOID_ID, sigmoidTransform } from "../src/sigmoid/transform";
import { SIGMOID_PRESETS } from "../src/panel/presets";
import { fakeApi, type Rig, type RigOptions } from "./support/fake-api";

let rig: Rig;

function mount(o: RigOptions) {
  rig = fakeApi(o);
  rig.api.registerPipeline(agxTransform());
  rig.api.registerPipeline(filmicTransform());
  rig.api.registerPipeline(sigmoidTransform());
  initRuntime(rig.api);
  return render(React.createElement(TonePanel));
}

const bag = () => rig.develop.getState().paramBag;
const sigmoidBag = () => readParams(SIGMOID_PARAMS, unqualify(SIGMOID_ID, bag()));
const slider = (label: RegExp) => screen.getByRole("slider", { name: label }) as HTMLInputElement;
const button = (name: string) => screen.getByRole("button", { name }) as HTMLButtonElement;
const combobox = (name: string) => screen.getByRole("combobox", { name }) as HTMLSelectElement;
const key = (k: string) => `${SIGMOID_ID}.${k}`;

afterEach(cleanup);

describe("a photo on another transform", () => {
  it("offers Sigmoid, one undo step", () => {
    mount({ displayTransform: "rendering.aces" });
    expect(screen.getByText(INACTIVE_HINT)).toBeTruthy();
    fireEvent.click(button("Use Sigmoid (parametric)"));
    expect(rig.develop.getState().params.displayTransform).toBe(SIGMOID_ID);
    expect(rig.commits).toEqual(["Display transform"]);
  });
});

describe("Sigmoid", () => {
  it("shows a Settings and a Primaries tab", () => {
    mount({ displayTransform: SIGMOID_ID });
    expect(button("Settings")).toBeTruthy();
    expect(button("Primaries")).toBeTruthy();
  });

  it("writes contrast live and commits it on release", () => {
    mount({ displayTransform: SIGMOID_ID });
    fireEvent.change(slider(/^Contrast/), { target: { value: "2.2" } });
    expect(bag()[key("middle_grey_contrast")]).toBe(2.2);
    expect(rig.commits).toEqual([]);
    fireEvent.mouseUp(slider(/^Contrast/));
    expect(rig.commits).toEqual(["Contrast"]);
  });

  it("lays contrast and skew over darktable's soft ranges", () => {
    mount({ displayTransform: SIGMOID_ID });
    expect([slider(/^Contrast/).min, slider(/^Contrast/).max]).toEqual(["0.7", "3"]);
    expect([slider(/^Skew/).min, slider(/^Skew/).max]).toEqual(["-1", "1"]);
  });

  it("shows preserve hue in percent, stored as darktable stores it", () => {
    mount({ displayTransform: SIGMOID_ID });
    fireEvent.change(slider(/^Preserve hue \(%\)/), { target: { value: "40" } });
    expect(bag()[key("hue_preservation")]).toBe(40);
  });

  it("hides preserve hue and the primaries for RGB ratio, as darktable does", () => {
    mount({ displayTransform: SIGMOID_ID });
    fireEvent.change(combobox("Colour processing"), { target: { value: "1" } });
    expect(bag()[key("color_processing")]).toBe(1);
    expect(rig.commits).toEqual(["Colour processing"]);
    expect(screen.queryByRole("slider", { name: /^Preserve hue/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Primaries" })).toBeNull();
  });

  it("returns to Settings when RGB ratio hides the Primaries tab it was on", () => {
    mount({ displayTransform: SIGMOID_ID });
    fireEvent.click(button("Primaries"));
    act(() => rig.develop.getState().setDynParams({ [key("color_processing")]: 1 }));
    expect(slider(/^Contrast/)).toBeTruthy();
  });

  it("shows the attenuations and purity in percent and the rotations in degrees", () => {
    mount({ displayTransform: SIGMOID_ID });
    fireEvent.click(button("Primaries"));
    fireEvent.change(slider(/^Red attenuation \(%\)/), { target: { value: "25" } });
    expect(bag()[key("red_inset")]).toBeCloseTo(0.25, 12);
    fireEvent.change(slider(/^Blue rotation \(°\)/), { target: { value: "-3" } });
    expect(bag()[key("blue_rotation")]).toBeCloseTo((-3 * Math.PI) / 180, 12);
    fireEvent.change(slider(/^Recover purity \(%\)/), { target: { value: "60" } });
    expect(bag()[key("purity")]).toBeCloseTo(0.6, 12);
  });

  // A range input steps from its min, so a span of ±0.4 rad (±22.918°) put every
  // dragged rotation 0.018° off the tenths, and 0° out of reach.
  it("spans the rotations inside darktable's ±0.4 rad, on a step grid through 0°", () => {
    mount({ displayTransform: SIGMOID_ID });
    fireEvent.click(button("Primaries"));
    for (const c of ["Red", "Green", "Blue"]) {
      const r = slider(new RegExp(`^${c} rotation`));
      expect([Number(r.min), Number(r.max)]).toEqual([-22.9, 22.9]);
      expect(Number(r.max) * (Math.PI / 180)).toBeLessThanOrEqual(0.4);
      const steps = -Number(r.min) / Number(r.step);
      expect(Math.abs(steps - Math.round(steps))).toBeLessThan(1e-9);
    }
  });

  it("keeps every slider's 0 or default on its step grid", () => {
    mount({ displayTransform: SIGMOID_ID });
    const onGrid = (r: HTMLInputElement, v: number) => {
      const steps = (v - Number(r.min)) / Number(r.step);
      expect(Math.abs(steps - Math.round(steps)), r.getAttribute("aria-label") ?? "").toBeLessThan(1e-6);
    };
    fireEvent.click(button("Show display luminance"));
    for (const r of screen.getAllByRole("slider") as HTMLInputElement[]) onGrid(r, Number(r.value));
    fireEvent.click(button("Primaries"));
    for (const r of screen.getAllByRole("slider") as HTMLInputElement[]) onGrid(r, 0);
  });

  it("offers every base primaries darktable has, Rec2020 first picked", () => {
    mount({ displayTransform: SIGMOID_ID });
    fireEvent.click(button("Primaries"));
    const base = combobox("Base primaries");
    expect(base.value).toBe("1");
    expect([...base.options].slice(1).map((o) => o.text)).toEqual([
      "Working profile", "Rec2020", "Display P3", "Adobe RGB (compatible)", "sRGB",
    ]);
  });

  it("keeps the display targets in a collapsed section, in percent", () => {
    mount({ displayTransform: SIGMOID_ID });
    expect(screen.queryByRole("slider", { name: /^Target white/ })).toBeNull();
    fireEvent.click(button("Show display luminance"));
    fireEvent.change(slider(/^Target white \(%\)/), { target: { value: "80" } });
    expect(bag()[key("display_white_target")]).toBe(80);
    expect([slider(/^Target black \(%\)/).min, slider(/^Target black \(%\)/).max]).toEqual(["0", "1"]);
  });

  it("widens a slider to a stored value past its soft range", () => {
    mount({ displayTransform: SIGMOID_ID, bag: { [key("display_white_target")]: 400 } });
    fireEvent.click(button("Show display luminance"));
    expect(slider(/^Target white/).max).toBe("400");
  });

  it("draws the curve in the Show curve section", () => {
    mount({ displayTransform: SIGMOID_ID });
    expect(screen.queryByRole("img", { name: "Curve" })).toBeNull();
    fireEvent.click(button("Show curve"));
    expect(screen.getByRole("img", { name: "Curve" })).toBeTruthy();
  });

  it("applies a preset in one undo step", () => {
    mount({ displayTransform: SIGMOID_ID, bag: { [key("red_inset")]: 0.4 } });
    fireEvent.change(combobox("Preset"), { target: { value: "Reinhard" } });
    expect(sigmoidBag()).toEqual(SIGMOID_PRESETS.find((x) => x.name === "Reinhard")!.params);
    expect(rig.commits).toEqual(["Sigmoid preset: Reinhard"]);
  });

  it("resets to its defaults, in one undo step", () => {
    mount({ displayTransform: SIGMOID_ID, bag: { [key("middle_grey_contrast")]: 2.5, [key("color_processing")]: 1 } });
    act(() => resetActive());
    expect(sigmoidBag()).toEqual(SIGMOID_DEFAULTS);
    expect(rig.commits).toEqual(["Sigmoid reset"]);
  });

  it("resets a primaries slider to zero on a double-click", () => {
    mount({ displayTransform: SIGMOID_ID, bag: { [key("green_inset")]: 0.3 } });
    fireEvent.click(button("Primaries"));
    fireEvent.doubleClick(slider(/^Green attenuation/));
    expect(bag()[key("green_inset")]).toBe(0);
  });
});
