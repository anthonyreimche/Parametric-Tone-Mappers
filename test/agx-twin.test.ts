import { describe, expect, it } from "vitest";
import { apply, type Vec3 } from "../src/colour/mat3";
import { agxPixel } from "../src/agx/twin";
import { agxMatrices, deriveAgx } from "../src/agx/derive";
import { AGX_DEFAULTS, type AgxParams } from "../src/agx/params";

const p = (over: Partial<AgxParams>): AgxParams => ({ ...AGX_DEFAULTS, ...over });

const DEFAULT_GREYS: [number, number][] = [
  [0, 0], [0.0018, 0.00045], [0.018, 0.008415], [0.09, 0.070344], [0.18, 0.18],
  [0.36, 0.373475], [1.0, 0.710929], [4.0, 0.941315], [16.0, 0.999634],
];

describe("agxPixel", () => {
  const u = deriveAgx(AGX_DEFAULTS);

  it("renders greys as darktable's default curve does", () => {
    for (const [inp, out] of DEFAULT_GREYS) {
      const rgb = agxPixel([inp, inp, inp], u);
      for (const ch of rgb) expect(ch, `grey ${inp}`).toBeCloseTo(out, 5);
    }
  });

  it("renders the blender-like base curve's greys", () => {
    const b = deriveAgx({ ...AGX_DEFAULTS, curve_shoulder_power: 1.5, curve_toe_power: 1.5, curve_gamma: 2.4, curve_contrast_around_pivot: 2.4535246 });
    expect(agxPixel([1, 1, 1], b)[1]).toBeCloseTo(0.555999, 5);
    expect(agxPixel([4, 4, 4], b)[1]).toBeCloseTo(0.815412, 5);
  });

  it("keeps a saturated colour finite and its hue family", () => {
    const out = agxPixel([1.5, 0.1, 0.05], u);
    for (const ch of out) expect(Number.isFinite(ch)).toBe(true);
    expect(out[0]).toBeGreaterThan(out[1]);
    expect(out[0]).toBeGreaterThan(out[2]);
  });

  it("maps NaN input to black", () => {
    expect(agxPixel([Number.NaN, Number.NaN, Number.NaN], u).map((v) => Math.abs(v))).toEqual([0, 0, 0]);
  });
});

// HSV hue in [0, 1), written out here rather than taken from the twin.
function hueOf([r, g, b]: Vec3): number {
  const mx = Math.max(r, g, b);
  const d = mx - Math.min(r, g, b);
  const h = mx === r ? (g - b) / d : mx === g ? 2 + (b - r) / d : 4 + (r - g) / d;
  return (((h / 6) % 1) + 1) % 1;
}

describe("agxPixel properties", () => {
  it("keeps the input's hue in the base space with primaries disabled and hue fully preserved", () => {
    const colours = [[0.3, 0.1, 0.05], [0.05, 0.2, 0.1], [0.1, 0.12, 0.4], [0.4, 0.3, 0.05], [0.25, 0.05, 0.3], [2, 0.9, 0.4]] as const;
    const turns = (params: AgxParams) => {
      const u = deriveAgx(params);
      const toBase = agxMatrices(params).pipeToBase;
      return colours.map((c) => {
        const turn = Math.abs(hueOf(apply(toBase, agxPixel(c, u))) - hueOf(apply(toBase, c)));
        return Math.min(turn, 1 - turn);
      });
    };
    for (const base_primaries of [2, 3, 5]) {
      const kept = p({ base_primaries, disable_primaries_adjustments: true, look_original_hue_mix_ratio: 1 });
      for (const turn of turns(kept)) expect(turn, `base ${base_primaries}`).toBeLessThan(1e-9);
      expect(Math.max(...turns({ ...kept, look_original_hue_mix_ratio: 0 })), `base ${base_primaries}`).toBeGreaterThan(1e-3);
    }
  });

  it("renders export and working profile as the Rec2020 base", () => {
    const rec2020 = deriveAgx(AGX_DEFAULTS);
    for (const base_primaries of [0, 1]) {
      const u = deriveAgx(p({ base_primaries }));
      for (const c of [[1, 0, 0], [-0.2, 0.6, -0.1], [8, 7.5, 7]] as const) expect(agxPixel(c, u)).toEqual(agxPixel(c, rec2020));
    }
  });
});

