# Parametric Tone Mappers

A Safelight extension that adds two display transforms with all of their sliders, ported from darktable and Ansel, and a **Tone mapper** panel in Develop to edit them. It needs Safelight 3.1.0 or later.

- **AgX (parametric)**: a port of darktable 5.6.2's AgX module (`src/iop/agx.c`, release-5.6.2, 20891f6c6f).
- **Filmic RGB (parametric)**: a port of Ansel's filmic rgb, colour science v8 (`src/iop/filmicrgb.c`, master, 2fadf8a366).

## What it adds

Both transforms appear in Develop's Display transform menu (in the bottom bar, next to Assess) and in Preferences, where the default display transform for photos without their own pick is set. A photo's pick and its settings are saved with the photo. A preset or Copy Settings that includes the Display transform field carries every one of the transform's settings along, those never changed at their defaults, so applying it gives the target the source's settings rather than a mix with its own.

The **Tone mapper** panel docks on Develop's right-hand side. It shows the settings of the transform the open photo renders with, laid out the way its upstream lays them out. When the photo renders with another transform, it shows a button for each of the two instead, **Use AgX (parametric)** and **Use Filmic RGB (parametric)**, to switch to one. Right-click the panel's header and choose Reset to defaults to put the open photo's transform back to its upstream defaults.

Each slider gesture, toggle, menu choice, preset and action button is one undo step, and one that changes nothing adds none. Switching tabs and Show or Hide are not undo steps. A slider writes live while it is dragged or a number is typed into its field, and commits when it is released or the field loses focus. Where moving one slider moves others, as Dynamic range scaling moves both ends, they move once from where the gesture started, so a drag or a typed number lands where one jump to its final value would. The settings belong to the photo, so the panel is not offered in the Masking panel's + Adjust menu.

## AgX (parametric)

The **Settings** tab holds three groups of controls.

- **Input exposure range.** White relative exposure and Black relative exposure set how many stops above and below mid-gray the curve spans. Dynamic range scaling widens or narrows that span on both sides, as a safety margin for extreme lights and darks. **Auto tune levels** sets the black and white from the smallest and largest channel values of the image in view, scaled by Dynamic range scaling, so zoom in to tune on an area. **Read exposure** sets them from the photo's Exposure slider.
- **Curve.** The basic parameters are the pivot (its Pivot relative exposure in EV and its Pivot target output), Contrast around it, and the Shoulder power and Toe power that shape the highlights and shadows. Show curve draws the curve before the look. Advanced curve parameters holds Shoulder start, Target white, Toe start and Target black, and either Keep the pivot on the diagonal, which adjusts the gamma automatically so the curve stays S-shaped, or a manual Curve y gamma.
- **Look.** Slope, Lift, Brightness, Saturation and Preserve hue, applied after the curve.

The **Primaries** tab holds the colour handling that makes AgX bleach bright colours to white. Base primaries picks the colour space the adjustments work in, and Disable adjustments applies the curve alone. Before tone mapping, each of red, green and blue has an attenuation, which desaturates that colour in highlights faster, and a rotation. After tone mapping, a purity boost and a reverse rotation per primary, with a Master purity boost and a Master rotation reversal over them, restore what the first step took away. Reverse all undoes the whole first step, and Set from above does the same but leaves the values editable. Reset primaries applies one of three sets: classic, smooth or unmodified.

The **Preset** menu applies one of darktable's six presets: unmodified base primaries, classic | base, classic | punchy, sigmoid-like | default, sigmoid-like | smooth and smooth.

The Show curve, Advanced curve parameters and Look sections start collapsed. The panel remembers which are open and which tab was last used.

## Filmic RGB (parametric)

The **Scene** tab describes the photo's range. White relative exposure and Black relative exposure are the stops between middle gray and pure white and pure black, and Dynamic range scaling enlarges or shrinks that range on both sides. **Auto tune levels** fits them to the image in view, along with Hardness and, while custom middle-gray values are on, Middle gray luminance, from statistical assumptions that suit landscapes and evenly lit pictures better than high-key, low-key or high-ISO ones, so zoom in to tune on an area. Use custom middle-gray values, under Advanced, adds Middle gray luminance, which is not recommended in general: fix the exposure with the Exposure slider instead.

The **Look** tab holds the curve and the colour rendering.

- **Tone mapping.** Contrast is the slope of the linear part. Highlights and Shadows set how far from middle gray the roll-offs start, as a percentage. Contrast in highlights and Contrast in shadows pick the shape of each roll-off: hard, soft, safe or perceptual. Perceptual is the default and a smooth, monotonic curve from an appearance model, and the other three are the older polynomial and rational segments. The curve is drawn below. Hardness, the equivalent of paper grade, shows only while Auto adjust hardness is off.
- **Color mapping.** Color preservation sets how much per-channel hue drift is kept. At -100% hues drift as they do in AgX, at 0% half of the drift is removed, and at +100% the original hues are restored exactly. Saturation is not affected: valid diffuse colours keep theirs and strongly compressed colours bleach at any setting.
- **Advanced.** Color science offers the five bleach levels of version 8: no bleach, low, medium (the default), high and extra bleach. Auto adjust hardness, on by default, sets the hardness from the scene's white and black so middle gray stays on the identity line.

The **Display** tab sets the output's Target black luminance and Target white luminance, which should stay near 0% and at 100% unless a faded look is wanted. Target middle gray appears with custom middle-gray values and should not be touched without a reason.

