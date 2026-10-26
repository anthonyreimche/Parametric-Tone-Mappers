// Parametric Tone Mappers, a Safelight extension. GPL-3.0-or-later. See LICENSE.
//
// The couplings upstream's GUI applies between sliders, as pure functions of
// the params. Transcribes darktable's AgX _update_pivot_x (src/iop/agx.c
// L1021-1040), gui_changed (L1754-1804) and _set_post_curve_primaries_from_pre_callback
// (L2123-2140) at release-5.6.2, and Ansel's filmic_v3_legacy_to_direct and
// filmic_v3_direct_to_legacy (src/iop/filmicrgb.c L571-620) and gui_changed
// (L5742-5784) at 2fadf8a366. It runs in doubles where upstream runs in floats.
// Copyright (C) 2025-2026 darktable developers (src/iop/agx.c).
// Copyright (C) 2019-2020, 2022 Aldric Renaudin; 2019-2026 Aurélien PIERRE; 2019 Diederik ter Rahe; 2019-2022 Pascal Obry; 2019 Tobias Ellinghaus; 2020-2021 Chris Elston; 2020-2022 Diederik Ter Rahe; 2020 Heiko Bauke; 2020-2021 Hubert Kowalski; 2020 Jeronimo Pellegrini; 2020 Marco Carrarini; 2020 Mark-64; 2020 Martin Burri; 2020-2021 Ralf Brown; 2020-2021 rawfiner; 2021 Dan Torop; 2021 Fabio Heer; 2021 lhietal; 2021 luzpaz; 2021 paolodepetrillo; 2021-2022 Sakari Kapanen; 2021 Victor Forsiuk; 2022 Hanno Schwalm; 2022 Martin Bařinka; 2022 Nicolas Auffray; 2022 Philipp Lutz; 2023 Alban Gruin; 2023-2024 Alynx Zhou; 2023 Luca Zulberti; 2025 Guillaume Stutin (src/iop/filmicrgb.c).
// GPL-3.0-or-later.
//
// Every clamp here has constant bounds with low < high, or (agxPivotX) bounds
// that keep black < 0 < white (the ends' hard ranges), so darktable's CLAMPF
// and glib's CLAMP both agree with curve-math's clamp for every number the
// declared ranges allow.

import { AGX_PARAMS, type AgxParams } from "../agx/params";
import { clamp } from "../curve-math";
import { filmicGeometry, filmicPower } from "../filmic/derive";
import { FILMIC_PARAMS, type FilmicParams } from "../filmic/params";
import { withinRange } from "../param-table";

const PIVOT_EPSILON = 1e-6;

/** The pivot's exposure in EV relative to mid-gray. */
export const agxPivotEv = (p: AgxParams): number =>
  p.range_black_relative_ev + p.curve_pivot_x * (p.range_white_relative_ev - p.range_black_relative_ev);

/** curve_pivot_x that puts the pivot at `ev`, clamped into the range. */
export function agxPivotX(range: { black: number; white: number }, ev: number): number {
  return (clamp(ev, range.black, range.white) - range.black) / (range.white - range.black);
}

/** An AgX edit with darktable's GUI couplings: dynamic range scaling
 *  rescales both ends, moving black or white keeps the pivot's EV, and with
 *  auto gamma the stored gamma follows the pivot. darktable stores the
 *  rescaled ends unclamped; Safelight stores them held to their hard range,
 *  so the pivot is solved against the held ends and keeps its EV. */
export function agxEdit(prev: AgxParams, patch: Partial<AgxParams>): Partial<AgxParams> {
  const out: Partial<AgxParams> = { ...patch };
  const scaling = patch.dynamic_range_scaling;
  if (scaling !== undefined && scaling !== prev.dynamic_range_scaling) {
    const ratio = (scaling - prev.dynamic_range_scaling) / (prev.dynamic_range_scaling + 1);
    Object.assign(out, withinRange(AGX_PARAMS, {
      range_black_relative_ev: prev.range_black_relative_ev * (1 + ratio),
      range_white_relative_ev: prev.range_white_relative_ev * (1 + ratio),
    }));
  }
  const black = out.range_black_relative_ev ?? prev.range_black_relative_ev;
  const white = out.range_white_relative_ev ?? prev.range_white_relative_ev;
  const moved = black !== prev.range_black_relative_ev || white !== prev.range_white_relative_ev;
  if (moved && patch.curve_pivot_x === undefined) out.curve_pivot_x = agxPivotX({ black, white }, agxPivotEv(prev));
  const next = { ...prev, ...out };
  if (next.auto_gamma && next.curve_pivot_y_linear_output > 0) {
    const x = clamp(next.curve_pivot_x, PIVOT_EPSILON, 1 - PIVOT_EPSILON);
    out.curve_gamma = Math.log2(next.curve_pivot_y_linear_output) / Math.log2(x);
  }
  return out;
}

/** The "set from above" button: the purity restore mirrors the attenuation. */
export const agxSetFromAbove = (p: AgxParams): Partial<AgxParams> => ({
  master_outset_ratio: 1,
  master_unrotation_ratio: 1,
  red_outset: p.red_inset,
  green_outset: p.green_inset,
  blue_outset: p.blue_inset,
  red_unrotation: p.red_rotation,
  green_unrotation: p.green_rotation,
  blue_unrotation: p.blue_rotation,
});

