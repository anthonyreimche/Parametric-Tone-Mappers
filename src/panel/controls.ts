// Parametric Tone Mappers, a Safelight extension. GPL-3.0-or-later. See LICENSE.
//
// The tabs, sections and controls of both panels. Labels, tooltips and soft
// ranges are those of darktable's AgX gui_init (src/iop/agx.c L1817-2483) at
// release-5.6.2 and Ansel's filmic rgb gui_init (src/iop/filmicrgb.c
// L5417-5740) at 2fadf8a366, with the first letter capitalised. Upstream wraps
// its tooltips with newlines; they are joined with a space here, except for
// the heading line of the two power sliders. A slider's min and max are
// upstream's soft range in display units (value * scale), so each sits inside
// the param's hard range once divided by scale. The filmic tab tooltips and
// the tooltip text marked "ours" are Safelight's own wording.
// Copyright (C) 2025-2026 darktable developers (src/iop/agx.c).
// Copyright (C) 2019-2020, 2022 Aldric Renaudin; 2019-2026 Aurélien PIERRE; 2019 Diederik ter Rahe; 2019-2022 Pascal Obry; 2019 Tobias Ellinghaus; 2020-2021 Chris Elston; 2020-2022 Diederik Ter Rahe; 2020 Heiko Bauke; 2020-2021 Hubert Kowalski; 2020 Jeronimo Pellegrini; 2020 Marco Carrarini; 2020 Mark-64; 2020 Martin Burri; 2020-2021 Ralf Brown; 2020-2021 rawfiner; 2021 Dan Torop; 2021 Fabio Heer; 2021 lhietal; 2021 luzpaz; 2021 paolodepetrillo; 2021-2022 Sakari Kapanen; 2021 Victor Forsiuk; 2022 Hanno Schwalm; 2022 Martin Bařinka; 2022 Nicolas Auffray; 2022 Philipp Lutz; 2023 Alban Gruin; 2023-2024 Alynx Zhou; 2023 Luca Zulberti; 2025 Guillaume Stutin (src/iop/filmicrgb.c).
// GPL-3.0-or-later.

import { AGX_BASE_PRIMARIES, type AgxParams } from "../agx/params";
import { FILMIC_CURVES, FILMIC_VERSIONS, type FilmicParams } from "../filmic/params";

export type Unit = "" | "EV" | "%" | "°";
export type ActionId = "agxAutoTune" | "agxReadExposure" | "agxSetFromAbove" | "filmicAutoTune";

type Key<P> = keyof P & string;

// `reset` is the value a slider's double-click sets, in stored units, where
// upstream sets one; `enabled` greys a control out where `when` would hide it.
// Highlights and shadows ("direct") are not params: their span and reset are
// upstream's, in %.
export type Control<P> =
  | { kind: "slider"; key: Key<P>; label: string; tooltip: string; min: number; max: number; step: number; unit: Unit; scale: number; when?: (p: P) => boolean; reset?: number }
  | { kind: "toggle"; key: Key<P>; label: string; tooltip: string; when?: (p: P) => boolean }
  | { kind: "select"; key: Key<P>; label: string; tooltip: string; options: readonly (readonly [number, string])[]; when?: (p: P) => boolean }
  | { kind: "pivot"; label: string; tooltip: string }
  | { kind: "direct"; side: "toe" | "shoulder"; label: string; tooltip: string; min: number; max: number; reset: number }
  | { kind: "action"; id: ActionId; label: string; tooltip: string; when?: (p: P) => boolean; enabled?: (p: P) => boolean }
  | { kind: "graph" };

export interface SectionSpec<P> {
  title: string;
  /** Collapsible, and collapsed until the viewer opens it (remembered per viewer). */
  collapsed?: boolean;
  controls: readonly Control<P>[];
  when?: (p: P) => boolean;
}