## Older processing

Photos edited on the older processing keep Safelight's own highlight shoulder, which still runs before either transform, so the transform receives compressed highlights. The panel says so on those photos. Use Update processing in Develop's status bar to give the transform the full range.

## Differences from darktable and Ansel

No native darktable or Ansel build was compared. The reference values come from two independent ports of the same C: the worked values of a separate JavaScript transcription, and this extension's TypeScript twins, which the GPU shaders are tested against. Where the ports knowingly differ from upstream:

- **AgX base primaries.** The "export profile" choice is not offered and renders as Rec2020, and "working profile" means Rec2020.
- **Filmic highlight reconstruction.** It is not ported. Ansel has it off for new edits.
- **Filmic versions.** Colour science v3 to v7, the chrominance norms and spline v1 and v2 are not ported. Only v8 with its five bleach levels and spline v3 are.
- **Filmic gamut.** Filmic gamut-maps to sRGB, so Display P3, Adobe RGB and ProPhoto exports keep its colours inside sRGB.
- **Scene ends.** Safelight stores the white and black relative exposures held to their hard ranges (AgX: white 0.1 to 20 EV, black -20 to -0.1 EV; filmic: white 0.1 to 16 EV, black -16 to -0.1 EV), where upstream stores them unclamped.
- **Filmic perceptual shoulder.** Its coefficient can outgrow a 32-bit float. Where the tiny power it multiplies flushes to zero (Ansel's GPU path, or a coefficient far past the float range), Ansel renders the whole shoulder flat target white, and a CPU build that keeps subnormal floats instead renders the black target in a band just above the latitude node. This extension packs the coefficient as 0, which renders flat white past the shoulder node either way.
- **Filmic degenerate "safe" curve.** With collapsed display targets, such as a Target white luminance of 0%, the safe curve takes the square root of a negative number, and the NaN reaches Ansel's clamp, which renders that segment at the black target. This extension packs any value a 32-bit float can't hold as NaN, and Safelight refuses a uniform holding a NaN or an Infinity: it binds that uniform's default and logs a warning once. Each such uniform packs the toe, the shoulder and the latitude line together, so the default curve's coefficients replace the toe and the midtone line segment as well.
- **AgX primaries on white.** A Master purity boost of 200% with purity boosts of 50% puts those primaries on white, and the matrix that takes the curve's output back has no inverse. This extension then renders the unmodified primaries, as Disable adjustments does, and keeps the curve and the look.
- **AgX auto gamma.** Keep the pivot on the diagonal can come out with a gamma that is not positive, when the Pivot target output reaches the Target white. darktable renders a white frame then, and this extension uses the Curve y gamma slider instead.
- **Filmic hardness.** Switching Auto adjust hardness off keeps the hardness that was rendering, clamped to 1 to 10, where Ansel keeps the unclamped auto value.
- **Filmic auto tune on an all-negative frame.** White relative exposure is set to 1 EV before Dynamic range scaling, where Ansel stores NaN.
- **Auto tune levels.** darktable's per-slider area pickers are not ported. Auto tune levels measures the image in view, not a picked area, averaged to 1280 px on the long edge where Ansel's pickers don't blur.
- **Read exposure.** It reads Safelight's Exposure slider.

## Cost

Both transforms are per-pixel, with no texture reads. The counts are for the final shader on its worst path.

| Per pixel | AgX | Filmic, perceptual curves | Filmic, hard curves |
| --- | --- | --- | --- |
| mat3 by vec3 | 3 | 13 | 13 |
| log2 | 3 | 3 | 3 |
| pow | 15 | 12 | 6 |
| length | 0 | 4 | 4 |
| RGB to HSV | 2 | 0 | 0 |
| HSV to RGB | 1 | 0 | 0 |
| Chroma bounds | 0 | 6 | 6 |
| Yrg locus bounds | 0 | 3 | 3 |
| Other dot products | 5 | 4 | 4 |
| Formula-selecting branches | 16 | 17 | 17 |
| Of those, data-dependent | 10 | 11 | 11 |
| Texture reads | 0 | 0 | 0 |

The AgX count is with a tuned look and hue restore. Each transform binds its derived values as uniforms: AgX 18 vectors (3 mat3, 1 vec3, 7 vec4, 1 vec2) and filmic 14 (2 mat3, 8 vec4), inside the 32-vector budget the core allows.

## Credits and licence

- The darktable developers, for AgX (`src/iop/agx.c`, release-5.6.2).
- Troy Sobotka, for AgX, and EaryChow, for AgX_LUT_Gen, the source of the Blender primaries.
- Aurélien Pierre and the Ansel authors, for filmic rgb (`src/iop/filmicrgb.c`, 2fadf8a366).
- Richard A. Kirk, for the Yrg colour space that filmic uses.

Every ported file keeps the notice of the upstream file it derives from. GPL-3.0-or-later, like both upstreams. See `LICENSE`.

## Development

- `npm ci` installs the dependencies.
- `npm test` runs the unit and panel tests, and `npm run typecheck` checks the types.
- `npm run test:gpu` compiles both transforms in the real renderer and compares every pixel with the TypeScript twins over a grid of settings. It needs a SafeLight checkout beside this repository or beside its parent folder. `SAFELIGHT_CORE` points at a checkout elsewhere, and `SAFELIGHT_TEST_CHROME` names a browser executable to use when Playwright's bundled Chromium will not start.
- `npm run build` bundles the extension into `dist/`.
