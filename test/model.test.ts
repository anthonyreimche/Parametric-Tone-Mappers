import { describe, expect, it } from "vitest";
import { AGX_DEFAULTS, type AgxParams } from "../src/agx/params";
import { filmicPower } from "../src/filmic/derive";
import { FILMIC_DEFAULTS, type FilmicParams } from "../src/filmic/params";
import {
  agxEdit, agxPivotEv, agxSetFromAbove, filmicDirect, filmicEdit, filmicLatitudeBalance,
} from "../src/panel/model";

const agx = (over: Partial<AgxParams> = {}): AgxParams => ({ ...AGX_DEFAULTS, ...over });
const filmic = (over: Partial<FilmicParams> = {}): FilmicParams => ({ ...FILMIC_DEFAULTS, ...over });

describe("AgX couplings (Ref §1.4)", () => {
  it("puts the default pivot at 0 EV", () => {
    expect(agxPivotEv(AGX_DEFAULTS)).toBeCloseTo(0, 12);
  });

  it("keeps the pivot's EV when black or white moves", () => {
    const prev = agx();
    const patch = agxEdit(prev, { range_black_relative_ev: -12 });
    expect(agxPivotEv({ ...prev, ...patch })).toBeCloseTo(0, 12);
    expect(patch.curve_pivot_x).toBeCloseTo(12 / 18.5, 12);
  });

  it("clamps the pivot into a range that no longer holds it", () => {
    const prev = agx({ curve_pivot_x: 1 });
    const patch = agxEdit(prev, { range_white_relative_ev: 3 });
    expect(patch.curve_pivot_x).toBe(1);
  });

  it("rescales both ends with dynamic range scaling, then re-solves the pivot", () => {
    const prev = agx();
    const patch = agxEdit(prev, { dynamic_range_scaling: 0.32 });
    const ratio = (0.32 - 0.1) / 1.1;
    expect(patch.range_black_relative_ev).toBeCloseTo(-10 * (1 + ratio), 12);
    expect(patch.range_white_relative_ev).toBeCloseTo(6.5 * (1 + ratio), 12);
    expect(agxPivotEv({ ...prev, ...patch })).toBeCloseTo(0, 9);
  });

  it("keeps the pivot at its EV when scaling pushes an end past its hard range", () => {
    const prev = agx();
    const patch = agxEdit(prev, { dynamic_range_scaling: 2 });
    expect(patch.range_black_relative_ev).toBe(-20);
    expect(patch.range_white_relative_ev).toBeCloseTo(6.5 * (1 + 1.9 / 1.1), 9);
    expect(agxPivotEv({ ...prev, ...patch })).toBeCloseTo(0, 9);
    for (const scaling of [-0.5, -0.25, 0, 0.5, 1, 1.5, 2]) {
      expect(agxPivotEv({ ...prev, ...agxEdit(prev, { dynamic_range_scaling: scaling }) })).toBeCloseTo(0, 9);
    }
  });

  it("writes the computed gamma while auto gamma is on", () => {
    const patch = agxEdit(agx({ auto_gamma: true }), { curve_pivot_y_linear_output: 0.2 });
    expect(patch.curve_gamma).toBeCloseTo(Math.log2(0.2) / Math.log2(10 / 16.5), 9);
  });

  it("sets the purity restore from the attenuation, and both master ratios to 1", () => {
    const p = agx();
    expect(agxSetFromAbove(p)).toEqual({
      master_outset_ratio: 1, master_unrotation_ratio: 1,
      red_outset: p.red_inset, green_outset: p.green_inset, blue_outset: p.blue_inset,
      red_unrotation: p.red_rotation, green_unrotation: p.green_rotation, blue_unrotation: p.blue_rotation,
    });
  });

  it("keeps a pivot the patch sets itself when an end moves with it", () => {
    const patch = agxEdit(agx(), { range_black_relative_ev: -12, curve_pivot_x: 0.5 });
    expect(patch.curve_pivot_x).toBe(0.5);
  });

  it("writes neither a pivot nor a gamma for an edit that touches neither", () => {
    expect(agxEdit(agx(), { look_slope: 2 })).toEqual({ look_slope: 2 });
  });

  it("leaves the stored gamma when the pivot output is 0, as darktable's guard does", () => {
    const patch = agxEdit(agx({ auto_gamma: true }), { curve_pivot_y_linear_output: 0 });
    expect(patch.curve_gamma).toBeUndefined();
  });

  it("clamps the auto gamma's pivot away from the endpoints", () => {
    const patch = agxEdit(agx({ auto_gamma: true }), { curve_pivot_x: 1, curve_pivot_y_linear_output: 0.5 });
    expect(patch.curve_gamma).toBeCloseTo(Math.log2(0.5) / Math.log2(1 - 1e-6), 3);
    expect(Number.isFinite(patch.curve_gamma)).toBe(true);
  });

  it("stays finite over the declared ranges of its inputs", () => {
    const scalings = [-0.5, -0.1, 0, 0.1, 0.5, 1, 2];
    const ends = [[-20, 20], [-0.1, 0.1], [-20, 0.1], [-0.1, 20], [-10, 6.5]] as const;
    const pivots = [0, 0.25, 10 / 16.5, 1];
    for (const [black, white] of ends)
      for (const prevScaling of scalings)
        for (const scaling of scalings)
          for (const pivot of pivots) {
            const prev = agx({
              range_black_relative_ev: black,
              range_white_relative_ev: white,
              dynamic_range_scaling: prevScaling,
              curve_pivot_x: pivot,
              auto_gamma: true,
            });
            for (const patch of [
              { dynamic_range_scaling: scaling },
              { range_black_relative_ev: -0.1 },
              { range_white_relative_ev: 20 },
              { curve_pivot_y_linear_output: 1 },
            ]) {
              const out = agxEdit(prev, patch);
              for (const v of Object.values(out)) if (typeof v === "number") expect(Number.isFinite(v)).toBe(true);
              expect(out.curve_pivot_x ?? 0).toBeGreaterThanOrEqual(0);
              expect(out.curve_pivot_x ?? 0).toBeLessThanOrEqual(1);
            }
          }
  });
});

