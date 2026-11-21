/*
    Reference harness for the Sigmoid transform. sigmoid-build.mjs compiles it
    with sections of darktable's src/iop/sigmoid.c, src/common/custom_primaries.c
    and src/common/colorspaces.c copied verbatim (sigmoid_core.c), so the
    expected values come from upstream's own code, compiled as C.

    It is built twice: as upstream runs, in floats, and with SIGMOID_DOUBLE,
    where every float of the copied code is a double and its libm calls the
    double ones. The float build gives darktable's own numbers; the double
    build shows the transcription is exact where float rounding is all that
    tells two answers apart.

    This file is part of the Parametric Tone Mappers extension for Safelight.
    Copyright (C) 2020-2026 darktable developers. GPL-3.0-or-later.

    Commands on stdin, one per line:
      F <i> <9 RGB->XYZ row-major> <9 XYZ->RGB row-major> <6 primaries xy> <2 white xy>
                                      define profile i (1 Rec2020, 2 Display P3,
                                      3 Adobe RGB, 4 sRGB), darktable's
                                      dt_iop_order_iccprofile_info_t fields
      W <i>                           the pipe's working profile is profile i
      P <14 params in struct order>   set the params and run commit_params
      X                               print commit_params's data
      M                               print the three primaries matrices, row-major
      R <r> <g> <b>                   print process() over one pipe pixel
*/

/* Every system header first: the double build's macros must not reach them. */
#include <float.h>
#include <math.h>
#include <stddef.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#ifdef SIGMOID_DOUBLE
#define float double
#define powf pow
#define fmaxf fmax
#define fminf fmin
#define fabsf fabs
#define sqrtf sqrt
#define atan2f atan2
#define cosf cos
#define sinf sin
#define OUT "%.17g"
#else
#define OUT "%.9g"
#endif

#include "sigmoid_core.c"

static dt_iop_module_t module;
static dt_dev_pixelpipe_t pipe;
static dt_iop_sigmoid_data_t data;
static dt_dev_pixelpipe_iop_t piece = { &data, &pipe };
static dt_iop_sigmoid_params_t params;

static int ok = 1;

static double read_number(void)
{
  double v = 0.0;
  if(scanf("%lf", &v) != 1) ok = 0;
  return v;
}

static int read_int(void)
{
  int v = 0;
  if(scanf("%d", &v) != 1) ok = 0;
  return v;
}

/* darktable stores the transposed matrix; print it as M (rows of M·v). */
static void print_matrix(const dt_colormatrix_t t)
{
  printf("[");
  for(int r = 0; r < 3; r++)
    for(int c = 0; c < 3; c++) printf("%s" OUT, r || c ? "," : "", (double)t[c][r]);
  printf("]");
}

int main(void)
{
  char cmd[4];
  while(ok && scanf("%3s", cmd) == 1)
  {
    if(cmd[0] == 'F')
    {
      dt_iop_order_iccprofile_info_t *p = &profiles[read_int()];
      for(int r = 0; r < 3; r++)
        for(int c = 0; c < 3; c++) p->matrix_in_transposed[c][r] = read_number();
      for(int r = 0; r < 3; r++)
        for(int c = 0; c < 3; c++) p->matrix_out_transposed[c][r] = read_number();
      for(int k = 0; k < 3; k++)
        for(int c = 0; c < 2; c++) p->primaries[k][c] = read_number();
      for(int c = 0; c < 2; c++) p->whitepoint[c] = read_number();
    }
    else if(cmd[0] == 'W')
    {
      work_profile = read_int();
    }
    else if(cmd[0] == 'P')
    {
      params.middle_grey_contrast = read_number();
      params.contrast_skewness = read_number();
      params.display_white_target = read_number();
      params.display_black_target = read_number();
      params.color_processing = (dt_iop_sigmoid_methods_type_t)read_int();
      params.hue_preservation = read_number();
      params.red_inset = read_number();
      params.red_rotation = read_number();
      params.green_inset = read_number();
      params.green_rotation = read_number();
      params.blue_inset = read_number();
      params.blue_rotation = read_number();
      params.purity = read_number();
      params.base_primaries = (dt_iop_sigmoid_base_primaries_t)read_int();
      commit_params(&module, (dt_iop_params_t *)&params, &pipe, &piece);
    }
    else if(cmd[0] == 'X')
    {
      printf("{\"white_target\":" OUT ",\"black_target\":" OUT ",\"paper_exposure\":" OUT ",\"film_fog\":" OUT
             ",\"film_power\":" OUT ",\"paper_power\":" OUT ",\"hue_preservation\":" OUT "}\n",
             (double)data.white_target, (double)data.black_target, (double)data.paper_exposure,
             (double)data.film_fog, (double)data.film_power, (double)data.paper_power,
             (double)data.hue_preservation);
    }
    else if(cmd[0] == 'M')
    {
      const dt_iop_order_iccprofile_info_t *work = &profiles[work_profile];
      const dt_iop_order_iccprofile_info_t *base = _get_base_profile(module.dev, work, data.base_primaries);
      dt_colormatrix_t pipe_to_base, base_to_rendering, rendering_to_pipe;
      _calculate_adjusted_primaries(&data, work, base, pipe_to_base, base_to_rendering, rendering_to_pipe);
      printf("{\"pipe_to_base\":");
      print_matrix(pipe_to_base);
      printf(",\"base_to_rendering\":");
      print_matrix(base_to_rendering);
      printf(",\"rendering_to_pipe\":");
      print_matrix(rendering_to_pipe);
      printf("}\n");
    }
    else if(cmd[0] == 'R')
    {
      dt_aligned_pixel_t in = { 0, 0, 0, 1 }, out = { 0, 0, 0, 0 };
      for(int c = 0; c < 3; c++) in[c] = read_number();
      const dt_iop_roi_t roi = { 1, 1 };
      process(&module, &piece, in, out, &roi, &roi);
      printf("[" OUT "," OUT "," OUT "]\n", (double)out[0], (double)out[1], (double)out[2]);
    }
    else
      return 1;
  }
  return ok ? 0 : 1;
}
