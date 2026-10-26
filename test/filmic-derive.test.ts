import { describe, expect, it } from "vitest";
import { IDENTITY, apply, columns, fromColumnMajor, mul, type Vec3 } from "../src/colour/mat3";
import { REC2020, type Profile } from "../src/colour/profiles";
import {
  BRACKETS,
  FILMIC_UNIFORM_TYPES,
  buildDisplaced,
  deriveFilmic,
  displacedMatrix,
  filmicBracket,
  filmicPower,
  filmicSpline,
} from "../src/filmic/derive";
import {
  CURVE_POLY_3,
  CURVE_POLY_4,
  CURVE_RATIONAL,
  CURVE_SIGMOID,
  FILMIC_DEFAULTS,
  type FilmicParams,
} from "../src/filmic/params";
import { filmicPixel } from "../src/filmic/twin";

const near = (a: readonly number[], b: readonly number[], tol: number) =>
  a.forEach((v, i) => expect(Math.abs(v - b[i]), `entry ${i}`).toBeLessThan(tol));

const p = (over: Partial<FilmicParams>): FilmicParams => ({ ...FILMIC_DEFAULTS, ...over });
const FLT_MAX = 3.4028234663852886e38;

// Row-major inset and outset per version, from a literal translation of
// filmic_agx_prepare_bracket that shares no code with derive.ts, run in doubles
// on the anchors parsed from Ansel's source. The same translation in emulated
// float32 lands within 5e-7 of these insets and 7e-6 of the outsets.
const PINNED: Readonly<Record<number, { inset: number[]; outset: number[] }>> = {
  5: {
    inset: [0.656387443352, 0.265555176312, 0.0780573803358, 0.153559138285, 0.798547846372, 0.0478930153427, 0.121671981305, 0.454661902723, 0.423666115972],
    outset: [2.2973562454, -1.14141723777, -0.155939007627, -0.612089609541, 1.8937302905, -0.281640680964, -0.629673371551, -2.7003475985, 4.33002097005],
  },
  6: {
    inset: [0.571306821712, 0.377240813455, 0.0514523648324, 0.150041884793, 0.808699872279, 0.0412582429272, 0.131058962619, 0.505384617268, 0.363556420113],
    outset: [2.65106672289, -1.55431134496, -0.0967553779221, -0.698142938311, 1.97361232984, -0.275469391526, -0.729956085037, -2.94113424322, 4.67109032825],
  },
  7: {
    inset: [0.496968395112, 0.463605770703, 0.0394258341845, 0.133506573186, 0.821151317218, 0.0453421095959, 0.122258532344, 0.545174537737, 0.332566929919],
    outset: [3.0108012077, -1.9699657731, -0.0408354346006, -0.734156508703, 2.04290774994, -0.308751241237, -0.764833398564, -3.05682261754, 4.8216560161],
  },
  8: {
    inset: [0.427879793614, 0.539610071617, 0.0325101347694, 0.109106648433, 0.841403417371, 0.0494899341955, 0.105348437942, 0.574368114931, 0.320283447127],
    outset: [3.38361402576, -2.39791933098, 0.0143053052203, -0.719784616929, 2.0424933422, -0.322708725273, -0.764421138379, -2.92641052133, 4.69083165971],
  },
  9: {
    inset: [0.368477505982, 0.600863136105, 0.030659357913, 0.0760541966124, 0.868408902267, 0.0555369011208, 0.0786899007017, 0.598962361612, 0.322347737686],
    outset: [3.66062361708, -2.71623979319, 0.0556161761092, -0.623595362734, 1.94266129069, -0.319065927957, -0.687412100251, -2.69661164492, 4.38402374517],
  },
};