describe("filmic couplings (Ref §2.5)", () => {
  it("shows equal highlights and shadows at balance 0, both the latitude's share", () => {
    const { toe, shoulder } = filmicDirect(filmic());
    expect(toe).toBeCloseTo(shoulder, 6);
    expect(toe).toBeGreaterThan(0);
  });

  it("round-trips highlights and shadows through latitude and balance", () => {
    const p = filmic();
    const { latitude, balance } = filmicLatitudeBalance(p, 20, 60);
    const back = filmicDirect({ ...p, latitude, balance });
    expect(back.toe).toBeCloseTo(20, 3);
    expect(back.shoulder).toBeCloseTo(60, 3);
  });

  it("rescales both ends with dynamic range scaling", () => {
    const prev = filmic();
    const patch = filmicEdit(prev, { security_factor: 20 });
    const ratio = 20 / 100;
    expect(patch.black_point_source).toBeCloseTo(prev.black_point_source * (1 + ratio), 12);
    expect(patch.white_point_source).toBeCloseTo(prev.white_point_source * (1 + ratio), 12);
  });

  it("shifts both ends by the grey change with a custom grey", () => {
    const prev = filmic({ custom_grey: true });
    const patch = filmicEdit(prev, { grey_point_source: 9.225 });
    expect(patch.black_point_source).toBeCloseTo(prev.black_point_source - 1, 9);
    expect(patch.white_point_source).toBeCloseTo(prev.white_point_source + 1, 9);
  });

  it("writes the auto hardness power after a scene edit", () => {
    const prev = filmic();
    const patch = filmicEdit(prev, { white_point_source: 4 });
    expect(patch.output_power).toBeCloseTo(filmicPower({ ...prev, white_point_source: 4 }), 9);
  });

  it("leaves hardness alone without auto hardness", () => {
    expect(filmicEdit(filmic({ auto_hardness: false }), { white_point_source: 4 }).output_power).toBeUndefined();
  });

  it("writes the auto power when auto hardness is switched on", () => {
    const prev = filmic({ auto_hardness: false, output_power: 3, white_point_source: 4 });
    const patch = filmicEdit(prev, { auto_hardness: true });
    expect(patch.output_power).toBeCloseTo(filmicPower({ ...prev, auto_hardness: true }), 9);
  });

  it("writes neither ends nor power for an edit that touches no scene value", () => {
    expect(filmicEdit(filmic(), { contrast: 2 })).toEqual({ contrast: 2 });
  });

  it("caps the written power at the declared 10 while the derived power stays unclamped", () => {
    const prev = filmic();
    const patch = filmicEdit(prev, { black_point_source: -16, white_point_source: 0.1 });
    expect(patch.output_power).toBe(10);
    expect(filmicPower({ ...prev, ...patch })).toBeGreaterThan(100);
  });

  it("holds rescaled ends to their hard range, and derives the power from the held ends", () => {
    const prev = filmic({ black_point_source: -12, white_point_source: 12 });
    const patch = filmicEdit(prev, { security_factor: 200 });
    expect(patch.black_point_source).toBe(-16);
    expect(patch.white_point_source).toBe(16);
    expect(patch.output_power).toBeCloseTo(filmicPower({ ...prev, ...patch }), 9);
  });

  it("holds the ends and the power to finite values when the grey source reaches 0", () => {
    const prev = filmic({ custom_grey: true });
    const down = filmicEdit(prev, { grey_point_source: 0 });
    expect(down.black_point_source).toBe(-16);
    expect(down.white_point_source).toBe(16);
    expect(down.output_power).toBeCloseTo(filmicPower({ ...prev, ...down }), 9);

    const up = filmicEdit({ ...prev, grey_point_source: 0 }, { grey_point_source: 18.45 });
    expect(up.black_point_source).toBe(-0.1);
    expect(up.white_point_source).toBe(0.1);
    expect(Number.isFinite(up.output_power)).toBe(true);
  });

  it("writes the rendered power when auto hardness is switched off, whatever changed while it was on", () => {
    const prev = filmic({ custom_grey: true });
    const edited = { ...prev, ...filmicEdit(prev, { grey_point_target: 30 }) };
    expect(edited.output_power).toBe(prev.output_power);
    const rendered = filmicPower(edited);
    expect(rendered).not.toBeCloseTo(prev.output_power, 1);
    expect(filmicEdit(edited, { auto_hardness: false }).output_power).toBeCloseTo(rendered, 9);
  });

  it("caps the power written at switch-off at the declared 10", () => {
    const prev = filmic({ black_point_source: -16, white_point_source: 0.1 });
    expect(filmicPower(prev)).toBeGreaterThan(100);
    expect(filmicEdit(prev, { auto_hardness: false }).output_power).toBe(10);
  });

  it("writes no power at switch-off when auto hardness was already off, or the patch brings its own", () => {
    const off = filmic({ auto_hardness: false, output_power: 3 });
    expect(filmicEdit(off, { auto_hardness: false })).toEqual({ auto_hardness: false });
    expect(filmicEdit(filmic(), { auto_hardness: false, output_power: 2 }).output_power).toBe(2);
  });

  it("shows the latitude for both sliders when the geometry is NaN, as Ansel's fallback does", () => {
    // Contrast 0 with a custom grey clamped to a target white of 0: grey display 0, so a contrast of 0/0.
    const p = filmic({ custom_grey: true, white_point_target: 0, contrast: 0, latitude: 35 });
    expect(filmicDirect(p)).toEqual({ toe: 35, shoulder: 35 });
    expect(filmicDirect({ ...p, latitude: 140 })).toEqual({ toe: 100, shoulder: 100 });
  });

  it("splits a highlights and shadows pair over spans of 1e-6 when the geometry is NaN, as fmaxf does", () => {
    const p = filmic({ custom_grey: true, white_point_target: 0, contrast: 0 });
    const { latitude, balance } = filmicLatitudeBalance(p, 20, 60);
    expect(latitude).toBeCloseTo(40, 9);
    expect(balance).toBeCloseTo(-25, 9);
  });

  it("returns the stored latitude and balance when the pair is not a number", () => {
    const p = filmic({ latitude: 35, balance: -12 });
    expect(filmicLatitudeBalance(p, NaN, 50)).toEqual({ latitude: 35, balance: -12 });
    expect(filmicLatitudeBalance(p, 50, NaN)).toEqual({ latitude: 35, balance: -12 });
  });

  it("splits equal highlights and shadows into latitude alone", () => {
    const { latitude, balance } = filmicLatitudeBalance(filmic(), 30, 30);
    expect(latitude).toBeCloseTo(30, 9);
    expect(balance).toBe(0);
  });

  it("keeps highlights and shadows within 0 to 100 and latitude and balance within their ranges", () => {
    for (const latitude of [0.01, 10, 50, 99])
      for (const balance of [-50, -20, 0, 20, 50]) {
        const { toe, shoulder } = filmicDirect(filmic({ latitude, balance }));
        for (const v of [toe, shoulder]) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(100);
        }
      }
    for (const toe of [-20, 0, 25, 100, 140])
      for (const shoulder of [-20, 0, 25, 100, 140]) {
        const out = filmicLatitudeBalance(filmic(), toe, shoulder);
        expect(out.latitude).toBeGreaterThanOrEqual(0);
        expect(out.latitude).toBeLessThanOrEqual(100);
        expect(Math.abs(out.balance)).toBeLessThanOrEqual(50);
      }
  });

  it("stays finite over the declared ranges of the scene, display and curve values", () => {
    const ends = [[-16, 16], [-0.1, 0.1], [-16, 0.1], [-0.1, 16], [-9.55, 2.45]] as const;
    for (const [black, white] of ends)
      for (const grey_point_target of [1, 18.45, 50])
        for (const white_point_target of [0, 100, 1600])
          for (const contrast of [0, 1.18, 5])
            for (const custom_grey of [false, true]) {
              const p = filmic({
                black_point_source: black,
                white_point_source: white,
                grey_point_target,
                white_point_target,
                contrast,
                custom_grey,
              });
              const direct = filmicDirect(p);
              const legacy = filmicLatitudeBalance(p, 20, 60);
              for (const v of [direct.toe, direct.shoulder, legacy.latitude, legacy.balance]) expect(Number.isFinite(v)).toBe(true);
              for (const scene of [{ security_factor: 200 }, { security_factor: -50 }, { grey_point_source: 1 }, { grey_point_source: 100 }]) {
                const out = filmicEdit({ ...p, security_factor: 20, grey_point_source: 18.45 }, scene);
                for (const v of Object.values(out)) if (typeof v === "number") expect(Number.isFinite(v)).toBe(true);
              }
            }
  });

  it("round-trips a grid of highlights and shadows pairs through latitude and balance", () => {
    const sets = [filmic(), filmic({ black_point_source: -8, white_point_source: 4, contrast: 1.5 }), filmic({ custom_grey: true, grey_point_target: 12, white_point_target: 400 })];
    let worst = 0;
    for (const p of sets)
      for (let toe = 0; toe <= 100; toe += 5)
        for (let shoulder = 0; shoulder <= 100; shoulder += 5) {
          const { latitude, balance } = filmicLatitudeBalance(p, toe, shoulder);
          const back = filmicDirect({ ...p, latitude, balance });
          worst = Math.max(worst, Math.abs(back.toe - toe), Math.abs(back.shoulder - shoulder));
        }
    expect(worst).toBeLessThan(1e-9);
  });
});