// C's fmaxf and fminf answer the other operand when one is NaN; Math.max and Math.min answer NaN.
const fmaxf = (a: number, b: number): number => (Number.isNaN(a) ? b : Number.isNaN(b) ? a : Math.max(a, b));
const fminf = (a: number, b: number): number => (Number.isNaN(a) ? b : Number.isNaN(b) ? a : Math.min(a, b));

function spans(p: FilmicParams) {
  const g = filmicGeometry(p, filmicPower(p));
  return { g, toeSpan: fmaxf(g.greyLog - g.xmin, 1e-6), shoulderSpan: fmaxf(g.xmax - g.greyLog, 1e-6) };
}

/** Ansel's highlights and shadows sliders (%) for the stored latitude and
 *  balance. A geometry that is NaN (contrast 0 over a grey of 0) shows the
 *  latitude for both, as Ansel does when it has no geometry (L576-580). */
export function filmicDirect(p: FilmicParams): { toe: number; shoulder: number } {
  const { g, toeSpan, shoulderSpan } = spans(p);
  const latitude = clamp(p.latitude, 0, 100) / 100;
  const balance = clamp(p.balance, -50, 50) / 100;
  let toeLog = (1 - latitude) * g.greyLog + latitude * g.xmin;
  let shoulderLog = (1 - latitude) * g.greyLog + latitude * g.xmax;
  const correction = balance > 0 ? 2 * balance * (shoulderLog - g.greyLog) : 2 * balance * (g.greyLog - toeLog);
  toeLog = fmaxf(toeLog - correction, g.xmin);
  shoulderLog = fminf(shoulderLog - correction, g.xmax);
  const toe = clamp((g.greyLog - toeLog) / toeSpan, 0, 1) * 100;
  const shoulder = clamp((shoulderLog - g.greyLog) / shoulderSpan, 0, 1) * 100;
  if (Number.isFinite(toe) && Number.isFinite(shoulder)) return { toe, shoulder };
  const stored = clamp(p.latitude, 0, 100);
  return { toe: stored, shoulder: stored };
}

/** The latitude and balance a highlights/shadows pair stores; the stored
 *  ones when the pair is not a number, as Ansel keeps them without a geometry (L594-599). */
export function filmicLatitudeBalance(p: FilmicParams, toe: number, shoulder: number): { latitude: number; balance: number } {
  const { toeSpan, shoulderSpan } = spans(p);
  const t = clamp(toe, 0, 100) / 100;
  const s = clamp(shoulder, 0, 100) / 100;
  const latitude = clamp((toeSpan * t + shoulderSpan * s) / (toeSpan + shoulderSpan), 0, 1);
  let balance = 0;
  if (latitude > 1e-6) {
    if (t > s) balance = 0.5 * (1 - s / latitude);
    else if (s > t) balance = 0.5 * (t / latitude - 1);
  }
  const out = { latitude: latitude * 100, balance: clamp(balance, -0.5, 0.5) * 100 };
  return Number.isFinite(out.latitude) && Number.isFinite(out.balance) ? out : { latitude: p.latitude, balance: p.balance };
}

const SCENE_KEYS = ["security_factor", "grey_point_source", "black_point_source", "white_point_source", "auto_hardness"] as const;

// Ansel derives the power from the rescaled ends and stores them unclamped.
// Safelight stores the ends held to their hard range (infinite on a grey
// source of 0), so it derives the power from them, and the stored power then
// equals what renders.
const heldEnds = (black: number, white: number): Partial<FilmicParams> =>
  withinRange(FILMIC_PARAMS, { black_point_source: black, white_point_source: white });

/** A filmic edit with Ansel's gui_changed couplings. The written power is
 *  held to the declared [1, 10], where Ansel stores the raw value; the power
 *  that renders is filmicPower, unclamped. Ansel renders its stored power and
 *  Safelight the derived one while auto hardness is on, so switching it off
 *  writes the power that rendered, and the look does not change. */
export function filmicEdit(prev: FilmicParams, patch: Partial<FilmicParams>): Partial<FilmicParams> {
  const out: Partial<FilmicParams> = { ...patch };
  if (patch.security_factor !== undefined && patch.security_factor !== prev.security_factor) {
    const ratio = (patch.security_factor - prev.security_factor) / (prev.security_factor + 100);
    Object.assign(out, heldEnds(
      prev.black_point_source + ratio * prev.black_point_source,
      prev.white_point_source + ratio * prev.white_point_source,
    ));
  }
  if (patch.grey_point_source !== undefined && patch.grey_point_source !== prev.grey_point_source) {
    const shift = Math.log2(prev.grey_point_source / patch.grey_point_source);
    Object.assign(out, heldEnds(prev.black_point_source - shift, prev.white_point_source + shift));
  }
  const next = { ...prev, ...out };
  if (next.auto_hardness && SCENE_KEYS.some((k) => patch[k] !== undefined)) {
    out.output_power = clamp(filmicPower(next), 1, 10);
  } else if (prev.auto_hardness && patch.auto_hardness === false && patch.output_power === undefined) {
    out.output_power = clamp(filmicPower(prev), 1, 10);
  }
  return out;
}