// Twin outputs pinned per setting: saturated primaries, a negative, near-black
// and near-white inputs. No native darktable build was run to compare against,
// so these guard the transcription against drift, not against darktable.
const TUNED: Partial<AgxParams> = { look_slope: 1.1, look_lift: 0.05, look_brightness: 1 / 1.35 ** 2, look_saturation: 1.4 };
const FADED: Partial<AgxParams> = { curve_target_display_black_ratio: 0.1, curve_target_display_white_ratio: 0.6 };
const PINS: [string, Partial<AgxParams>, Vec3, Vec3][] = [
  ["defaults", {}, [1, 0, 0], [0.8987059143, 0.008466765318, -0.01837218172]],
  ["defaults", {}, [0, 1, 0], [0.1373430886, 0.7182986389, 0.04270204031]],
  ["defaults", {}, [0, 0, 1], [-0.01885768796, 0.07661727644, 0.8336176857]],
  ["defaults", {}, [-0.2, 0.6, -0.1], [-0.1254513859, 0.5345121001, -0.07622214452]],
  ["defaults", {}, [0.001, 0.0005, 0.002], [1.690417579e-4, 7.780312405e-5, 5.050133387e-4]],
  ["defaults", {}, [8, 7.5, 7], [0.9799312542, 0.9771237917, 0.9745433023]],
  ["base 3", { base_primaries: 3 }, [1, 0, 0], [0.8148031833, 0.01591943625, -0.008156345324]],
  ["base 3", { base_primaries: 3 }, [0, 1, 0], [0.08922975372, 0.703459366, 0.03425343678]],
  ["base 3", { base_primaries: 3 }, [0, 0, 1], [-0.005139603057, 0.08800711588, 0.8266482054]],
  ["base 3", { base_primaries: 3 }, [-0.2, 0.6, -0.1], [-0.1233488722, 0.5208373392, -0.05763516058]],
  ["base 3", { base_primaries: 3 }, [0.001, 0.0005, 0.002], [1.800077409e-4, 8.518576462e-5, 5.064134273e-4]],
  ["base 3", { base_primaries: 3 }, [8, 7.5, 7], [0.9798432197, 0.9770770614, 0.9745471087]],
  ["base 4", { base_primaries: 4 }, [1, 0, 0], [0.8608050658, 0.00912426612, -0.01442536025]],
  ["base 4", { base_primaries: 4 }, [0, 1, 0], [0.1138293938, 0.6976784948, 0.02071989984]],
  ["base 4", { base_primaries: 4 }, [0, 0, 1], [-0.0139193081, 0.07867831444, 0.8134456462]],
  ["base 4", { base_primaries: 4 }, [-0.2, 0.6, -0.1], [-0.09292616814, 0.5245880028, -0.04601300453]],
  ["base 4", { base_primaries: 4 }, [0.001, 0.0005, 0.002], [1.748301910e-4, 8.193328417e-5, 5.097156766e-4]],
  ["base 4", { base_primaries: 4 }, [8, 7.5, 7], [0.9798833109, 0.9771053435, 0.9745203136]],
  ["base 5", { base_primaries: 5 }, [1, 0, 0], [0.7530791098, 0.01890654754, -0.003004755478]],
  ["base 5", { base_primaries: 5 }, [0, 1, 0], [0.02255690925, 0.693977928, -0.002161594391]],
  ["base 5", { base_primaries: 5 }, [0, 0, 1], [0.009925100865, 0.1018584709, 0.7966797543]],
  ["base 5", { base_primaries: 5 }, [-0.2, 0.6, -0.1], [-0.004215833452, 0.5350804213, 0.06122247203]],
  ["base 5", { base_primaries: 5 }, [0.001, 0.0005, 0.002], [1.892157380e-4, 9.190028230e-5, 5.154023948e-4]],
  ["base 5", { base_primaries: 5 }, [8, 7.5, 7], [0.979791729, 0.9770253834, 0.9745051939]],
  ["tuned look", TUNED, [1, 0, 0], [1.438065428, -0.108192818, -0.1232619146]],
  ["tuned look", TUNED, [0, 1, 0], [-0.05212211024, 0.9868370143, -0.1535065721]],
  ["tuned look", TUNED, [0, 0, 1], [-0.1241280958, 0.04547208577, 1.591622095]],
  ["tuned look", TUNED, [-0.2, 0.6, -0.1], [-0.2800818835, 0.7184379241, -0.1510089939]],
  ["tuned look", TUNED, [0.001, 0.0005, 0.002], [4.206029143e-4, 3.006245329e-4, 8.289790056e-4]],
  ["tuned look", TUNED, [8, 7.5, 7], [1.294637294, 1.287977724, 1.281858815]],
  ["hue mix 0", { look_original_hue_mix_ratio: 0 }, [1, 0, 0], [0.8933217752, 0.01679402166, -0.01987485639]],
  ["hue mix 0", { look_original_hue_mix_ratio: 0 }, [0, 1, 0], [0.2035706924, 0.7082700415, 0.03721851893]],
  ["hue mix 0", { look_original_hue_mix_ratio: 0 }, [0, 0, 1], [-0.02196864058, 0.08142876067, 0.8327494411]],
  ["hue mix 0", { look_original_hue_mix_ratio: 0 }, [-0.2, 0.6, -0.1], [-0.1217116599, 0.5339458074, -0.07653178682]],
  ["hue mix 0", { look_original_hue_mix_ratio: 0 }, [0.001, 0.0005, 0.002], [1.621165241e-4, 7.885178621e-5, 5.055867351e-4]],
  ["hue mix 0", { look_original_hue_mix_ratio: 0 }, [8, 7.5, 7], [0.9799038025, 0.9771662493, 0.9745356407]],
  ["hue mix 1", { look_original_hue_mix_ratio: 1 }, [1, 0, 0], [0.9022953403, 0.00291526109, -0.0173703986]],
  ["hue mix 1", { look_original_hue_mix_ratio: 1 }, [0, 1, 0], [0.09319135276, 0.7249843705, 0.04635772124]],
  ["hue mix 1", { look_original_hue_mix_ratio: 1 }, [0, 0, 1], [-0.01678371954, 0.07340962029, 0.8341965154]],
  ["hue mix 1", { look_original_hue_mix_ratio: 1 }, [-0.2, 0.6, -0.1], [-0.1279445367, 0.5348896286, -0.07601571631]],
  ["hue mix 1", { look_original_hue_mix_ratio: 1 }, [0.001, 0.0005, 0.002], [1.736585804e-4, 7.710401595e-5, 5.046310745e-4]],
  ["hue mix 1", { look_original_hue_mix_ratio: 1 }, [8, 7.5, 7], [0.9799495554, 0.9770954866, 0.97454841]],
  ["faded targets", FADED, [1, 0, 0], [0.7841375396, 0.05424054849, 0.04830355327]],
  ["faded targets", FADED, [0, 1, 0], [0.1769551443, 0.5909371184, 0.0709074723]],
  ["faded targets", FADED, [0, 0, 1], [0.05815822167, 0.1177253501, 0.6805956545]],
  ["faded targets", FADED, [-0.2, 0.6, -0.1], [-0.04876639836, 0.4985453811, 0.0247081973]],
  ["faded targets", FADED, [0.001, 0.0005, 0.002], [0.1003317035, 0.1002436703, 0.1005990542]],
  ["faded targets", FADED, [8, 7.5, 7], [0.5980278317, 0.5977399067, 0.5974747075]],
];

describe("agxPixel regression pins (twin output, not darktable values)", () => {
  it.each(PINS)("%s: %j", (_name, over, input, expected) => {
    const out = agxPixel(input, deriveAgx(p(over)));
    for (let i = 0; i < 3; i++) expect(out[i], `channel ${i}`).toBeCloseTo(expected[i], 8);
  });
});
