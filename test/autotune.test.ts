import { describe, expect, it } from "vitest";
import { AGX_DEFAULTS, AGX_PARAMS } from "../src/agx/params";
import { SCENE_SPACE, agxAutoTune, agxReadExposure, filmicAutoTune, frameStats, measureScene, type FrameStats } from "../src/autotune";
import { filmicPower } from "../src/filmic/derive";
import { FILMIC_DEFAULTS, FILMIC_PARAMS } from "../src/filmic/params";
import { agxEdit, agxPivotEv, filmicEdit } from "../src/panel/model";
import { withinRange } from "../src/param-table";
import type { DevelopParams, SafelightAPI } from "../src/safelight";
import { fakeApi, frameOf } from "./support/fake-api";

// A frame whose darkest channel anywhere is 0.0045 and brightest 2.88.
const FRAME = frameOf(4, 2, (x, y) => (x === 0 && y === 0 ? [0.0045, 0.01, 0.02] : x === 3 && y === 1 ? [2.88, 1.0, 0.5] : [0.18, 0.18, 0.18]));
const STATS = frameStats(FRAME)!;

const flat = (v: number): FrameStats => ({ min: [v, v, v], max: [v, v, v], mean: [v, v, v] });
const spread = (min: number, max: number): FrameStats => ({ min: [min, min, min], max: [max, max, max], mean: [0.18, 0.18, 0.18] });

describe("frameStats", () => {
  it("finds the per-channel minimum, maximum and mean", () => {
    expect(STATS.min).toEqual([Math.fround(0.0045), Math.fround(0.01), Math.fround(0.02)]);
    expect(STATS.max).toEqual([Math.fround(2.88), Math.fround(1.0), Math.fround(0.5)]);
    expect(STATS.mean[0]).toBeCloseTo((6 * 0.18 + 0.0045 + 2.88) / 8, 6);
    expect(STATS.mean[1]).toBeCloseTo((6 * 0.18 + 0.01 + 1.0) / 8, 6);
    expect(STATS.mean[2]).toBeCloseTo((6 * 0.18 + 0.02 + 0.5) / 8, 6);
  });

  it("is null for a frame with no finite pixel", () => {
    expect(frameStats(frameOf(1, 1, () => [Number.NaN, Number.NaN, Number.NaN]))).toBeNull();
  });

  it("leaves out a pixel with any channel that isn't finite, whole", () => {
    const frame = frameOf(3, 1, (x) => (x === 0 ? [Number.NaN, 9, 9] : x === 1 ? [9, Number.POSITIVE_INFINITY, 9] : [1, 2, 3]));
    expect(frameStats(frame)).toEqual({ min: [1, 2, 3], max: [1, 2, 3], mean: [1, 2, 3] });
  });

  it("keeps a negative pixel, as the scene point is signed", () => {
    const stats = frameStats(frameOf(2, 1, (x) => (x === 0 ? [-0.5, 0, 0] : [1, 1, 1])))!;
    expect(stats.min).toEqual([-0.5, 0, 0]);
  });
});