export interface TabSpec<P> {
  value: string;
  label: string;
  tooltip: string;
  sections: readonly SectionSpec<P>[];
}

const PCT = 100;
const DEG = 180 / Math.PI;

function slider<P>(key: Key<P>, label: string, tooltip: string, min: number, max: number, step: number, unit: Unit = "", scale = 1, when?: (p: P) => boolean, reset?: number): Control<P> {
  return { kind: "slider", key, label, tooltip, min, max, step, unit, scale, when, reset };
}

// A key alone can't tell TypeScript which params a slider belongs to.
const agxSlider = slider<AgxParams>;
const filmicSlider = slider<FilmicParams>;

/** First letter capitalised, unless it starts a camel-case name such as sRGB. */
function cap(s: string): string {
  return /^[a-z][A-Z]/.test(s) ? s : s.charAt(0).toUpperCase() + s.slice(1);
}

const TOWARD = {
  red: "yellow (+) or magenta (-)",
  green: "cyan (+) or yellow (-)",
  blue: "magenta (+) or cyan (-)",
} as const;

/** The attenuation and rotation sliders before the curve, or the purity boost
 *  and reverse rotation sliders after it, for red, green and blue. Upstream
 *  resets all of them to 0 on a double-click (agx.c L2204, L2230). */
function primaryRows(stage: "before" | "after", when?: (p: AgxParams) => boolean): Control<AgxParams>[] {
  return (["red", "green", "blue"] as const).flatMap((c): Control<AgxParams>[] =>
    stage === "before"
      ? [
          agxSlider(`${c}_inset`, `${cap(c)} attenuation`, `Increase to desaturate ${c}s in highlights faster`, 0, 99, 0.1, "%", PCT, when, 0),
          agxSlider(`${c}_rotation`, `${cap(c)} rotation`, `Shift the ${c} primary towards ${TOWARD[c]}`, -30, 30, 0.1, "°", DEG, when, 0),
        ]
      : [
          agxSlider(`${c}_outset`, `${cap(c)} purity boost`, `Restore the purity of ${c}, mostly in midtones and shadows`, 0, 99, 0.1, "%", PCT, when, 0),
          agxSlider(`${c}_unrotation`, `${cap(c)} reverse rotation`, `Reverse the color shift in ${c}s`, -30, 30, 0.1, "°", DEG, when, 0),
        ],
  );
}

// 0 ("export profile") is left out on purpose: it renders as Rec2020. The
// panel's fallback for a stored 0 shows options[1], so Rec2020 must stay at
// index 1.
const BASE_PRIMARY_OPTIONS = [1, 2, 3, 4, 5].map((v) => [v, cap(AGX_BASE_PRIMARIES[v])] as const);
const CURVE_OPTIONS = FILMIC_CURVES.map((name, v) => [v, cap(name)] as const);
const VERSION_OPTIONS = [5, 6, 7, 8, 9].map((v) => [v, cap(FILMIC_VERSIONS[v])] as const);

const primariesOn = (p: AgxParams): boolean => !p.disable_primaries_adjustments;
const restoreOn = (p: AgxParams): boolean => !p.completely_reverse_primaries;