describe("filmicBracket", () => {
  for (const version of [5, 6, 7, 8, 9]) {
    it(`keeps grey grey for version ${version}`, () => {
      const { inset, outset } = filmicBracket(version);
      near(apply(inset, [1, 1, 1]), [1, 1, 1], 1e-9);
      near(apply(outset, [1, 1, 1]), [1, 1, 1], 1e-9);
      expect(inset).not.toEqual(IDENTITY);
    });
  }

  for (const [version, expected] of Object.entries(PINNED)) {
    it(`matches a literal translation of upstream's construction for version ${version}`, () => {
      const { inset, outset } = filmicBracket(Number(version));
      near(inset, expected.inset, 1e-9);
      near(outset, expected.outset, 1e-9);
    });
  }

  it("differs between bleach levels", () => {
    expect(filmicBracket(5).inset).not.toEqual(filmicBracket(9).inset);
  });

  it("inverts the outset's displacement exactly", () => {
    const recovery = displacedMatrix(7, "outset");
    expect(recovery).not.toBeNull();
    near(mul(filmicBracket(7).outset, recovery!), IDENTITY, 1e-9);
  });

  it("takes the no-bleach anchors for a version outside 5-9, as upstream's default branch does", () => {
    expect(filmicBracket(4)).toEqual(filmicBracket(5));
    expect(filmicBracket(10)).toEqual(filmicBracket(5));
  });

  it("builds a bracket for every variant", () => {
    for (const version of Object.keys(BRACKETS).map(Number)) {
      expect(displacedMatrix(version, "inset"), `inset ${version}`).not.toBeNull();
      expect(displacedMatrix(version, "outset"), `outset ${version}`).not.toBeNull();
    }
  });

  it("refuses primaries that displace onto one point", () => {
    const xyz: Vec3 = [0.4, 0.35, 0.3];
    const xy = { x: 0.38, y: 0.33 };
    const collapsed: Profile = { toXyz: columns(xyz, xyz, xyz), fromXyz: IDENTITY, primaries: [xy, xy, xy], white: xy };
    expect(buildDisplaced(collapsed, [0.5, 0.5, 0.5], [0, 0, 0])).toBeNull();
  });

  it("clamps each primary's inset to 0..0.9, as upstream's CLAMPF does", () => {
    const rotation: Vec3 = [0.02, 0.1, -0.05];
    expect(buildDisplaced(REC2020, [0.95, 1.5, 2], rotation)).toEqual(buildDisplaced(REC2020, [0.9, 0.9, 0.9], rotation));
    expect(buildDisplaced(REC2020, [-0.3, -1, 0], rotation)).toEqual(buildDisplaced(REC2020, [0, 0, 0], rotation));
  });
});