describe("AgX auto tune (Ref §1.8)", () => {
  it("sets black from the smallest channel and white from the largest, scaled, keeping the pivot's EV", () => {
    const k = 1 + AGX_DEFAULTS.dynamic_range_scaling;
    const patch = agxAutoTune(AGX_DEFAULTS, STATS);
    expect(patch.range_black_relative_ev).toBeCloseTo(Math.log2(Math.fround(0.0045) / 0.18) * k, 6);
    expect(patch.range_white_relative_ev).toBeCloseTo(Math.log2(Math.fround(2.88) / 0.18) * k, 6);
    expect(agxPivotEv({ ...AGX_DEFAULTS, ...patch })).toBeCloseTo(0, 9);
  });

  it("floors a black at or below zero at darktable's 1e-6 before the log", () => {
    const k = 1 + AGX_DEFAULTS.dynamic_range_scaling;
    const floor = Math.log2(1e-6 / 0.18) * k;
    expect(agxAutoTune(AGX_DEFAULTS, spread(0, 1)).range_black_relative_ev).toBeCloseTo(floor, 9);
    expect(agxAutoTune(AGX_DEFAULTS, spread(-0.5, 1)).range_black_relative_ev).toBeCloseTo(floor, 9);
  });

  it("holds the ends to the hard range, on a flat or a black frame as on a wide one", () => {
    const flatPatch = agxAutoTune(AGX_DEFAULTS, flat(0.18));
    expect(flatPatch.range_black_relative_ev).toBeCloseTo(-0.1, 9);
    expect(flatPatch.range_white_relative_ev).toBeCloseTo(0.1, 9);
    expect(flatPatch.curve_pivot_x).toBeCloseTo(0.5, 9);

    const black = agxAutoTune(AGX_DEFAULTS, flat(0));
    expect(black.range_white_relative_ev).toBeCloseTo(0.1, 9);
    expect(black.range_black_relative_ev).toBeCloseTo(Math.log2(1e-6 / 0.18) * 1.1, 9);

    // The 1e-6 floor is 17.5 EV below grey, which only scaling by more than 14.5 % takes past -20.
    const wide = agxAutoTune({ ...AGX_DEFAULTS, dynamic_range_scaling: 0.5 }, spread(1e-30, 1e30));
    expect(wide.range_black_relative_ev).toBe(-20);
    expect(wide.range_white_relative_ev).toBe(20);
  });

  it("puts the pivot on the nearest end when the new range no longer holds its EV", () => {
    const above = agxAutoTune({ ...AGX_DEFAULTS, curve_pivot_x: 1 }, flat(0.18));
    expect(above.curve_pivot_x).toBe(1);
    const below = agxAutoTune({ ...AGX_DEFAULTS, curve_pivot_x: 0 }, spread(0.18, 0.18));
    expect(below.curve_pivot_x).toBe(0);
  });

  it("scales both ends by the stored dynamic range scaling", () => {
    const patch = agxAutoTune({ ...AGX_DEFAULTS, dynamic_range_scaling: 0.5 }, STATS);
    expect(patch.range_white_relative_ev).toBeCloseTo(Math.log2(Math.fround(2.88) / 0.18) * 1.5, 6);
  });

  it("passes through agxEdit unchanged, except that auto gamma follows the pivot as darktable's picker callback does", () => {
    const patch = agxAutoTune(AGX_DEFAULTS, STATS);
    expect(agxEdit(AGX_DEFAULTS, patch)).toEqual(patch);
    const auto = { ...AGX_DEFAULTS, auto_gamma: true };
    const edited = agxEdit(auto, agxAutoTune(auto, STATS));
    expect(edited.curve_gamma).toBeCloseTo(Math.log2(0.18) / Math.log2(edited.curve_pivot_x!), 9);
  });

  it("reads exposure as darktable's formula does", () => {
    const patch = agxReadExposure(AGX_DEFAULTS, 1);
    expect(patch.range_black_relative_ev).toBeCloseTo((-8 + 0.5) * 1.1, 9);
    expect(patch.range_white_relative_ev).toBeCloseTo((4 + 0.8) * 1.1, 9);
    expect(agxPivotEv({ ...AGX_DEFAULTS, ...patch })).toBeCloseTo(0, 9);
  });

  it("holds a read exposure to the hard range", () => {
    const high = agxReadExposure(AGX_DEFAULTS, 40);
    expect(high.range_black_relative_ev).toBe(-0.1);
    expect(high.range_white_relative_ev).toBe(20);
    const low = agxReadExposure(AGX_DEFAULTS, -40);
    expect(low.range_black_relative_ev).toBe(-20);
    expect(low.range_white_relative_ev).toBe(0.1);
  });

  // CLAMPF sends a NaN to the low bound, so neither a NaN exposure nor a NaN statistic leaves a patch withinRange would drop.
  it("answers a NaN as darktable's CLAMPF does, with the low bound", () => {
    const nan = agxReadExposure(AGX_DEFAULTS, Number.NaN);
    expect(nan.range_black_relative_ev).toBe(-20);
    expect(nan.range_white_relative_ev).toBe(0.1);
    expect(nan.curve_pivot_x).toBeCloseTo(20 / 20.1, 12);
    expect(Object.values(agxAutoTune(AGX_DEFAULTS, flat(Number.NaN))).every(Number.isFinite)).toBe(true);
  });

  it("returns only values the hard range keeps, for every frame the cases above produce", () => {
    const patches = [
      ...[flat(0), flat(0.18), flat(1e-30), flat(1e30), spread(-3, -1), spread(0, 1e30), STATS].map((s) => agxAutoTune(AGX_DEFAULTS, s)),
      ...[-100, -1, 0, 1, 100].map((e) => agxReadExposure(AGX_DEFAULTS, e)),
    ];
    for (const patch of patches) {
      expect(Object.values(patch).every(Number.isFinite)).toBe(true);
      expect(withinRange(AGX_PARAMS, patch)).toEqual(patch);
    }
  });
});