export const AGX_TABS: readonly TabSpec<AgxParams>[] = [
  {
    value: "settings",
    label: "Settings",
    tooltip: "Main look and curve settings",
    sections: [
      {
        title: "Input exposure range",
        controls: [
          agxSlider("range_white_relative_ev", "White relative exposure", "Relative exposure above mid-gray (white point)", 1, 10, 0.01, "EV"),
          agxSlider("range_black_relative_ev", "Black relative exposure", "Relative exposure below mid-gray (black point)", -20, -1, 0.01, "EV"),
          agxSlider(
            "dynamic_range_scaling",
            "Dynamic range scaling",
            "Symmetrically increase or decrease the computed dynamic range. useful to give a safety margin to extreme luminances.",
            -50, 50, 0.1, "%", PCT,
          ),
          // ours: upstream's text names a darktable/Ansel control Safelight doesn't have
          { kind: "action", id: "agxAutoTune", label: "Auto tune levels", tooltip: "Set black and white relative exposure from the image in view" },
          // ours: upstream's text names a darktable/Ansel control Safelight doesn't have
          { kind: "action", id: "agxReadExposure", label: "Read exposure", tooltip: "Read exposure from the Exposure slider" },
        ],
      },
      {
        title: "Basic curve parameters",
        controls: [
          { kind: "pivot", label: "Pivot relative exposure", tooltip: "Set the pivot's input exposure in EV relative to mid-gray" },
          agxSlider("curve_pivot_y_linear_output", "Pivot target output", "Darken or brighten the pivot (linear output power)", 0, 100, 0.1, "%", PCT),
          agxSlider("curve_contrast_around_pivot", "Contrast", "Slope of the linear section around the pivot", 0.1, 5, 0.01),
          agxSlider(
            "curve_shoulder_power",
            "Shoulder power",
            "Contrast in highlights\nhigher values keep the slope nearly constant for longer, at the cost of a more sudden drop near white",
            1, 5, 0.01,
          ),
          agxSlider(
            "curve_toe_power",
            "Toe power",
            "Contrast in shadows\nhigher values keep the slope nearly constant for longer, at the cost of a more sudden drop near black",
            1, 5, 0.01,
          ),
        ],
      },
      { title: "Show curve", collapsed: true, controls: [{ kind: "graph" }] },
      {
        title: "Advanced curve parameters",
        collapsed: true,
        controls: [
          agxSlider("curve_linear_ratio_above_pivot", "Shoulder start", "Length to keep curve linear above the pivot. may clip highlights", 0, 100, 0.1, "%", PCT),
          agxSlider("curve_target_display_white_ratio", "Target white", "Max linear output power", 50, 100, 0.1, "%", PCT),
          agxSlider("curve_linear_ratio_below_pivot", "Toe start", "Length to keep curve linear below the pivot. may crush shadows", 0, 100, 0.1, "%", PCT),
          agxSlider("curve_target_display_black_ratio", "Target black", "Raise for a faded look", 0, 2.5, 0.01, "%", PCT),
          {
            kind: "toggle",
            key: "auto_gamma",
            label: "Keep the pivot on the diagonal",
            tooltip: "Adjusts the gamma automatically, trying to make sure the curve always remains S-shaped (given that contrast is high enough), so toe and shoulder controls remain effective.",
          },
          agxSlider(
            "curve_gamma",
            "Curve y gamma",
            "Shifts the representation (but not the output power) of the pivot along the y axis of the curve. immediate contrast around the pivot is not affected, but shadows and highlights are; you may have to counteract it with the contrast slider or with toe / shoulder controls.",
            1, 5, 0.01, "", 1, (p) => !p.auto_gamma,
          ),
        ],
      },
      {
        title: "Look",
        collapsed: true,
        controls: [
          agxSlider("look_slope", "Slope", "Decrease or increase contrast and brightness", 0, 2, 0.01),
          agxSlider("look_lift", "Lift", "Deepen or lift shadows", -0.5, 0.5, 0.01),
          agxSlider("look_brightness", "Brightness", "Increase or decrease brightness", 0, 2, 0.01),
          agxSlider("look_saturation", "Saturation", "Decrease or increase saturation", 0, 200, 0.1, "%", PCT),
          agxSlider("look_original_hue_mix_ratio", "Preserve hue", "Increase to bring hues closer to the original", 0, 100, 0.1, "%", PCT),
        ],
      },
    ],
  },
  {
    value: "primaries",
    label: "Primaries",
    tooltip: "Color primaries adjustments",
    sections: [
      {
        title: "Base",
        controls: [
          {
            kind: "select",
            key: "base_primaries",
            label: "Base primaries",
            // ours: the second sentence, as Safelight's working profile is Rec2020
            tooltip: "Color space primaries to use as the base for below adjustments. Working profile is Rec2020 here.",
            options: BASE_PRIMARY_OPTIONS,
          },
          {
            kind: "toggle",
            key: "disable_primaries_adjustments",
            label: "Disable adjustments",
            tooltip: "Disable purity adjustments and rotations, only applying the curve. note that those adjustments are at the heart of AgX, without them the results are almost always going to be worse, especially with bright, saturated lights (e.g. LEDs). mainly intended to be used for experimenting.",
          },
        ],
      },
      { title: "Before tone mapping", when: primariesOn, controls: primaryRows("before") },
      {
        title: "After tone mapping",
        when: primariesOn,
        controls: [
          {
            kind: "toggle",
            key: "completely_reverse_primaries",
            label: "Reverse all",
            tooltip: "Completely restore purity, undo all rotations, and hide the controls below. uncheck to restore the previous state.",
          },
          {
            kind: "action",
            id: "agxSetFromAbove",
            label: "Set from above",
            tooltip: "Set parameters to completely reverse primaries modifications, but allow subsequent editing",
            enabled: restoreOn,
          },
          agxSlider("master_outset_ratio", "Master purity boost", "Overall purity boost", 0, 200, 0.1, "%", PCT, restoreOn, 1),
          agxSlider("master_unrotation_ratio", "Master rotation reversal", "Overall unrotation ratio", 0, 200, 0.1, "%", PCT, restoreOn, 1),
          ...primaryRows("after", restoreOn),
        ],
      },
    ],
  },
];

