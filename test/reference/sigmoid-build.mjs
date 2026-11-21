// Builds test/reference/sigmoid-fixtures.json from darktable's own C code.
//
// Copies sections of src/iop/sigmoid.c, src/common/custom_primaries.c and
// src/common/colorspaces.c (release-5.6.2) verbatim into
// .build/sigmoid_core.c, behind a small shim for the darktable headers they
// lean on, compiles sigmoid-harness.c with gcc, runs it over the cases below
// and writes what it printed. The unit tests read the fixtures, so they need
// neither gcc nor the upstream source.
//
// The upstream files are fetched once into .build/ (DARKTABLE_SOURCE points
// at a darktable checkout instead). The profiles are the extension's own
// (src/colour/profiles.ts): darktable reads them from lcms2, the harness is
// handed the same numbers. CC names the compiler (default gcc).

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const build = join(here, ".build");
const UPSTREAM_COMMIT = "20891f6c6fa7be995e5bf9dff9d1ee5062051773";
const FILES = ["src/iop/sigmoid.c", "src/common/custom_primaries.c", "src/common/colorspaces.c"];

mkdirSync(build, { recursive: true });

async function upstream(file) {
  if (process.env.DARKTABLE_SOURCE) return readFileSync(join(process.env.DARKTABLE_SOURCE, file), "utf8");
  const cached = join(build, file.replace(/\//g, "_"));
  if (!existsSync(cached)) {
    const res = await fetch(`https://raw.githubusercontent.com/darktable-org/darktable/${UPSTREAM_COMMIT}/${file}`);
    if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
    writeFileSync(cached, await res.text());
  }
  return readFileSync(cached, "utf8");
}

const [sigmoid, customPrimaries, colorspaces] = (await Promise.all(FILES.map(upstream))).map((s) => s.replace(/\r\n/g, "\n"));

/** The text from the line holding `start` up to (not including) the line holding `end`, or to the end. */
function section(c, name, start, end) {
  const a = c.indexOf(start);
  if (a < 0) throw new Error(`${name} has no "${start}"`);
  const from = c.lastIndexOf("\n", a) + 1;
  if (end === undefined) return c.slice(from);
  const b = c.indexOf(end, a);
  if (b < 0) throw new Error(`${name} has no "${end}" after "${start}"`);
  return c.slice(from, c.lastIndexOf("\n", b) + 1);
}

const SHIM = `#define _USE_MATH_DEFINES
#include <float.h>
#include <math.h>
#include <stddef.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
typedef int gboolean;
#define TRUE 1
#define FALSE 0
#define DT_OMP_DECLARE_SIMD(...)
#define DT_OMP_FOR(...)
#define M_PI_F 3.14159265358979323846f
#define DT_PIXEL_SIMD_CHANNELS 4
#define for_each_channel(_var, ...) for (size_t _var = 0; _var < DT_PIXEL_SIMD_CHANNELS; _var++)
typedef float dt_aligned_pixel_t[4];
typedef float dt_colormatrix_t[4][4];
static inline gboolean dt_isnan(const float val) { return isnan(val); }
static inline float min3f(const float *array) { return fminf(fminf(array[0], array[1]), array[2]); }
static inline float deg2radf(const float deg) { return deg * M_PI_F / 180.f; }
/* src/common/dttypes.h */
static inline void dt_colormatrix_mul(dt_colormatrix_t dst, const dt_colormatrix_t m1, const dt_colormatrix_t m2)
{
  for(int k = 0; k < 3; ++k)
  {
    dt_aligned_pixel_t sum = { 0.0f };
    for_each_channel(i)
    {
      for(int j = 0; j < 3; j++)
        sum[i] += m1[k][j] * m2[j][i];
      dst[k][i] = sum[i];
    }
  }
}
/* src/common/colorspaces_inline_conversions.h */
static inline void dt_apply_transposed_color_matrix(const dt_aligned_pixel_t in, const dt_colormatrix_t matrix,
                                                    dt_aligned_pixel_t out)
{
  for_each_channel(r)
    out[r] = matrix[0][r] * in[0] + matrix[1][r] * in[1] + matrix[2][r] * in[2];
}
/* src/common/matrices.c */
static int mat3SSEinv(dt_colormatrix_t dst, const dt_colormatrix_t src)
{
#define A(y, x) src[(y - 1)][(x - 1)]
#define B(y, x) dst[(y - 1)][(x - 1)]
  const float det = A(1, 1) * (A(3, 3) * A(2, 2) - A(3, 2) * A(2, 3))
                    - A(2, 1) * (A(3, 3) * A(1, 2) - A(3, 2) * A(1, 3))
                    + A(3, 1) * (A(2, 3) * A(1, 2) - A(2, 2) * A(1, 3));
  const float epsilon = 1e-7f;
  if(fabsf(det) < epsilon) return 1;
  const float invDet = 1.f / det;
  B(1, 1) = invDet * (A(3, 3) * A(2, 2) - A(3, 2) * A(2, 3));
  B(1, 2) = -invDet * (A(3, 3) * A(1, 2) - A(3, 2) * A(1, 3));
  B(1, 3) = invDet * (A(2, 3) * A(1, 2) - A(2, 2) * A(1, 3));
  B(2, 1) = -invDet * (A(3, 3) * A(2, 1) - A(3, 1) * A(2, 3));
  B(2, 2) = invDet * (A(3, 3) * A(1, 1) - A(3, 1) * A(1, 3));
  B(2, 3) = -invDet * (A(2, 3) * A(1, 1) - A(2, 1) * A(1, 3));
  B(3, 1) = invDet * (A(3, 2) * A(2, 1) - A(3, 1) * A(2, 2));
  B(3, 2) = -invDet * (A(3, 2) * A(1, 1) - A(3, 1) * A(1, 2));
  B(3, 3) = invDet * (A(2, 2) * A(1, 1) - A(2, 1) * A(1, 2));
#undef A
#undef B
  return 0;
}
/* src/common/iop_profile.h, the fields sigmoid reads */
typedef struct dt_iop_order_iccprofile_info_t
{
  dt_colormatrix_t matrix_in_transposed;
  dt_colormatrix_t matrix_out_transposed;
  float primaries[3][2];
  float whitepoint[2];
} dt_iop_order_iccprofile_info_t;
typedef enum dt_colorspaces_color_profile_type_t
{
  DT_COLORSPACE_LIN_REC2020 = 1,
  DT_COLORSPACE_DISPLAY_P3 = 2,
  DT_COLORSPACE_ADOBERGB = 3,
  DT_COLORSPACE_SRGB = 4,
} dt_colorspaces_color_profile_type_t;
typedef enum { DT_INTENT_RELATIVE_COLORIMETRIC = 1 } dt_iop_color_intent_t;
typedef struct dt_develop_t dt_develop_t;
typedef struct dt_dev_pixelpipe_t { int unused; } dt_dev_pixelpipe_t;
typedef struct dt_dev_pixelpipe_iop_t { void *data; dt_dev_pixelpipe_t *pipe; } dt_dev_pixelpipe_iop_t;
typedef struct dt_iop_module_t { dt_develop_t *dev; } dt_iop_module_t;
typedef void dt_iop_params_t;
typedef struct dt_iop_roi_t { int width, height; } dt_iop_roi_t;
/* darktable keeps one profile info per type; the pipe's working profile is one of them. */
static dt_iop_order_iccprofile_info_t profiles[5];
static int work_profile = 4;
static const dt_iop_order_iccprofile_info_t *dt_ioppr_get_pipe_work_profile_info(const dt_dev_pixelpipe_t *p)
{
  (void)p;
  return &profiles[work_profile];
}
static const dt_iop_order_iccprofile_info_t *dt_ioppr_add_profile_info_to_list(dt_develop_t *dev,
    const dt_colorspaces_color_profile_type_t type, const char *filename, const int intent)
{
  (void)dev; (void)filename; (void)intent;
  return &profiles[type];
}
`;

const core = [
  SHIM,
  "/* src/common/custom_primaries.c */",
  section(customPrimaries, "custom_primaries.c", "static inline float _determinant"),
  "/* src/common/colorspaces.c */",
  section(colorspaces, "colorspaces.c", "static inline float _sanitizeY", "// exhaustive switch with no default"),
  "/* src/iop/sigmoid.c */",
  section(sigmoid, "sigmoid.c", "#define MIDDLE_GREY", "int legacy_params"),
  section(sigmoid, "sigmoid.c", "typedef struct dt_iop_sigmoid_data_t", "typedef struct dt_iop_sigmoid_gui_data_t"),
  section(sigmoid, "sigmoid.c", "// Declared here as it is used in the commit params function", "#ifdef HAVE_OPENCL"),
].join("\n");

writeFileSync(join(build, "sigmoid_core.c"), core);
writeFileSync(join(build, "harness.c"), readFileSync(join(here, "sigmoid-harness.c"), "utf8"));
const compile = (name, defines) => {
  const exe = join(build, process.platform === "win32" ? `${name}.exe` : name);
  // -ffp-contract=off: no fused multiply-adds, so each operation rounds as written.
  execFileSync(process.env.CC ?? "gcc", ["-O2", "-ffp-contract=off", "-std=c11", "-Wall", ...defines, "-o", exe, join(build, "harness.c"), "-lm"], {
    cwd: build,
    stdio: "inherit",
  });
  return exe;
};
const EXES = { float: compile("sigmoid-harness", []), double: compile("sigmoid-harness-double", ["-DSIGMOID_DOUBLE"]) };

// The extension's profiles, as the harness's profile infos.
const server = await createServer({ root, configFile: false, logLevel: "error", server: { middlewareMode: true }, appType: "custom" });
const { REC2020, DISPLAY_P3, ADOBE_RGB, SRGB } = await server.ssrLoadModule("/src/colour/profiles.ts");
await server.close();
const PROFILES = [[1, REC2020], [2, DISPLAY_P3], [3, ADOBE_RGB], [4, SRGB]];

// dt_iop_sigmoid_params_t field order (sigmoid.c L57-73) and $DEFAULTs.
const FIELDS = [
  ["middle_grey_contrast", 1.5], ["contrast_skewness", 0], ["display_white_target", 100], ["display_black_target", 0.0152],
  ["color_processing", 0], ["hue_preservation", 100], ["red_inset", 0], ["red_rotation", 0], ["green_inset", 0],
  ["green_rotation", 0], ["blue_inset", 0], ["blue_rotation", 0], ["purity", 0], ["base_primaries", 0],
];
const DEFAULTS = Object.fromEntries(FIELDS);
const deg = (d) => Math.fround((Math.fround(d) * Math.fround(Math.PI)) / 180);

const PRIMARIES = { red_inset: 0.1, green_inset: 0.1, blue_inset: 0.15, red_rotation: deg(2), green_rotation: deg(-1), blue_rotation: deg(-3) };
const CASES = [
  ["defaults", {}],
  ["contrast 0.1", { middle_grey_contrast: 0.1 }],
  ["contrast 0.7", { middle_grey_contrast: 0.7 }],
  ["contrast 3", { middle_grey_contrast: 3 }],
  ["contrast 10", { middle_grey_contrast: 10 }],
  ["skew -1", { contrast_skewness: -1 }],
  ["skew -0.4", { contrast_skewness: -0.4 }],
  ["skew 0.65", { contrast_skewness: 0.65 }],
  ["skew 1", { contrast_skewness: 1 }],
  ["white 20", { display_white_target: 20 }],
  ["white 60", { display_white_target: 60 }],
  ["white 400", { display_white_target: 400 }],
  ["white 1600", { display_white_target: 1600 }],
  ["black 0", { display_black_target: 0 }],
  ["black 1", { display_black_target: 1 }],
  ["black 15", { display_black_target: 15 }],
  ["black 15, white 20", { display_black_target: 15, display_white_target: 20 }],
  ["hue 0", { hue_preservation: 0 }],
  ["hue 37.5", { hue_preservation: 37.5 }],
  ["RGB ratio", { color_processing: 1 }],
  ["RGB ratio, contrast 2.5, skew -0.6", { color_processing: 1, middle_grey_contrast: 2.5, contrast_skewness: -0.6 }],
  ["RGB ratio, faded", { color_processing: 1, display_black_target: 4, display_white_target: 70 }],
  ["RGB ratio, black 0, white 400", { color_processing: 1, display_black_target: 0, display_white_target: 400 }],
  ["primaries, working profile", { ...PRIMARIES, hue_preservation: 0 }],
  ["primaries, Rec2020", { ...PRIMARIES, hue_preservation: 0, base_primaries: 1 }],
  ["primaries, Display P3", { ...PRIMARIES, hue_preservation: 50, base_primaries: 2 }],
  ["primaries, Adobe RGB", { ...PRIMARIES, base_primaries: 3 }],
  ["primaries, sRGB", { ...PRIMARIES, base_primaries: 4 }],
  ["purity 1", { ...PRIMARIES, purity: 1, base_primaries: 1 }],
  ["purity 0.4", { ...PRIMARIES, purity: 0.4, base_primaries: 1, hue_preservation: 20 }],
  ["insets at the hard ends", { red_inset: 0.99, green_inset: 0.6, blue_inset: 0.99, red_rotation: 0.4, green_rotation: -0.4, blue_rotation: 0.25, purity: 0.7, base_primaries: 1 }],
  ["neutral gray preset", { middle_grey_contrast: 1.22, contrast_skewness: 0.65 }],
  ["ACES 100-nit like preset", { middle_grey_contrast: 1.6, contrast_skewness: -0.2, hue_preservation: 0 }],
  ["Reinhard preset", { middle_grey_contrast: 1, contrast_skewness: 0, hue_preservation: 0, color_processing: 1 }],
  ["smooth preset", { middle_grey_contrast: 1.5, contrast_skewness: -0.2, hue_preservation: 0, ...PRIMARIES, base_primaries: 1 }],
  [
    "everything",
    { middle_grey_contrast: 2.2, contrast_skewness: 0.3, display_white_target: 140, display_black_target: 0.4, hue_preservation: 64, red_inset: 0.22, red_rotation: -0.1, green_inset: 0.05, green_rotation: 0.2, blue_inset: 0.3, blue_rotation: -0.3, purity: 0.55, base_primaries: 2 },
  ],
];

// Pipe-space scene-linear inputs: a grey wedge, hues around the circle at
// several purities and levels, out-of-gamut and negative values, zero, huge.
function pixels() {
  const out = [];
  for (let ev = -14; ev <= 12; ev += 1) {
    const v = 0.1845 * 2 ** ev;
    out.push([v, v, v]);
  }
  for (const level of [0.01, 0.1845, 0.9, 5]) {
    for (const purity of [0.25, 0.7, 1.2]) {
      for (let h = 0; h < 360; h += 30) {
        const a = (h * Math.PI) / 180;
        const w = [Math.cos(a), Math.cos(a - (2 * Math.PI) / 3), Math.cos(a + (2 * Math.PI) / 3)];
        out.push(w.map((x) => level * (1 + purity * x)));
      }
    }
  }
  out.push(
    [2.5, 0.05, 0.01], [0.01, 1.8, 0.02], [0.02, 0.05, 6], [0.4, -0.05, 0.3], [-0.1, 0.5, 0.2], [-0.3, -0.2, -0.1],
    [0, 0, 0], [1e-9, 1e-9, 1e-9], [0.3, 0.3, 0.2], [0.3, 0.2, 0.2], [0.2, 0.3, 0.3], [40, 38, 35], [120, 10, 5], [3000, 2000, 50],
  );
  return out;
}

const PX = pixels().map((p) => p.map((v) => Math.fround(v)));
const fmt = (v) => (Number.isFinite(v) ? v.toPrecision(17) : "0");
const PIPES = [["v2", 4], ["v1", 1]];

const lines = PROFILES.map(([i, p]) =>
  `F ${i} ` + [...p.toXyz, ...p.fromXyz, ...p.primaries.flatMap((q) => [q.x, q.y]), p.white.x, p.white.y].map((v) => v.toPrecision(17)).join(" "),
);
for (const [, over] of CASES) {
  const p = { ...DEFAULTS, ...over };
  const field = (k) => (k === "color_processing" || k === "base_primaries" ? String(p[k]) : fmt(p[k]));
  lines.push("P " + FIELDS.map(([k]) => field(k)).join(" "), "X");
  for (const [, pipe] of PIPES) {
    lines.push(`W ${pipe}`, "M");
    for (const px of PX) lines.push(`R ${px.map(fmt).join(" ")}`);
  }
}

function run(exe) {
  const out = execFileSync(exe, { input: lines.join("\n") + "\n", maxBuffer: 1 << 28 }).toString().trim().split(/\r?\n/);
  let k = 0;
  const cases = CASES.map(() => {
    const data = JSON.parse(out[k++]);
    const pipes = Object.fromEntries(
      PIPES.map(([label]) => {
        const matrices = JSON.parse(out[k++]);
        return [label, { matrices, outputs: PX.map(() => JSON.parse(out[k++])) }];
      }),
    );
    return { data, ...pipes };
  });
  if (k !== out.length) throw new Error(`${exe} printed ${out.length} lines, read ${k}`);
  return cases;
}

const asFloat = run(EXES.float);
const asDouble = run(EXES.double);
const cases = CASES.map(([name, over], i) => ({ name, params: over, float: asFloat[i], double: asDouble[i] }));

writeFileSync(
  join(here, "sigmoid-fixtures.json"),
  JSON.stringify({ upstream: `darktable ${UPSTREAM_COMMIT} (release-5.6.2) src/iop/sigmoid.c`, defaults: DEFAULTS, inputs: PX, cases }),
);
console.log(`sigmoid-fixtures.json: ${cases.length} cases x ${PIPES.length} pipes x ${PX.length} pixels, float and double builds`);