describe("filmic auto tune (Ref §2.9)", () => {
  it("sets black from the largest channel of the minimum, white from the largest of the maximum, and the hardness", () => {
    const patch = filmicAutoTune(FILMIC_DEFAULTS, STATS);
    const grey = FILMIC_DEFAULTS.grey_point_source / 100;
    expect(patch.black_point_source).toBeCloseTo(Math.log2(Math.fround(0.02) / grey), 6);
    expect(patch.white_point_source).toBeCloseTo(Math.log2(Math.fround(2.88) / grey), 6);
    expect(patch.output_power).toBeCloseTo(
      Math.log(0.1845) / Math.log(-patch.black_point_source! / (patch.white_point_source! - patch.black_point_source!)),
      9,
    );
  });

  it("needs no filmicEdit: with the grey kept it writes the hardness filmicEdit would", () => {
    const patch = filmicAutoTune(FILMIC_DEFAULTS, STATS);
    const edited = filmicEdit(FILMIC_DEFAULTS, patch);
    expect(edited.output_power).toBeCloseTo(Math.min(10, Math.max(1, patch.output_power!)), 12);
    expect(edited.black_point_source).toBe(patch.black_point_source);
    expect(edited.white_point_source).toBe(patch.white_point_source);
  });

  it("can't go through filmicEdit with a custom grey, which re-derives the ends from the old ones", () => {
    const custom = { ...FILMIC_DEFAULTS, custom_grey: true };
    const patch = filmicAutoTune(custom, STATS);
    expect(filmicEdit(custom, patch).black_point_source).not.toBeCloseTo(patch.black_point_source!, 3);
  });

  it("sets the grey too with a custom grey", () => {
    const patch = filmicAutoTune({ ...FILMIC_DEFAULTS, custom_grey: true }, STATS);
    expect(patch.grey_point_source).toBeCloseTo((100 * Math.max(...STATS.mean)) / 2, 6);
  });

  it("leaves the grey alone without a custom grey", () => {
    expect(filmicAutoTune(FILMIC_DEFAULTS, STATS)).not.toHaveProperty("grey_point_source");
  });

  it("measures against the stored grey without a custom grey, though the panel hides it, as Ansel does", () => {
    const patch = filmicAutoTune({ ...FILMIC_DEFAULTS, custom_grey: false, grey_point_source: 10 }, STATS);
    expect(patch.white_point_source).toBeCloseTo(Math.log2(Math.fround(2.88) / 0.1), 6);
    expect(patch.black_point_source).toBeCloseTo(Math.log2(Math.fround(0.02) / 0.1), 6);
  });

  it("measures the ends against the grey it sets", () => {
    const patch = filmicAutoTune({ ...FILMIC_DEFAULTS, custom_grey: true }, STATS);
    const grey = patch.grey_point_source! / 100;
    expect(patch.white_point_source).toBeCloseTo(Math.log2(Math.fround(2.88) / grey), 6);
    expect(patch.black_point_source).toBeCloseTo(Math.log2(Math.fround(0.02) / grey), 6);
  });

  it("holds the set grey to Ansel's 0.001 to 100", () => {
    const custom = { ...FILMIC_DEFAULTS, custom_grey: true };
    expect(filmicAutoTune(custom, flat(0)).grey_point_source).toBe(0.001);
    expect(filmicAutoTune(custom, flat(-4)).grey_point_source).toBe(0.001);
    expect(filmicAutoTune(custom, flat(1000)).grey_point_source).toBe(100);
  });

  it("scales both ends by the security factor, and keeps the black above -16", () => {
    const grey = FILMIC_DEFAULTS.grey_point_source / 100;
    const patch = filmicAutoTune({ ...FILMIC_DEFAULTS, security_factor: 100 }, STATS);
    expect(patch.white_point_source).toBeCloseTo(Math.log2(Math.fround(2.88) / grey) * 2, 6);
    expect(patch.black_point_source).toBeCloseTo(Math.log2(Math.fround(0.02) / grey) * 2, 6);
    // log2(1e-20 / grey) clamps to -16, and 200 % scales it to -48, which fmaxf holds at -16.
    expect(filmicAutoTune({ ...FILMIC_DEFAULTS, security_factor: 200 }, spread(1e-20, 1)).black_point_source).toBe(-16);
  });

  it("limits the EV of the ends to 1 and 16 before scaling", () => {
    const patch = filmicAutoTune({ ...FILMIC_DEFAULTS, security_factor: 50 }, flat(0.18));
    expect(patch.white_point_source).toBeCloseTo(1.5, 9);
    expect(patch.black_point_source).toBeCloseTo(-1.5, 9);
  });

  // Ansel's CLAMP(log2f(black / grey), -16, -1) is -16 for a black of 0 (log2f(0) is -inf), then scales it and
  // fmaxf(., -16) holds it; for a negative black log2f is NaN, CLAMP lets it through, and fmaxf(NaN, -16) is -16 unscaled.
  it("answers a black of zero with the floor scaled, and a negative black with the floor itself", () => {
    const halved = { ...FILMIC_DEFAULTS, security_factor: -50 };
    expect(filmicAutoTune(halved, spread(0, 1)).black_point_source).toBe(-8);
    expect(filmicAutoTune(halved, spread(-0.5, 1)).black_point_source).toBe(-16);
    expect(filmicAutoTune(FILMIC_DEFAULTS, spread(0, 1)).black_point_source).toBe(-16);
    expect(filmicAutoTune(FILMIC_DEFAULTS, spread(-0.5, 1)).black_point_source).toBe(-16);
  });

  // CLAMP(log2f(0), 1, 16) is 1 for a white of 0. A negative white is NaN in Ansel and would be dropped by withinRange.
  it("answers a white at or below zero with the floor of 1 EV, scaled", () => {
    const grown = { ...FILMIC_DEFAULTS, security_factor: 50 };
    expect(filmicAutoTune(grown, flat(0)).white_point_source).toBe(1.5);
    expect(filmicAutoTune(grown, flat(-2)).white_point_source).toBe(1.5);
  });

  it("stays finite on a grey of zero, where the log of a ratio is infinite or NaN", () => {
    const zero = { ...FILMIC_DEFAULTS, grey_point_source: 0 };
    for (const s of [flat(0), flat(0.18), spread(-1, 1)]) {
      const patch = filmicAutoTune(zero, s);
      expect(Object.values(patch).every(Number.isFinite)).toBe(true);
    }
    expect(filmicAutoTune(zero, spread(0.18, 1)).white_point_source).toBe(16);
    expect(filmicAutoTune(zero, spread(0.18, 1)).black_point_source).toBe(-1);
  });

  it("derives the hardness from the ends the hard range keeps", () => {
    const patch = filmicAutoTune({ ...FILMIC_DEFAULTS, security_factor: 100 }, spread(0.18, 1e6));
    expect(patch.white_point_source).toBe(16);
    expect(patch.black_point_source).toBeCloseTo(-2, 9);
    expect(patch.output_power).toBeCloseTo(filmicPower({ ...FILMIC_DEFAULTS, ...patch, auto_hardness: true }), 12);
    // 16 EV scaled by 200 % is 32, which the hard range holds at 16; the hardness of 32 would differ.
    expect(patch.output_power).not.toBeCloseTo(Math.log(0.1845) / Math.log(2 / 34), 3);
  });

  it("returns finite values the hard range keeps, except a hardness it clamps, for every frame the cases above produce", () => {
    const frames = [flat(0), flat(0.18), flat(-2), flat(1e-30), flat(1e30), spread(-3, -1), spread(0, 1e30), spread(1e-20, 1), STATS];
    for (const s of frames) {
      for (const p of [FILMIC_DEFAULTS, { ...FILMIC_DEFAULTS, custom_grey: true }, { ...FILMIC_DEFAULTS, security_factor: -50 }, { ...FILMIC_DEFAULTS, security_factor: 200 }]) {
        const patch = filmicAutoTune(p, s);
        expect(Object.values(patch).every(Number.isFinite)).toBe(true);
        const { output_power: _power, ...ends } = patch;
        expect(withinRange(FILMIC_PARAMS, ends)).toEqual(ends);
      }
    }
  });
});