describe("deriveFilmic", () => {
  it("returns every declared uniform, finite", () => {
    const u = deriveFilmic(FILMIC_DEFAULTS);
    const size = { mat3: 9, vec4: 4 } as const;
    for (const [key, type] of Object.entries(FILMIC_UNIFORM_TYPES)) {
      const v = u[key as keyof typeof u];
      expect(v, key).toHaveLength(size[type]);
      for (const n of v) expect(Number.isFinite(n), key).toBe(true);
    }
  });

  it("packs the display range and the hue mix from saturation", () => {
    const u = deriveFilmic({ ...FILMIC_DEFAULTS, saturation: 100 });
    expect(u.fDisplay[0]).toBeCloseTo(0.0001517634, 10);
    expect(u.fDisplay[1]).toBeCloseTo(1, 10);
    expect(u.fLog[3]).toBe(1);
    expect(deriveFilmic({ ...FILMIC_DEFAULTS, saturation: -100 }).fLog[3]).toBe(0);
    expect(deriveFilmic(FILMIC_DEFAULTS).fLog[3]).toBe(0.5);
  });

  it("clamps the hue mix's saturation axis to -100..100 and scales it between", () => {
    expect(deriveFilmic(p({ saturation: 200 })).fLog[3]).toBe(1);
    expect(deriveFilmic(p({ saturation: -200 })).fLog[3]).toBe(0);
    expect(deriveFilmic(p({ saturation: 50 })).fLog[3]).toBe(0.75);
    expect(deriveFilmic(p({ saturation: -50 })).fLog[3]).toBe(0.25);
  });

  describe("packing, on Ansel's introspection defaults (-8/+4 EV, hardness 4)", () => {
    const u = deriveFilmic(p({ black_point_source: -8, white_point_source: 4, auto_hardness: false, output_power: 4 }));

    it("puts each segment's coefficients in x (toe), y (shoulder) and z (line), with 0 in w", () => {
      near(u.fM1, [-0.65201265, 0, -0.39252306, 0], 1e-5);
      near(u.fM2, [1.5, 0, 1.57186793, 0], 1e-5);
      expect(u.fM3[1]).toBeCloseTo(1.9515726, 5);
      expect(u.fM3[2]).toBeCloseTo(Math.pow(0.0001517634, 0.25), 7);
      expect(u.fM4[1]).toBeCloseTo(1.5765993, 5);
      expect(u.fM4[2]).toBeCloseTo(1, 7);
      expect(u.fM5.slice(0, 2)).toEqual([0, 1]);
      for (const m of [u.fM1, u.fM2, u.fM3, u.fM4, u.fM5]) expect(m[3]).toBe(0);
    });

    it("packs the latitude nodes, the white display value and the power", () => {
      near(u.fNodes, [0.6325985, 0.6880248, 1, 4], 1e-7);
    });

    it("packs the log encoding: grey, black EV, dynamic range EV, hue mix", () => {
      expect(u.fLog).toEqual([0.1845, -8, 12, 0.5]);
    });

    it("packs the display black and white as linear values and the two curve types", () => {
      near(u.fDisplay, [0.0001517634, 1, 3, 3], 1e-9);
    });
  });

  it("takes the curve types for fDisplay's z and w", () => {
    const u = deriveFilmic(p({ shadows: CURVE_POLY_4, highlights: CURVE_RATIONAL }));
    expect(u.fDisplay.slice(2)).toEqual([CURVE_POLY_4, CURVE_RATIONAL]);
  });

  it("uses the grey slider as the log encoding's grey only with the custom toggle", () => {
    expect(deriveFilmic(p({ custom_grey: true, grey_point_source: 25 })).fLog[0]).toBe(0.25);
    expect(deriveFilmic(p({ custom_grey: false, grey_point_source: 25 })).fLog[0]).toBe(0.1845);
  });

  it("uses auto hardness's power only with the toggle on", () => {
    const manual = p({ auto_hardness: false, output_power: 3 });
    expect(deriveFilmic(manual).fNodes[3]).toBe(3);
    expect(deriveFilmic(p({ auto_hardness: true, output_power: 3 })).fNodes[3]).toBe(filmicPower(FILMIC_DEFAULTS));
  });

  it("uploads the bracket of the chosen colour science, column-major", () => {
    for (const version of [5, 7, 9]) {
      const u = deriveFilmic(p({ version }));
      const { inset, outset } = filmicBracket(version);
      near(fromColumnMajor(u.fInset), inset, 1e-12);
      near(fromColumnMajor(u.fOutset), outset, 1e-12);
    }
    expect(deriveFilmic(p({ version: 5 })).fInset).not.toEqual(deriveFilmic(p({ version: 9 })).fInset);
  });

  describe("float32 range", () => {
    // Task 7's overflowing M3[1] (the shoulder's perceptual coefficient): finite in doubles, 4.49e39.
    const OVERFLOWS = p({
      black_point_source: -14,
      white_point_source: 2,
      contrast: 3,
      latitude: 35,
      balance: -50,
      auto_hardness: false,
      output_power: 6,
    });
    // Infinity already in doubles.
    const INFINITE = p({
      black_point_source: -16,
      white_point_source: 11,
      contrast: 5,
      latitude: 75,
      balance: -50,
      auto_hardness: false,
      output_power: 2,
    });

    it("packs a perceptual shoulder coefficient float32 cannot hold as 0, Ansel's float result", () => {
      const coefficient = filmicSpline(OVERFLOWS, 6).M3[1];
      expect(Number.isFinite(coefficient)).toBe(true);
      expect(coefficient).toBeGreaterThan(FLT_MAX);
      expect(deriveFilmic(OVERFLOWS).fM3[1]).toBe(0);

      expect(filmicSpline(INFINITE, 2).M3[1]).toBe(Infinity);
      expect(deriveFilmic(INFINITE).fM3[1]).toBe(0);
    });

    it("keeps a hard, soft or safe toe's coefficients and every uniform finite beside that shoulder", () => {
      for (const setting of [OVERFLOWS, INFINITE]) {
        for (const shadows of [CURVE_POLY_4, CURVE_POLY_3, CURVE_RATIONAL]) {
          const params = { ...setting, shadows };
          const label = `power ${setting.output_power}, shadows ${shadows}`;
          const s = filmicSpline(params, filmicPower(params));
          const u = deriveFilmic(params);
          expect(s.M3[0], label).not.toBe(0);
          expect(u.fM3[0], label).toBe(s.M3[0]);
          expect(u.fM3[1], label).toBe(0);
          for (const [key, v] of Object.entries(u)) expect(v.every(Number.isFinite), `${label} ${key}`).toBe(true);
        }
      }
    });

    it("renders that shoulder flat at display white", () => {
      for (const shadows of [CURVE_POLY_4, CURVE_SIGMOID]) {
        const u = deriveFilmic({ ...OVERFLOWS, shadows });
        const [greySource, black, range] = u.fLog;
        const [, latMax] = u.fNodes;
        for (const x of [latMax + 0.01, (latMax + 1) / 2, 0.999]) {
          const v = greySource * 2 ** (x * range + black);
          for (const ch of filmicPixel([v, v, v], u)) expect(ch, `shadows ${shadows}, x ${x}`).toBeCloseTo(u.fDisplay[1], 6);
        }
      }
    });

    it("turns any other value float32 cannot hold into NaN, so the core binds that uniform's default", () => {
      // Both display ends collapse onto grey: the safe shoulder's slope is Infinity in doubles, its radicand negative.
      const collapsed = p({ black_point_target: 20, white_point_target: 10, highlights: CURVE_RATIONAL });
      const s = filmicSpline(collapsed, filmicPower(collapsed));
      expect(s.M2[1]).toBe(Infinity);
      expect(s.M3[1]).toBeNaN();
      const u = deriveFilmic(collapsed);
      expect([u.fM1[1], u.fM2[1], u.fM3[1]].every(Number.isNaN)).toBe(true);
      expect([u.fM1[2], u.fM2[2], u.fM3[2]].every(Number.isFinite)).toBe(true);
    });

    it("keeps the doubles it passes: no rounding to float32", () => {
      const u = deriveFilmic(FILMIC_DEFAULTS);
      const power = filmicPower(FILMIC_DEFAULTS);
      expect(Math.fround(power)).not.toBe(power);
      expect(u.fNodes[3]).toBe(power);
    });
  });

  describe("a perceptual segment's fallback slots", () => {
    // M3[0] is 4.0e39 here (Task 7's unused toe coefficient) while the flag M5[0] is 0 and the shoulder is fine.
    const UNREAD_OVERFLOW = p({
      black_point_source: -14,
      white_point_source: 2,
      contrast: 2.25,
      latitude: 50,
      balance: 50,
      auto_hardness: false,
      output_power: 2,
    });

    it("packs 0 for an unflagged toe, so an overflow nobody reads cannot drop the uniform", () => {
      const s = filmicSpline(UNREAD_OVERFLOW, 2);
      expect(s.M3[0]).toBeGreaterThan(FLT_MAX);
      expect(s.M5[0]).toBe(0);
      expect(Number.isFinite(s.M3[1])).toBe(true);

      const u = deriveFilmic(UNREAD_OVERFLOW);
      expect(u.fM3.every(Number.isFinite)).toBe(true);
      expect([u.fM3[0], u.fM4[0]]).toEqual([0, 0]);
      expect([u.fM3[1], u.fM4[1]]).toEqual([s.M3[1], s.M4[1]]);
      expect([u.fM3[2], u.fM4[2]]).toEqual([s.M3[2], s.M4[2]]);
    });

    it("keeps one slider move finite: custom grey with a zero white target", () => {
      const zeroWhite = p({ custom_grey: true, white_point_target: 0 });
      const s = filmicSpline(zeroWhite, filmicPower(zeroWhite));
      expect(Number.isFinite(s.M3[0])).toBe(false);
      expect(s.M5[0]).toBe(0);
      for (const [key, v] of Object.entries(deriveFilmic(zeroWhite))) expect(v.every(Number.isFinite), key).toBe(true);
    });

    it("keeps every slot a segment reads, whatever the pairing of curve types", () => {
      for (const shadows of [CURVE_POLY_4, CURVE_POLY_3, CURVE_RATIONAL, CURVE_SIGMOID]) {
        for (const highlights of [CURVE_POLY_4, CURVE_POLY_3, CURVE_RATIONAL, CURVE_SIGMOID]) {
          const params = p({ shadows, highlights });
          const s = filmicSpline(params, filmicPower(params));
          const u = deriveFilmic(params);
          const label = `shadows ${shadows}, highlights ${highlights}`;
          // The perceptual toe's flag is 0 on every input the sliders reach, so its slots are unread; the perceptual shoulder's flag is always 1.
          if (shadows === CURVE_SIGMOID) expect(s.M5[0], label).toBe(0);
          if (highlights === CURVE_SIGMOID) expect(s.M5[1], label).toBe(1);
          expect([u.fM3[0], u.fM4[0]], label).toEqual(shadows === CURVE_SIGMOID ? [0, 0] : [s.M3[0], s.M4[0]]);
          expect([u.fM3[1], u.fM4[1]], label).toEqual([s.M3[1], s.M4[1]]);
          expect([u.fM3[2], u.fM4[2]], label).toEqual([s.M3[2], s.M4[2]]);
        }
      }
    });
  });
});
