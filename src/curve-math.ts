// Parametric Tone Mappers, a Safelight extension. GPL-3.0-or-later. See LICENSE.
//
// sigmoidScale transcribes darktable's AgX _scale (src/iop/agx.c L509-553 at
// release-5.6.2) and Ansel's filmic_sigmoid_scale (src/iop/filmicrgb.c
// L3674-3682 at 2fadf8a366), which are the same function. It runs in doubles,
// which is darktable master's fix for the 5.6.2 overflow (Ref §3.4).
// Copyright (C) 2025-2026 darktable developers (src/iop/agx.c).
// Copyright (C) 2019-2020, 2022 Aldric Renaudin; 2019-2026 Aurélien PIERRE; 2019 Diederik ter Rahe; 2019-2022 Pascal Obry; 2019 Tobias Ellinghaus; 2020-2021 Chris Elston; 2020-2022 Diederik Ter Rahe; 2020 Heiko Bauke; 2020-2021 Hubert Kowalski; 2020 Jeronimo Pellegrini; 2020 Marco Carrarini; 2020 Mark-64; 2020 Martin Burri; 2020-2021 Ralf Brown; 2020-2021 rawfiner; 2021 Dan Torop; 2021 Fabio Heer; 2021 lhietal; 2021 luzpaz; 2021 paolodepetrillo; 2021-2022 Sakari Kapanen; 2021 Victor Forsiuk; 2022 Hanno Schwalm; 2022 Martin Bařinka; 2022 Nicolas Auffray; 2022 Philipp Lutz; 2023 Alban Gruin; 2023-2024 Alynx Zhou; 2023 Luca Zulberti; 2025 Guillaume Stutin (src/iop/filmicrgb.c).
// GPL-3.0-or-later.

export const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

const EPS = 1e-6;

/** The scale of the generalised sigmoid u/(1+u^p)^(1/p) that leaves (tx, ty)
 *  at `slope` and reaches (limitX, limitY). */
export function sigmoidScale(
  limitX: number,
  limitY: number,
  tx: number,
  ty: number,
  slope: number,
  power: number,
): number {
  const projected = slope * Math.max(EPS, limitX - tx);
  const actual = Math.max(EPS, limitY - ty);
  const base = Math.max(EPS, Math.pow(actual, -power) - Math.pow(projected, -power));
  return Math.min(1e9, Math.pow(base, -1 / power));
}

/** Solves a·x = b for an n×n row-major `a`, by Gaussian elimination with
 *  partial pivoting, in doubles (upstream's gauss_solve, used for filmic's
 *  polynomial curves). */
export function gaussSolve(a: readonly number[], b: readonly number[], n: number): number[] {
  const m = a.slice();
  const x = b.slice();
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r * n + col]) > Math.abs(m[pivot * n + col])) pivot = r;
    if (pivot !== col) {
      for (let c = 0; c < n; c++) [m[col * n + c], m[pivot * n + c]] = [m[pivot * n + c], m[col * n + c]];
      [x[col], x[pivot]] = [x[pivot], x[col]];
    }
    for (let r = col + 1; r < n; r++) {
      const f = m[r * n + col] / m[col * n + col];
      for (let c = col; c < n; c++) m[r * n + c] -= f * m[col * n + c];
      x[r] -= f * x[col];
    }
  }
  for (let r = n - 1; r >= 0; r--) {
    let s = x[r];
    for (let c = r + 1; c < n; c++) s -= m[r * n + c] * x[c];
    x[r] = s / m[r * n + r];
  }
  return x;
}