describe("measureScene", () => {
  it("asks for the scene point in linear Rec.2020", async () => {
    const rig = fakeApi({ frame: FRAME });
    await measureScene(rig.api);
    expect(rig.captures).toEqual([{ point: "scene", space: { encoding: "linear", primaries: "rec2020" } }]);
    expect(SCENE_SPACE).toEqual({ encoding: "linear", primaries: "rec2020" });
  });

  it("measures the frame it gets", async () => {
    expect(await measureScene(fakeApi({ frame: FRAME }).api)).toEqual(STATS);
  });

  it("captures the open photo's params", async () => {
    const rig = fakeApi({ frame: FRAME, exposure: 1.5 });
    const seen: DevelopParams[] = [];
    const host: SafelightAPI = {
      ...rig.api,
      develop: {
        ...rig.api.develop,
        captureFloatFrame: async (params) => {
          seen.push(params);
          return FRAME;
        },
      },
    };
    await measureScene(host);
    expect(seen).toEqual([rig.develop.getState().params]);
    expect(seen[0].exposure).toBe(1.5);
  });

  it("says why it can't measure", async () => {
    expect(await measureScene(fakeApi({ frame: "missing" }).api)).toBe("unsupported");
    expect(await measureScene(fakeApi({ frame: null }).api)).toBe("no frame");
  });

  it("won't measure a frame that isn't the scene point", async () => {
    const output = { ...FRAME, point: "pre-output" as const };
    expect(await measureScene(fakeApi({ frame: output }).api)).toBe("unsupported");
  });

  it("calls a frame with no finite pixel no frame", async () => {
    const nan = frameOf(2, 2, () => [Number.NaN, Number.NaN, Number.NaN]);
    expect(await measureScene(fakeApi({ frame: nan }).api)).toBe("no frame");
  });
});