const customGrey = (p: FilmicParams): boolean => p.custom_grey;

export const FILMIC_TABS: readonly TabSpec<FilmicParams>[] = [
  {
    value: "scene",
    label: "Scene",
    tooltip: "The scene's exposure range",
    sections: [
      {
        title: "Scene",
        controls: [
          filmicSlider(
            "grey_point_source",
            "Middle gray luminance",
            "Adjust to match the average luminance of the image's subject. the value entered here will then be remapped to 18.45%. decrease the value to increase the overall brightness.",
            0.1, 36, 0.01, "%", 1, customGrey,
          ),
          filmicSlider(
            "white_point_source",
            "White relative exposure",
            "Number of stops between middle gray and pure white. this is a reading a lightmeter would give you on the scene. adjust so highlights clipping is avoided",
            2, 8, 0.01, "EV",
          ),
          filmicSlider(
            "black_point_source",
            "Black relative exposure",
            "Number of stops between middle gray and pure black. this is a reading a lightmeter would give you on the scene. increase to get more contrast. decrease to recover more details in low-lights.",
            -14, -3, 0.01, "EV",
          ),
          filmicSlider(
            "security_factor",
            "Dynamic range scaling",
            "Symmetrically enlarge or shrink the computed dynamic range. useful to give a safety margin to extreme luminances.",
            -50, 50, 0.1, "%",
          ),
          {
            kind: "action",
            id: "filmicAutoTune",
            label: "Auto tune levels",
            tooltip: "Try to optimize the settings with some statistical assumptions. this will fit the luminance range inside the histogram bounds. works better for landscapes and evenly-lit pictures but fails for high-keys, low-keys and high-ISO pictures. this is not an artificial intelligence, but a simple guess. ensure you understand its assumptions before using it.",
          },
        ],
      },
      {
        title: "Advanced",
        controls: [
          {
            kind: "toggle",
            key: "custom_grey",
            label: "Use custom middle-gray values",
            // ours: upstream's text names a darktable/Ansel control Safelight doesn't have
            tooltip: "Enable to input custom middle-gray values. this is not recommended in general. fix the global exposure with the Exposure slider instead. disable to use standard 18.45 % middle gray.",
          },
        ],
      },
    ],
  },
  {
    value: "look",
    label: "Look",
    tooltip: "The curve and the colour rendering",
    sections: [
      {
        title: "Tone mapping",
        controls: [
          filmicSlider("contrast", "Contrast", "Slope of the linear part of the curve affects mostly the mid-tones", 0.5, 3, 0.001),
          filmicSlider(
            "output_power",
            "Hardness",
            "Equivalent to paper grade in analog. increase to make highlights brighter and less compressed. decrease to mute highlights.",
            1, 10, 0.01, "", 1, (p) => !p.auto_hardness,
          ),
          {
            kind: "direct",
            side: "shoulder",
            label: "Highlights",
            tooltip: "Distance between middle gray and the start of the highlights roll-off. 0% keeps the shoulder at middle gray, 100% pushes it to the point where the current slope would hit the output white level.",
            min: 0.1,
            max: 90,
            reset: 10,
          },
          {
            kind: "direct",
            side: "toe",
            label: "Shadows",
            tooltip: "Distance between middle gray and the start of the shadows roll-off. 0% keeps the toe at middle gray, 100% pushes it to the point where the current slope would hit the output black level.",
            min: 0.1,
            max: 90,
            reset: 10,
          },
          {
            kind: "select",
            key: "highlights",
            label: "Contrast in highlights",
            tooltip: "Shape of the highlights roll-off of the curve. perceptual (default) is a generalized sigmoid derived from a perceptual appearance model: always smooth and monotonic. hard/soft/safe are the legacy polynomial/rational segments; hard compresses highlights more, soft less.",
            options: CURVE_OPTIONS,
          },
          {
            kind: "select",
            key: "shadows",
            label: "Contrast in shadows",
            tooltip: "Shape of the shadows roll-off of the curve. perceptual (default) is a generalized sigmoid derived from a perceptual appearance model: always smooth and monotonic. hard/soft/safe are the legacy polynomial/rational segments; hard compresses shadows more, soft less.",
            options: CURVE_OPTIONS,
          },
          { kind: "graph" },
        ],
      },
      {
        title: "Color mapping",
        controls: [
          filmicSlider(
            "saturation",
            "Color preservation",
            "How much of the per-channel hue drift to keep. saturation is not affected: valid diffuse colors (skin tones, product colors) keep their saturation and strongly compressed colors bleach, at any setting. -100% is pure AgX: full hue drift (the 'film' look). 0% (default) removes half the hue drift. +100% restores the original hues exactly.",
            -100, 100, 0.1, "%",
          ),
        ],
      },
      {
        title: "Advanced",
        controls: [
          {
            kind: "select",
            key: "version",
            label: "Color science",
            tooltip: "V8 tone maps each RGB channel separately in an inset rendering space: highlights bleach toward white and hues drift as tonal compression increases, with a parametric hue recovery on the color preservation slider.",
            options: VERSION_OPTIONS,
          },
          {
            kind: "toggle",
            key: "auto_hardness",
            label: "Auto adjust hardness",
            tooltip: "Enable to auto-set the look hardness depending on the scene white and black points. this keeps the middle gray on the identity line and improves fast tuning. disable if you want a manual control.",
          },
        ],
      },
    ],
  },
  {
    value: "display",
    label: "Display",
    tooltip: "The output's black, grey and white",
    sections: [
      {
        title: "Display",
        controls: [
          filmicSlider("black_point_target", "Target black luminance", "Luminance of output pure black, this should be 0% except if you want a faded look", 0, 20, 0.0001, "%"),
          filmicSlider(
            "grey_point_target",
            "Target middle gray",
            "Middle gray value of the target display or color space. you should never touch that unless you know what you are doing.",
            1, 50, 0.01, "%", 1, customGrey,
          ),
          filmicSlider("white_point_target", "Target white luminance", "Luminance of output pure white, this should be 100% except if you want a faded look", 0, 100, 0.01, "%"),
        ],
      },
    ],
  },
];
