//#region src/param-table.ts
function e(e) {
	return Object.entries(e).map(([e, t]) => t.type === "bool" ? {
		key: e,
		glslType: "bool",
		default: t.default,
		label: t.label
	} : {
		key: e,
		glslType: t.type,
		default: t.default,
		range: {
			min: t.min,
			max: t.max
		},
		label: t.label
	});
}
var t = (e, t) => {
	let n = Math.min(e.max, Math.max(e.min, t));
	return e.type === "int" ? Math.round(n) : n;
};
function n(e, n) {
	let r = {};
	for (let [i, a] of Object.entries(e)) {
		let e = n[i];
		r[i] = a.type === "bool" ? typeof e == "boolean" ? e : a.default : t(a, typeof e == "number" && Number.isFinite(e) ? e : a.default);
	}
	return r;
}
function r(e) {
	return n(e, {});
}
function i(e, t) {
	let n = [];
	for (let r in e) n.push({
		key: r,
		glslType: e[r],
		default: t[r]
	});
	return n;
}
function a(e, n) {
	let r = { ...n };
	for (let [i, a] of Object.entries(n)) {
		let n = e[i];
		n && n.type !== "bool" && typeof a == "number" && (Number.isNaN(a) ? delete r[i] : r[i] = t(n, a));
	}
	return r;
}
var o = (e, t) => Object.fromEntries(Object.entries(t).map(([t, n]) => [`${e}.${t}`, n]));
function s(e, t) {
	let n = `${e}.`, r = {};
	for (let [e, i] of Object.entries(t)) e.startsWith(n) && (typeof i == "number" || typeof i == "boolean") && (r[e.slice(n.length)] = i);
	return r;
}
//#endregion
//#region src/curve-math.ts
var c = (e, t, n) => Math.min(n, Math.max(t, e)), l = 1e-6;
function u(e, t, n, r, i, a) {
	let o = i * Math.max(l, e - n), s = Math.max(l, t - r), c = Math.max(l, s ** +-a - o ** +-a);
	return Math.min(1e9, c ** (-1 / a));
}
function d(e, t, n) {
	let r = e.slice(), i = t.slice();
	for (let e = 0; e < n; e++) {
		let t = e;
		for (let i = e + 1; i < n; i++) Math.abs(r[i * n + e]) > Math.abs(r[t * n + e]) && (t = i);
		if (t !== e) {
			for (let i = 0; i < n; i++) [r[e * n + i], r[t * n + i]] = [r[t * n + i], r[e * n + i]];
			[i[e], i[t]] = [i[t], i[e]];
		}
		for (let t = e + 1; t < n; t++) {
			let a = r[t * n + e] / r[e * n + e];
			for (let i = e; i < n; i++) r[t * n + i] -= a * r[e * n + i];
			i[t] -= a * i[e];
		}
	}
	for (let e = n - 1; e >= 0; e--) {
		let t = i[e];
		for (let a = e + 1; a < n; a++) t -= r[e * n + a] * i[a];
		i[e] = t / r[e * n + e];
	}
	return i;
}
//#endregion
//#region src/colour/mat3.ts
var f = [
	1,
	0,
	0,
	0,
	1,
	0,
	0,
	0,
	1
];
function p(e, t) {
	let n = (n, r) => e[n * 3] * t[r] + e[n * 3 + 1] * t[3 + r] + e[n * 3 + 2] * t[6 + r];
	return [
		n(0, 0),
		n(0, 1),
		n(0, 2),
		n(1, 0),
		n(1, 1),
		n(1, 2),
		n(2, 0),
		n(2, 1),
		n(2, 2)
	];
}
function m(e, t) {
	return [
		e[0] * t[0] + e[1] * t[1] + e[2] * t[2],
		e[3] * t[0] + e[4] * t[1] + e[5] * t[2],
		e[6] * t[0] + e[7] * t[1] + e[8] * t[2]
	];
}
function h(e) {
	let [t, n, r, i, a, o, s, c, l] = e, u = a * l - o * c, d = -(i * l - o * s), f = i * c - a * s, p = t * u + n * d + r * f;
	return Math.abs(p) > 2 ** -52 * Math.hypot(t, n, r) * Math.hypot(i, a, o) * Math.hypot(s, c, l) ? [
		u / p,
		-(n * l - r * c) / p,
		(n * o - r * a) / p,
		d / p,
		(t * l - r * s) / p,
		-(t * o - r * i) / p,
		f / p,
		-(t * c - n * s) / p,
		(t * a - n * i) / p
	] : null;
}
function g(e) {
	let t = h(e);
	if (!t) throw Error("singular colour matrix");
	return t;
}
var _ = (e) => [
	e[0],
	0,
	0,
	0,
	e[1],
	0,
	0,
	0,
	e[2]
], v = (e, t, n) => [
	e[0],
	t[0],
	n[0],
	e[1],
	t[1],
	n[1],
	e[2],
	t[2],
	n[2]
], y = (e, t) => [
	e[t],
	e[3 + t],
	e[6 + t]
], b = (e, t) => [
	e[t * 3],
	e[t * 3 + 1],
	e[t * 3 + 2]
], x = (e, t) => [
	e[0] * t,
	e[1] * t,
	e[2] * t
], S = (e) => [
	e[0],
	e[3],
	e[6],
	e[1],
	e[4],
	e[7],
	e[2],
	e[5],
	e[8]
], C = {
	x: .31271,
	y: .32902
}, w = [
	.9642,
	1,
	.8249
], T = [
	.8951,
	.2664,
	-.1614,
	-.7502,
	1.7135,
	.0367,
	.0389,
	-.0685,
	1.0296
], E = (e) => [
	e.x / e.y,
	1,
	(1 - e.x - e.y) / e.y
];
function D(e) {
	let t = e[0] + e[1] + e[2];
	return {
		x: e[0] / t,
		y: e[1] / t
	};
}
function ee(e, t) {
	let n = v(E(e[0]), E(e[1]), E(e[2]));
	return p(n, _(m(g(n), t)));
}
function te(e, t) {
	let n = m(T, e), r = m(T, t);
	return p(p(g(T), _([
		r[0] / n[0],
		r[1] / n[1],
		r[2] / n[2]
	])), T);
}
function O(e) {
	let t = E(C), n = p(te(t, w), ee(e, t));
	return {
		toXyz: n,
		fromXyz: g(n),
		primaries: [
			D(y(n, 0)),
			D(y(n, 1)),
			D(y(n, 2))
		],
		white: D(w)
	};
}
var k = O([
	{
		x: .708,
		y: .292
	},
	{
		x: .17,
		y: .797
	},
	{
		x: .131,
		y: .046
	}
]), A = O([
	{
		x: .68,
		y: .32
	},
	{
		x: .265,
		y: .69
	},
	{
		x: .15,
		y: .06
	}
]), ne = O([
	{
		x: .64,
		y: .33
	},
	{
		x: .21,
		y: .71
	},
	{
		x: .15,
		y: .06
	}
]), j = O([
	{
		x: .64,
		y: .33
	},
	{
		x: .3,
		y: .6
	},
	{
		x: .15,
		y: .06
	}
]), M = p(k.fromXyz, j.toXyz), re = g(M), N = 1e-6, ie = 2.2, ae = 1e9, oe = 34028234663852886e22, se = 1.1920928955078125e-7, P = [
	0,
	0,
	0
], ce = (e, t, n) => Math.min(ae, t / e ** +n), le = (e, t) => c(e.curve_pivot_y_linear_output, e.curve_target_display_black_ratio, e.curve_target_display_white_ratio) ** (1 / t);
function ue(e) {
	let t = e.range_black_relative_ev, n = e.range_white_relative_ev - t, r = c(e.curve_pivot_x, N, .999999), i = Math.log2(e.curve_pivot_y_linear_output) / Math.log2(r), a = e.auto_gamma && i > 0 && Number.isFinite(i) ? i : e.curve_gamma, o = le(e, a), s = e.curve_contrast_around_pivot * (n / 16.5) / (a * Math.max(N, o) ** (a - 1) / (ie * Math.max(N, le(e, ie)) ** 1.2000000000000002)), l = e.curve_target_display_black_ratio ** (1 / a), d = Math.max(.01, e.curve_toe_power), f = (o - l) * e.curve_linear_ratio_below_pivot, p = Math.max(N, r - f / s), m = o - s * (r - p), h = -u(1, 1 - l, 1 - p, 1 - m, s, d), g = Math.max(N, m - l), _ = s * p / g, v = e.curve_target_display_white_ratio ** (1 / a), y = (v - o) * e.curve_linear_ratio_above_pivot, b = Math.min(.999999, r + y / s), x = o + s * (b - r), S = Math.max(.01, e.curve_shoulder_power), C = Math.max(N, v - x), w = s * (1 - b) / C, T = e.look_brightness, E = e.look_slope / (1 + e.look_lift);
	return {
		blackEv: t,
		rangeEv: n,
		gamma: a,
		pivotX: r,
		pivotY: o,
		slope: s,
		intercept: m - s * p,
		targetBlack: l,
		targetWhite: v,
		toeTx: p,
		toeTy: m,
		toeScale: h,
		toePower: d,
		needConvexToe: g / p > s,
		toeFallbackPower: _,
		toeFallbackCoeff: ce(p, g, _),
		shTx: b,
		shTy: x,
		shScale: u(1, v, b, x, s, S),
		shPower: S,
		needConcaveShoulder: C / (1 - b) > s,
		shFallbackPower: w,
		shFallbackCoeff: ce(1 - b, C, w),
		lookPower: T < 1 ? 1 / Math.sqrt(Math.max(T, N)) : 1 / T,
		lookTuned: e.look_slope !== 1 || T !== 1 || e.look_lift !== 0 || e.look_saturation !== 1,
		restoreHue: e.look_original_hue_mix_ratio !== 0,
		lookM: E,
		lookB: e.look_lift * E
	};
}
function de(e, t) {
	return e === 3 ? A : e === 4 ? ne : e === 5 ? j : e === 2 ? k : (t ?? 1) >= 2 ? j : k;
}
function fe(e, t, n) {
	let r = e.white.x, i = e.white.y, a = r + t, o = i + n, s = oe;
	for (let t = 0; t < 3; t++) {
		let n = e.primaries[t], c = e.primaries[(t + 1) % 3], l = (r - a) * (n.y - c.y) - (n.x - c.x) * (i - o);
		if (l === 0) continue;
		let u = ((r - n.x) * (n.y - c.y) - (n.x - c.x) * (i - n.y)) / l;
		u >= 0 && u < s && (s = u);
	}
	return s;
}
function F(e, t, n, r) {
	let i = Math.atan2(e.primaries[r].y - e.white.y, e.primaries[r].x - e.white.x) + n, a = Math.cos(i), o = Math.sin(i), s = fe(e, a, o);
	return {
		x: e.white.x + t * s * a,
		y: e.white.y + t * s * o
	};
}
var pe = (e) => e < se && e >= 0 ? se : e < 0 && e > -1.1920928955078125e-7 ? -1.1920928955078125e-7 : e;
function me(e, t) {
	let n = (e) => {
		let t = pe(e.y);
		return [
			e.x / t,
			1,
			(1 - e.x - t) / t
		];
	}, r = v(n(e[0]), n(e[1]), n(e[2])), i = h(r);
	return i && p(r, _(m(i, n(t))));
}
function he(e) {
	let t = {
		masterOutset: e.master_outset_ratio,
		masterUnrotation: e.master_unrotation_ratio
	};
	if (e.disable_primaries_adjustments) return {
		inset: P,
		rotation: P,
		outset: P,
		unrotation: P,
		...t
	};
	let n = [
		e.red_inset,
		e.green_inset,
		e.blue_inset
	], r = [
		e.red_rotation,
		e.green_rotation,
		e.blue_rotation
	];
	return e.completely_reverse_primaries ? {
		inset: n,
		rotation: r,
		outset: n,
		unrotation: r,
		masterOutset: 1,
		masterUnrotation: 1
	} : {
		inset: n,
		rotation: r,
		outset: [
			e.red_outset,
			e.green_outset,
			e.blue_outset
		],
		unrotation: [
			e.red_unrotation,
			e.green_unrotation,
			e.blue_unrotation
		],
		...t
	};
}
var ge = {
	inset: P,
	rotation: P,
	outset: P,
	unrotation: P,
	masterOutset: 1,
	masterUnrotation: 1
};
function _e(e, t) {
	let n = p(e.fromXyz, j.toXyz), r = (t, n) => me([
		F(e, t(0), n(0), 0),
		F(e, t(1), n(1), 1),
		F(e, t(2), n(2), 2)
	], e.white), i = r((e) => 1 - t.inset[e], (e) => t.rotation[e]), a = r((e) => 1 - t.masterOutset * t.outset[e], (e) => t.masterUnrotation * t.unrotation[e]), o = a && h(p(e.fromXyz, a));
	return !i || !o ? null : {
		pipeToBase: n,
		baseToRendering: p(e.fromXyz, i),
		renderingToPipe: p(g(n), o),
		renderingToXyz: i
	};
}
function ve(e, t) {
	let n = de(e.base_primaries, t), r = _e(n, he(e)) ?? _e(n, ge);
	if (!r) throw Error("singular colour matrix");
	return r;
}
var ye = {
	agxPipeToBase: "mat3",
	agxBaseToRendering: "mat3",
	agxRenderingToPipe: "mat3",
	agxLumaY: "vec3",
	agxPipeToBaseV1: "mat3",
	agxBaseToRenderingV1: "mat3",
	agxRenderingToPipeV1: "mat3",
	agxLumaYV1: "vec3",
	agxRange: "vec4",
	agxToe: "vec4",
	agxShoulder: "vec4",
	agxCurveC: "vec4",
	agxToeFallback: "vec4",
	agxShFallback: "vec4",
	agxLook: "vec4",
	agxHue: "vec2"
}, be = (e) => +!!e;
function xe(e) {
	let t = ue(e), n = ve(e, 2), r = ve(e, 1);
	return {
		agxPipeToBase: S(n.pipeToBase),
		agxBaseToRendering: S(n.baseToRendering),
		agxRenderingToPipe: S(n.renderingToPipe),
		agxLumaY: [...b(n.renderingToXyz, 1)],
		agxPipeToBaseV1: S(r.pipeToBase),
		agxBaseToRenderingV1: S(r.baseToRendering),
		agxRenderingToPipeV1: S(r.renderingToPipe),
		agxLumaYV1: [...b(r.renderingToXyz, 1)],
		agxRange: [
			t.blackEv,
			t.rangeEv,
			t.gamma,
			be(t.lookTuned)
		],
		agxToe: [
			t.toeTx,
			t.toeTy,
			t.toeScale,
			t.toePower
		],
		agxShoulder: [
			t.shTx,
			t.shTy,
			t.shScale,
			t.shPower
		],
		agxCurveC: [
			t.slope,
			t.intercept,
			t.targetBlack,
			t.targetWhite
		],
		agxToeFallback: [
			be(t.needConvexToe),
			t.toeFallbackCoeff,
			t.toeFallbackPower,
			0
		],
		agxShFallback: [
			be(t.needConcaveShoulder),
			t.shFallbackCoeff,
			t.shFallbackPower,
			0
		],
		agxLook: [
			t.lookM,
			t.lookB,
			t.lookPower,
			e.look_saturation
		],
		agxHue: [be(t.restoreHue), e.look_original_hue_mix_ratio]
	};
}
//#endregion
//#region src/glsl/common.ts
function Se(e) {
	let t = e.toPrecision(10);
	return /[.e]/.test(t) ? t : `${t}.0`;
}
var Ce = (e) => `vec3(${e.map(Se).join(", ")})`, I = (e) => `mat3(${S(e).map(Se).join(", ")})`, we = "vec3 ptmEncode(vec3 x) {\n  vec3 a = abs(x);\n  vec3 e = mix(a * 12.92, 1.055 * pow(a, vec3(1.0 / 2.4)) - 0.055, greaterThanEqual(a, vec3(0.0031308)));\n  return sign(x) * e;\n}", Te = "vec3 ptmSanitise(vec3 c) {\n  return vec3(\n    isnan(c.r) ? 0.0 : clamp(c.r, -1.0e6, 1.0e6),\n    isnan(c.g) ? 0.0 : clamp(c.g, -1.0e6, 1.0e6),\n    isnan(c.b) ? 0.0 : clamp(c.b, -1.0e6, 1.0e6));\n}";
function Ee(e, t) {
	return `vec3 ${e}(vec3 p) {
  vec3 k = ${Ce(t)};
  float inputY = dot(p, k);
  float mx = max(p.r, max(p.g, p.b));
  vec3 opp = vec3(mx) - p;
  float yComp = max(opp.r, max(opp.g, opp.b)) - dot(opp, k) + inputY;
  float offset = max(-min(p.r, min(p.g, p.b)), 0.0);
  vec3 q = p + offset;
  float mq = max(q.r, max(q.g, q.b));
  vec3 oppQ = vec3(mq) - q;
  float yNew = max(oppQ.r, max(oppQ.g, oppQ.b)) - dot(oppQ, k) + dot(q, k);
  float ratio = (yNew > yComp && yNew > 1.0e-6) ? yComp / yNew : 1.0;
  return ratio * q;
}`;
}
function De(e) {
	let t = Math.abs(e), n = t < .0031308 ? t * 12.92 : 1.055 * t ** (1 / 2.4) - .055;
	return Math.sign(e) * n;
}
//#endregion
//#region src/agx/glsl.ts
var Oe = `${Te}
${we}
${Ee("agxCompress", [
	.2658180370250449,
	.59846986045365,
	.1357121025213052
])}
bool agxV2() {
  bool v2 = false;
#ifdef SL_PROCESS_VERSION
#if SL_PROCESS_VERSION >= 2
  v2 = true;
#endif
#endif
  return v2;
}
float agxSigmoid(float u, float p) {
  return u / pow(1.0 + pow(u, p), 1.0 / p);
}
float agxCurve(float x) {
  float y;
  if (x < agxToe.x) {
    if (agxToeFallback.x > 0.5) {
      y = x < 0.0 ? agxCurveC.z : agxCurveC.z + max(0.0, agxToeFallback.y * pow(x, agxToeFallback.z));
    } else {
      y = agxToe.z * agxSigmoid(agxCurveC.x * (x - agxToe.x) / agxToe.z, agxToe.w) + agxToe.y;
    }
  } else if (x <= agxShoulder.x) {
    y = agxCurveC.x * x + agxCurveC.y;
  } else {
    if (agxShFallback.x > 0.5) {
      y = x >= 1.0 ? agxCurveC.w : agxCurveC.w - max(0.0, agxShFallback.y * pow(1.0 - x, agxShFallback.z));
    } else {
      y = agxShoulder.z * agxSigmoid(agxCurveC.x * (x - agxShoulder.x) / agxShoulder.z, agxShoulder.w) + agxShoulder.y;
    }
  }
  return y >= agxCurveC.z ? min(y, agxCurveC.w) : agxCurveC.z;
}
float agxHueOf(vec3 c, float mx, float delta) {
  float h;
  if (c.r == mx) h = (c.g - c.b) / delta;
  else if (c.g == mx) h = 2.0 + (c.b - c.r) / delta;
  else h = 4.0 + (c.r - c.g) / delta;
  h = h / 6.0;
  return h - floor(h);
}
vec3 agxToHsv(vec3 c) {
  float mn = min(c.r, min(c.g, c.b));
  float mx = max(c.r, max(c.g, c.b));
  float delta = mx - mn;
  if (abs(mx) > 1.0e-6 && abs(delta) > 1.0e-6) return vec3(agxHueOf(c, mx, delta), delta / mx, mx);
  return vec3(0.0, 0.0, mx);
}
vec3 agxFromHsv(vec3 hsv) {
  float chroma = hsv.y * hsv.z;
  float mn = hsv.z - chroma;
  float h = hsv.x * 6.0;
  float i = floor(h);
  float fc = (h - i) * chroma;
  float top = chroma + mn;
  float inc = fc + mn;
  float dec = top - fc;
  if (i == 0.0) return vec3(top, inc, mn);
  if (i == 1.0) return vec3(dec, top, mn);
  if (i == 2.0) return vec3(mn, top, inc);
  if (i == 3.0) return vec3(mn, dec, top);
  if (i == 4.0) return vec3(inc, mn, top);
  return vec3(top, mn, dec);
}
float agxLogEncode(float v) {
  return clamp((log2(max(1.0e-6, v / 0.18)) - agxRange.x) / agxRange.y, 0.0, 1.0);
}
vec3 agxToneMap(vec3 r) {
  float hBefore = agxHue.x > 0.5 ? agxToHsv(r).x : 0.0;
  vec3 t = vec3(agxCurve(agxLogEncode(r.r)), agxCurve(agxLogEncode(r.g)), agxCurve(agxLogEncode(r.b)));
  if (agxRange.w > 0.5) {
    vec3 v = agxLook.x * t + agxLook.y;
    t = vec3(
      v.r > 0.0 ? pow(v.r, agxLook.z) : v.r,
      v.g > 0.0 ? pow(v.g, agxLook.z) : v.g,
      v.b > 0.0 ? pow(v.b, agxLook.z) : v.b);
    float luma = dot(agxV2() ? agxLumaY : agxLumaYV1, t);
    t = luma + agxLook.w * (t - luma);
  }
  t = pow(max(t, vec3(0.0)), vec3(agxRange.z));
  if (agxHue.x > 0.5) {
    vec3 hsv = agxToHsv(t);
    float d = hsv.x - hBefore;
    float h = (1.0 - agxHue.y) * (d - roundEven(d)) + hBefore;
    hsv.x = h - floor(h);
    return agxFromHsv(hsv);
  }
  return t;
}`, ke = "vec3 pipelineToDisplay(vec3 lin) {\n  bool v2 = agxV2();\n  vec3 base = agxCompress((v2 ? agxPipeToBase : agxPipeToBaseV1) * ptmSanitise(lin));\n  vec3 r = agxToneMap((v2 ? agxBaseToRendering : agxBaseToRenderingV1) * base);\n  return ptmEncode((v2 ? agxRenderingToPipe : agxRenderingToPipeV1) * r);\n}", L = {
	look_lift: {
		type: "float",
		default: 0,
		min: -1,
		max: 1,
		label: "lift"
	},
	look_slope: {
		type: "float",
		default: 1,
		min: 0,
		max: 10,
		label: "slope"
	},
	look_brightness: {
		type: "float",
		default: 1,
		min: 0,
		max: 100,
		label: "brightness"
	},
	look_saturation: {
		type: "float",
		default: 1,
		min: 0,
		max: 10,
		label: "saturation"
	},
	look_original_hue_mix_ratio: {
		type: "float",
		default: .6,
		min: 0,
		max: 1,
		label: "preserve hue"
	},
	range_black_relative_ev: {
		type: "float",
		default: -10,
		min: -20,
		max: -.1,
		label: "black relative exposure"
	},
	range_white_relative_ev: {
		type: "float",
		default: 6.5,
		min: .1,
		max: 20,
		label: "white relative exposure"
	},
	dynamic_range_scaling: {
		type: "float",
		default: .1,
		min: -.5,
		max: 2,
		label: "dynamic range scaling"
	},
	curve_pivot_x: {
		type: "float",
		default: 10 / 16.5,
		min: 0,
		max: 1,
		label: "pivot relative exposure"
	},
	curve_pivot_y_linear_output: {
		type: "float",
		default: .18,
		min: 0,
		max: 1,
		label: "pivot target output"
	},
	curve_contrast_around_pivot: {
		type: "float",
		default: 3,
		min: .1,
		max: 10,
		label: "contrast"
	},
	curve_linear_ratio_below_pivot: {
		type: "float",
		default: 0,
		min: 0,
		max: 1,
		label: "toe start"
	},
	curve_linear_ratio_above_pivot: {
		type: "float",
		default: 0,
		min: 0,
		max: 1,
		label: "shoulder start"
	},
	curve_toe_power: {
		type: "float",
		default: 1.5,
		min: 0,
		max: 10,
		label: "toe power"
	},
	curve_shoulder_power: {
		type: "float",
		default: 3.3,
		min: 0,
		max: 10,
		label: "shoulder power"
	},
	curve_gamma: {
		type: "float",
		default: 2.2,
		min: .01,
		max: 100,
		label: "curve y gamma"
	},
	auto_gamma: {
		type: "bool",
		default: !1,
		label: "keep the pivot on the diagonal"
	},
	curve_target_display_black_ratio: {
		type: "float",
		default: 0,
		min: 0,
		max: .15,
		label: "target black"
	},
	curve_target_display_white_ratio: {
		type: "float",
		default: 1,
		min: .2,
		max: 1,
		label: "target white"
	},
	base_primaries: {
		type: "int",
		default: 2,
		min: 0,
		max: 5,
		label: "base primaries"
	},
	disable_primaries_adjustments: {
		type: "bool",
		default: !1,
		label: "disable adjustments"
	},
	red_inset: {
		type: "float",
		default: .29462451,
		min: 0,
		max: .99,
		label: "red attenuation"
	},
	red_rotation: {
		type: "float",
		default: .03540329,
		min: -.5236,
		max: .5236,
		label: "red rotation"
	},
	green_inset: {
		type: "float",
		default: .25861925,
		min: 0,
		max: .99,
		label: "green attenuation"
	},
	green_rotation: {
		type: "float",
		default: -.02108586,
		min: -.5236,
		max: .5236,
		label: "green rotation"
	},
	blue_inset: {
		type: "float",
		default: .14641371,
		min: 0,
		max: .99,
		label: "blue attenuation"
	},
	blue_rotation: {
		type: "float",
		default: -.06305724,
		min: -.5236,
		max: .5236,
		label: "blue rotation"
	},
	master_outset_ratio: {
		type: "float",
		default: 1,
		min: 0,
		max: 2,
		label: "master purity boost"
	},
	master_unrotation_ratio: {
		type: "float",
		default: 0,
		min: 0,
		max: 2,
		label: "master rotation reversal"
	},
	red_outset: {
		type: "float",
		default: .290776401758,
		min: 0,
		max: .99,
		label: "red purity boost"
	},
	red_unrotation: {
		type: "float",
		default: .03540329,
		min: -.5236,
		max: .5236,
		label: "red reverse rotation"
	},
	green_outset: {
		type: "float",
		default: .263155400753,
		min: 0,
		max: .99,
		label: "green purity boost"
	},
	green_unrotation: {
		type: "float",
		default: -.02108586,
		min: -.5236,
		max: .5236,
		label: "green reverse rotation"
	},
	blue_outset: {
		type: "float",
		default: .045810721815,
		min: 0,
		max: .99,
		label: "blue purity boost"
	},
	blue_unrotation: {
		type: "float",
		default: -.06305724,
		min: -.5236,
		max: .5236,
		label: "blue reverse rotation"
	},
	completely_reverse_primaries: {
		type: "bool",
		default: !1,
		label: "reverse all"
	}
}, Ae = r(L), je = [
	"export profile",
	"working profile",
	"Rec2020",
	"Display P3",
	"Adobe RGB (compatible)",
	"sRGB"
], Me = "parametric-tonemappers.agx", Ne = xe(Ae);
function Pe() {
	return {
		id: Me,
		name: "AgX (parametric)",
		description: "AgX: a log encoding over a white and black exposure range, a contrast curve with tunable toe and shoulder, and primaries rotated and attenuated around it so bright colours bleach to white.",
		glsl: ke,
		helpers: Oe,
		skipBaseCurve: !0,
		skipToneShoulder: !0,
		params: e(L),
		derive: {
			uniforms: i(ye, Ne),
			fn: (e) => xe(n(L, e))
		}
	};
}
//#endregion
//#region src/colour/yrg.ts
var Fe = [
	.989466254,
	-.0400304626,
	.0440530317,
	-.00540518733,
	1.00666069,
	-.00175551955,
	-.000403920992,
	.015076803,
	1.30210211
], Ie = [
	1.01085433,
	.0407086103,
	-.0341445825,
	.00542814201,
	.993581926,
	.00115592039,
	.000250722468,
	-.0114918759,
	.767964947
], Le = [
	.257085,
	.859943,
	-.031061,
	-.394427,
	1.1758,
	.106423,
	.064856,
	-.07625,
	.559067
], Re = [
	1.80794659,
	-1.2997166,
	.34785879,
	.6178396,
	.39595453,
	-.04104687,
	-.1254696,
	.20478038,
	1.74274183
], ze = [
	.95,
	.38,
	0,
	.05,
	.62,
	.03,
	0,
	0,
	.97
], Be = [
	1.0877193,
	-.66666667,
	.02061856,
	-.0877193,
	1.66666667,
	-.05154639,
	0,
	0,
	1.03092784
];
function Ve(e) {
	let t = .68990272 * e[0] + .34832189 * e[1], n = e[0] + e[1] + e[2], r = m(Be, n === 0 ? [
		0,
		0,
		0
	] : [
		e[0] / n,
		e[1] / n,
		e[2] / n
	]);
	return [
		t,
		r[0],
		r[1]
	];
}
function He(e) {
	let t = m(ze, [
		e[1],
		e[2],
		1 - e[1] - e[2]
	]), n = .68990272 * t[0] + .34832189 * t[1], r = n === 0 ? 0 : e[0] / n;
	return [
		t[0] * r,
		t[1] * r,
		t[2] * r
	];
}
var Ue = (e) => Ve(m(Le, m(Fe, e))), We = (e) => m(Ie, m(Re, He(e))), Ge = 2.45, Ke = -9.55, qe = Math.log(.1845) / Math.log(9.55 / 12), R = {
	grey_point_source: {
		type: "float",
		default: 18.45,
		min: 0,
		max: 100,
		label: "middle grey luminance"
	},
	black_point_source: {
		type: "float",
		default: Ke,
		min: -16,
		max: -.1,
		label: "black relative exposure"
	},
	white_point_source: {
		type: "float",
		default: Ge,
		min: .1,
		max: 16,
		label: "white relative exposure"
	},
	security_factor: {
		type: "float",
		default: 0,
		min: -50,
		max: 200,
		label: "dynamic range scaling"
	},
	grey_point_target: {
		type: "float",
		default: 18.45,
		min: 1,
		max: 50,
		label: "target middle grey"
	},
	black_point_target: {
		type: "float",
		default: .01517634,
		min: 0,
		max: 20,
		label: "target black luminance"
	},
	white_point_target: {
		type: "float",
		default: 100,
		min: 0,
		max: 1600,
		label: "target white luminance"
	},
	output_power: {
		type: "float",
		default: qe,
		min: 1,
		max: 10,
		label: "hardness"
	},
	latitude: {
		type: "float",
		default: 10,
		min: .01,
		max: 99,
		label: "latitude"
	},
	contrast: {
		type: "float",
		default: 1.18,
		min: 0,
		max: 5,
		label: "contrast"
	},
	saturation: {
		type: "float",
		default: 0,
		min: -200,
		max: 200,
		label: "colour preservation"
	},
	balance: {
		type: "float",
		default: 0,
		min: -50,
		max: 50,
		label: "shadows ↔ highlights balance"
	},
	version: {
		type: "int",
		default: 7,
		min: 5,
		max: 9,
		label: "colour science"
	},
	auto_hardness: {
		type: "bool",
		default: !0,
		label: "auto adjust hardness"
	},
	custom_grey: {
		type: "bool",
		default: !1,
		label: "use custom middle-grey values"
	},
	shadows: {
		type: "int",
		default: 3,
		min: 0,
		max: 3,
		label: "contrast in shadows"
	},
	highlights: {
		type: "int",
		default: 3,
		min: 0,
		max: 3,
		label: "contrast in highlights"
	}
}, Je = r(R), Ye = {
	5: "v8 (AgX, no bleach)",
	6: "v8 (AgX, low bleach)",
	7: "v8 (AgX, medium bleach)",
	8: "v8 (AgX, high bleach)",
	9: "v8 (AgX, extra bleach)"
}, Xe = [
	"hard",
	"soft",
	"safe",
	"perceptual"
], Ze = .01, Qe = 1.5, z = (e, t, n) => e > n ? n : e < t ? t : e;
function B(e) {
	return e.auto_hardness ? Math.log(e.grey_point_target / 100) / Math.log(-e.black_point_source / (e.white_point_source - e.black_point_source)) : e.output_power;
}
function $e(e, t) {
	let n = e.custom_grey ? (z(e.grey_point_target, e.black_point_target, e.white_point_target) / 100) ** (1 / t) : .1845 ** (1 / t), r = e.white_point_source - e.black_point_source, i = Math.abs(e.black_point_source) / r, a = (z(e.black_point_target, 0, e.grey_point_target) / 100) ** (1 / t), o = (Math.max(e.white_point_target, e.grey_point_target) / 100) ** (1 / t), s = e.contrast * r / 8, c = Math.max(1, (o - n) / (1 - i), (n - a) / i) + Ze, l = z(s / (t * n ** (t - 1)), c, 100), u = n - l * i, d = Ze * (o - a);
	return {
		greyDisplay: n,
		blackDisplay: a,
		whiteDisplay: o,
		greyLog: i,
		contrast: l,
		intercept: u,
		xmin: (a + d - u) / l,
		xmax: (o - d - u) / l
	};
}
function et(e, t) {
	let { greyDisplay: n, blackDisplay: r, whiteDisplay: i, greyLog: a, contrast: o, intercept: s, xmin: c, xmax: l } = $e(e, t), f = z(e.latitude, 0, 100) / 100, p = z(e.balance, -50, 50) / 100, m = (1 - f) * a + f * c, h = (1 - f) * a + f * l, g = p > 0 ? 2 * p * (h - a) : 2 * p * (a - m);
	m = Math.max(m - g, c), h = Math.min(h - g, l);
	let _ = m * o + s, v = h * o + s, y = [
		0,
		m,
		a,
		h,
		1
	], b = [
		r,
		_,
		n,
		v,
		i
	], x = [
		0,
		0,
		b[1] - o * y[1]
	], S = [
		0,
		0,
		o
	], C = [
		0,
		0,
		0
	], w = [
		0,
		0,
		0
	], T = [
		0,
		0,
		0
	];
	(e.shadows === 3 || e.highlights === 3) && (C[2] = b[0], w[2] = b[4]);
	let E = y[1];
	if (e.shadows === 3) {
		let e = Math.max(1e-6, y[1]), t = Math.max(1e-6, b[1] - b[0]);
		x[0] = -u(1, 1 - b[0], 1 - y[1], 1 - b[1], o, Qe), S[0] = Qe, w[0] = o * e / t, C[0] = t / e ** +w[0], T[0] = +(t / e > o);
	} else if (e.shadows === 0) {
		let [e, t, n, r, i] = d([
			0,
			0,
			0,
			0,
			1,
			0,
			0,
			0,
			1,
			0,
			E ** 4,
			E ** 3,
			E ** 2,
			E,
			1,
			4 * E ** 3,
			3 * E ** 2,
			2 * E,
			1,
			0,
			12 * E ** 2,
			6 * E,
			2,
			0,
			0
		], [
			b[0],
			0,
			b[1],
			o,
			0
		], 5);
		[x[0], S[0], C[0], w[0], T[0]] = [
			i,
			r,
			n,
			t,
			e
		];
	} else if (e.shadows === 1) {
		let [e, t, n, r] = d([
			0,
			0,
			0,
			1,
			E ** 3,
			E ** 2,
			E,
			1,
			3 * E ** 2,
			2 * E,
			1,
			0,
			6 * E,
			2,
			0,
			0
		], [
			b[0],
			b[1],
			o,
			0
		], 4);
		[x[0], S[0], C[0], w[0], T[0]] = [
			r,
			n,
			t,
			e,
			0
		];
	} else [x[0], S[0], C[0]] = tt(y[1] - y[0], b[1] - b[0], o), w[0] = _;
	let D = y[3];
	if (e.highlights === 3) {
		let e = Math.max(1e-6, 1 - y[3]), t = Math.max(1e-6, b[4] - b[3]);
		w[1] = o * e / t, C[1] = t / e ** +w[1], T[1] = 1;
	} else if (e.highlights === 1) {
		let [e, t, n, r] = d([
			1,
			1,
			1,
			1,
			D ** 3,
			D ** 2,
			D,
			1,
			3 * D ** 2,
			2 * D,
			1,
			0,
			6 * D,
			2,
			0,
			0
		], [
			b[4],
			b[3],
			o,
			0
		], 4);
		[x[1], S[1], C[1], w[1], T[1]] = [
			r,
			n,
			t,
			e,
			0
		];
	} else if (e.highlights === 0) {
		let [e, t, n, r, i] = d([
			1,
			1,
			1,
			1,
			1,
			4,
			3,
			2,
			1,
			0,
			D ** 4,
			D ** 3,
			D ** 2,
			D,
			1,
			4 * D ** 3,
			3 * D ** 2,
			2 * D,
			1,
			0,
			12 * D ** 2,
			6 * D,
			2,
			0,
			0
		], [
			b[4],
			0,
			b[3],
			o,
			0
		], 5);
		[x[1], S[1], C[1], w[1], T[1]] = [
			i,
			r,
			n,
			t,
			e
		];
	} else [x[1], S[1], C[1]] = tt(y[4] - y[3], b[4] - b[3], o), w[1] = v;
	return {
		x: y,
		y: b,
		M1: x,
		M2: S,
		M3: C,
		M4: w,
		M5: T,
		latitudeMin: y[1],
		latitudeMax: y[3],
		contrast: o,
		greyDisplay: n,
		intercept: s
	};
}
function tt(e, t, n) {
	let r = n / (2 * t) + (Math.sqrt((e * n / t + 1) ** 2 - 4) - 1) / (2 * e), i = t / n * (r * e * e + e) / (r * e * e + e - t / n);
	return [
		i * n,
		r,
		i
	];
}
var nt = {
	5: {
		inset: [
			.5991055,
			.6,
			.3300009
		],
		rotation: [
			.0571015,
			.1999891,
			.088611
		],
		outset: [
			.761433,
			.752267,
			.465293
		],
		outsetRotation: [
			-.0034297,
			.1952448,
			-.0480109
		]
	},
	6: {
		inset: [
			.6410825,
			.689811,
			.3194529
		],
		rotation: [
			.0405734,
			.1631286,
			.0350584
		],
		outset: [
			.784757,
			.789387,
			.445403
		],
		outsetRotation: [
			-.0057845,
			.1593207,
			-.0592955
		]
	},
	7: {
		inset: [
			.650954,
			.7488775,
			.3517703
		],
		rotation: [
			.0278602,
			.1214671,
			-.0228829
		],
		outset: [
			.793082,
			.815169,
			.460318
		],
		outsetRotation: [
			-.0053781,
			.1187604,
			-.0794801
		]
	},
	8: {
		inset: [
			.6379749,
			.7878689,
			.3753822
		],
		rotation: [
			.0106096,
			.0582598,
			-.0696729
		],
		outset: [
			.790237,
			.831376,
			.465406
		],
		outsetRotation: [
			-.008007,
			.05711,
			-.091222
		]
	},
	9: {
		inset: [
			.5770235,
			.8102094,
			.400039
		],
		rotation: [
			-.008106,
			-.0034008,
			-.1035236
		],
		outset: [
			.76642,
			.83802,
			.46513
		],
		outsetRotation: [
			-.0122011,
			-.0021732,
			-.0971215
		]
	}
}, rt = (e) => e === 5 || e === 6 || e === 7 || e === 8 || e === 9 ? nt[e] : nt[5];
function it(e, t, n) {
	let r = m(e.toXyz, [
		1,
		1,
		1
	]), i = Ue(r), a = (r) => {
		let a = Ue(y(e.toXyz, r)), o = a[1] - i[1], s = a[2] - i[2], l = 1 - c(t[r], 0, .9), u = Math.cos(n[r]), d = Math.sin(n[r]);
		return We([
			a[0],
			i[1] + l * (u * o - d * s),
			i[2] + l * (d * o + u * s)
		]);
	}, o = [
		a(0),
		a(1),
		a(2)
	], s = h(v(o[0], o[1], o[2]));
	if (!s) return null;
	let l = m(s, r);
	return p(e.fromXyz, v(x(o[0], l[0]), x(o[1], l[1]), x(o[2], l[2])));
}
function at(e, t) {
	let n = rt(e);
	return t === "inset" ? it(k, n.inset, n.rotation) : it(k, n.outset, n.outsetRotation);
}
function ot(e) {
	let t = at(e, "inset"), n = at(e, "outset"), r = n && h(n);
	return t && r ? {
		inset: t,
		outset: r
	} : {
		inset: f,
		outset: f
	};
}
var st = {
	fInset: "mat3",
	fOutset: "mat3",
	fM1: "vec4",
	fM2: "vec4",
	fM3: "vec4",
	fM4: "vec4",
	fM5: "vec4",
	fNodes: "vec4",
	fLog: "vec4",
	fDisplay: "vec4"
}, ct = (e) => Number.isFinite(Math.fround(e)) ? e : NaN, V = (e) => e.map(ct);
function lt(e) {
	let t = B(e), n = et(e, t), { inset: r, outset: i } = ot(e.version), a = (e) => V([
		e[0],
		e[1],
		e[2],
		0
	]), o = (t) => [
		e.shadows === 3 && n.M5[0] === 0 ? 0 : t[0],
		e.highlights === 3 && n.M5[1] === 0 ? 0 : t[1],
		t[2]
	], s = o(n.M3);
	return e.highlights === 3 && !Number.isFinite(Math.fround(s[1])) && (s[1] = 0), {
		fInset: V(S(r)),
		fOutset: V(S(i)),
		fM1: a(n.M1),
		fM2: a(n.M2),
		fM3: a(s),
		fM4: a(o(n.M4)),
		fM5: a(n.M5),
		fNodes: V([
			n.latitudeMin,
			n.latitudeMax,
			n.y[4],
			t
		]),
		fLog: V([
			e.custom_grey ? e.grey_point_source / 100 : .1845,
			e.black_point_source,
			e.white_point_source - e.black_point_source,
			.5 * (c(e.saturation / 100, -1, 1) + 1)
		]),
		fDisplay: V([
			n.y[0] ** +t,
			n.y[4] ** +t,
			e.shadows,
			e.highlights
		])
	};
}
//#endregion
//#region src/filmic/spaces.ts
var ut = M, dt = p(Le, p(Fe, k.toXyz)), ft = p(Le, p(Fe, j.toXyz)), pt = p(j.fromXyz, p(Ie, Re)), mt = b(k.toXyz, 1), ht = `const mat3 PTM_F_PIPE = ${I(ut)};
const mat3 PTM_F_PIPE_TO_LMS = ${I(dt)};
const mat3 PTM_F_EXPORT_INPUT = ${I(ft)};
const mat3 PTM_F_EXPORT_OUTPUT = ${I(pt)};
const mat3 PTM_F_LMS_TO_FILMLIGHT = ${I(Be)};
const mat3 PTM_F_FILMLIGHT_TO_LMS = ${I(ze)};
const float PTM_F_FLT_MAX = 3.402823466e38;
const float PTM_F_Y2006 = 1.05785528;
${Te}
${we}
${Ee("fCompress", mt)}
vec3 fLmsToYrg(vec3 lms) {
  float Y = 0.68990272 * lms.x + 0.34832189 * lms.y;
  float a = lms.x + lms.y + lms.z;
  vec3 n = a == 0.0 ? vec3(0.0) : lms / a;
  vec3 rgb = PTM_F_LMS_TO_FILMLIGHT * n;
  return vec3(Y, rgb.x, rgb.y);
}
vec3 fYrgToLms(vec3 yrg) {
  vec3 lms = PTM_F_FILMLIGHT_TO_LMS * vec3(yrg.y, yrg.z, 1.0 - yrg.y - yrg.z);
  float d = 0.68990272 * lms.x + 0.34832189 * lms.y;
  return lms * (d == 0.0 ? 0.0 : yrg.x / d);
}
vec4 fToYch(vec3 rgb, mat3 toLms) {
  vec3 yrg = fLmsToYrg(toLms * rgb);
  float r = yrg.y - 0.21902143;
  float g = yrg.z - 0.54371398;
  float c = length(vec2(g, r));
  return vec4(yrg.x, c, c != 0.0 ? r / c : 1.0, c != 0.0 ? g / c : 0.0);
}
vec3 fFromYch(vec4 f, mat3 fromLms) {
  return fromLms * fYrgToLms(vec3(f.x, f.y * f.z + 0.21902143, f.y * f.w + 0.54371398));
}
float fSpline(float x) {
  if (x < fNodes.x) {
    if (fDisplay.z == 3.0) {
      if (fM5.x != 0.0) return fM3.z + max(0.0, fM3.x * pow(max(x, 0.0), fM4.x));
      float ty = fNodes.x * fM2.z + fM1.z;
      float v = fM2.z * (x - fNodes.x) / fM1.x;
      return fM1.x * (v / pow(1.0 + pow(v, fM2.x), 1.0 / fM2.x)) + ty;
    }
    if (fDisplay.z == 0.0) return fM1.x + x * (fM2.x + x * (fM3.x + x * (fM4.x + x * fM5.x)));
    if (fDisplay.z == 1.0) return fM1.x + x * (fM2.x + x * (fM3.x + x * fM4.x));
    float xi = fNodes.x - x;
    float rat = xi * (xi * fM2.x + 1.0);
    return fM4.x - fM1.x * rat / (rat + fM3.x);
  }
  if (x > fNodes.y) {
    if (fDisplay.w == 3.0) return fM4.z - max(0.0, fM3.y * pow(max(1.0 - x, 0.0), fM4.y));
    if (fDisplay.w == 0.0) return fM1.y + x * (fM2.y + x * (fM3.y + x * (fM4.y + x * fM5.y)));
    if (fDisplay.w == 1.0) return fM1.y + x * (fM2.y + x * (fM3.y + x * fM4.y));
    float xi = x - fNodes.y;
    float rat = xi * (xi * fM2.y + 1.0);
    return fM4.y + fM1.y * rat / (rat + fM3.y);
  }
  return fM1.z + x * fM2.z;
}
float fToneOne(float v) {
  // A grey source of zero reads +inf upstream, which clamps to 1; dividing by it is undefined here.
  float mapped = v > 0.0 ? (fLog.x > 0.0 ? clamp((log2(v / fLog.x) - fLog.y) / fLog.z, 0.0, 1.0) : 1.0) : 0.0;
  float s = fSpline(mapped);
  return pow(s >= 0.0 ? min(s, fNodes.z) : 0.0, fNodes.w);
}
float fDen(vec3 k, float cs, float sn) {
  return k.x * (0.979381443298969 * cs + 0.391752577319588 * sn)
       + k.y * (0.0206185567010309 * cs + 0.608247422680412 * sn)
       - k.z * (cs + sn);
}
float fClipBlack(vec3 k, float cs, float sn) {
  float den = fDen(k, cs, sn);
  if (den == 0.0) return PTM_F_FLT_MAX;
  float v = -0.427506877216495 * (k.x + 0.856492345150334 * k.y + 0.554995960637719 * k.z) / den;
  return v >= 0.0 ? v : PTM_F_FLT_MAX;
}
float fClipWhiteRaw(vec3 k, float w, float Y, float cs, float sn) {
  float den = fDen(k, cs, sn);
  float t = w * (0.68285981628866 * cs + 0.482137060515464 * sn);
  if (den == 0.0) return PTM_F_FLT_MAX;
  if (Y <= t / den) return PTM_F_FLT_MAX;
  return -0.427506877216495 * (Y * (k.x + 0.856492345150334 * k.y + 0.554995960637719 * k.z) - 0.988237752433297 * w) / (Y * den - t);
}
float fClipWhite(vec3 k, float w, float Y, float cs, float sn) {
  float maxY = PTM_F_Y2006 * w;
  float dY = max(maxY - Y, 0.0);
  float v = dY < 1.0e-3 ? dY / (1.0e-3 * maxY) * fClipWhiteRaw(k, w, (1.0 - 1.0e-3) * maxY, cs, sn) : fClipWhiteRaw(k, w, Y, cs, sn);
  return v >= 0.0 ? v : PTM_F_FLT_MAX;
}
vec3 fRow(mat3 m, int i) {
  return vec3(m[0][i], m[1][i], m[2][i]);
}
vec3 fCheckRgb(vec4 f, float dBlack, float dWhite) {
  vec3 b = fFromYch(f, PTM_F_EXPORT_OUTPUT);
  b += max(-min(b.r, min(b.g, b.b)), 0.0);
  // clamp is undefined for lo > hi, so the bounds go through max and min in the twin's order.
  float Y = min(max((f.x + fToYch(b, PTM_F_EXPORT_INPUT).x) / 2.0, PTM_F_Y2006 * dBlack), PTM_F_Y2006 * dWhite);
  float c = f.y;
  for (int i = 0; i < 3; i++) {
    vec3 k = fRow(PTM_F_EXPORT_OUTPUT, i);
    c = min(c, min(fClipBlack(k, f.z, f.w), fClipWhite(k, dWhite, Y, f.z, f.w)));
  }
  return min(max(fFromYch(vec4(Y, c, f.z, f.w), PTM_F_EXPORT_OUTPUT), 0.0), dWhite);
}`, gt = "vec3 pipelineToDisplay(vec3 lin) {\n  vec3 compressed = fCompress(ptmSanitise(PTM_F_PIPE * lin));\n  vec4 o = fToYch(compressed, PTM_F_PIPE_TO_LMS);\n  vec3 t = fInset * compressed;\n  vec3 rendered = fOutset * vec3(fToneOne(t.r), fToneOne(t.g), fToneOne(t.b));\n  vec4 f = fToYch(rendered, PTM_F_PIPE_TO_LMS);\n  float chroma = min(o.y, f.y);\n  float beta = fLog.w;\n  float rMix = beta * o.y * o.z + (1.0 - beta) * chroma * f.z;\n  float gMix = beta * o.y * o.w + (1.0 - beta) * chroma * f.w;\n  float n = length(vec2(gMix, rMix));\n  vec4 ref = vec4(o.x, o.y, n > 1.0e-9 ? rMix / n : o.z, n > 1.0e-9 ? gMix / n : o.w);\n  f = vec4(min(max(f.x, PTM_F_Y2006 * fDisplay.x), PTM_F_Y2006 * fDisplay.y), chroma, ref.z, ref.w);\n  float co = ref.y * ref.x;\n  float cf = f.y * f.x;\n  if (f.x > ref.x && co < cf) cf = (co + cf) / 2.0;\n  f.y = f.x > 0.0 ? max(cf / f.x, 0.0) : (cf > 0.0 ? PTM_F_FLT_MAX : 0.0);\n  float r = f.y * f.z + 0.21902143;\n  float g = f.y * f.w + 0.54371398;\n  float maxC = f.y;\n  if (r < 0.0) maxC = min(-0.21902143 / f.z, maxC);\n  if (g < 0.0) maxC = min(-0.54371398 / f.w, maxC);\n  if (r + g > 1.0) maxC = min((1.0 - 0.21902143 - 0.54371398) / (f.z + f.w), maxC);\n  f.y = maxC;\n  return ptmEncode(fCheckRgb(f, fDisplay.x, fDisplay.y));\n}", _t = "parametric-tonemappers.filmic", vt = lt(Je);
function yt() {
	return {
		id: _t,
		name: "Filmic RGB (parametric)",
		description: "Filmic RGB, colour science v8: a log encoding over a white and black exposure range, an S curve with latitude and a perceptual toe and shoulder, rendered per channel inside a bracket of displaced primaries so bright colours bleach toward white, then gamut-mapped into sRGB.",
		glsl: gt,
		helpers: ht,
		skipBaseCurve: !0,
		skipToneShoulder: !0,
		params: e(R),
		derive: {
			uniforms: i(st, vt),
			fn: (e) => lt(n(R, e))
		}
	};
}
//#endregion
//#region src/panel/model.ts
var bt = 1e-6, xt = (e) => e.range_black_relative_ev + e.curve_pivot_x * (e.range_white_relative_ev - e.range_black_relative_ev);
function St(e, t) {
	return (c(t, e.black, e.white) - e.black) / (e.white - e.black);
}
function Ct(e, t) {
	let n = { ...t }, r = t.dynamic_range_scaling;
	if (r !== void 0 && r !== e.dynamic_range_scaling) {
		let t = (r - e.dynamic_range_scaling) / (e.dynamic_range_scaling + 1);
		Object.assign(n, a(L, {
			range_black_relative_ev: e.range_black_relative_ev * (1 + t),
			range_white_relative_ev: e.range_white_relative_ev * (1 + t)
		}));
	}
	let i = n.range_black_relative_ev ?? e.range_black_relative_ev, o = n.range_white_relative_ev ?? e.range_white_relative_ev;
	(i !== e.range_black_relative_ev || o !== e.range_white_relative_ev) && t.curve_pivot_x === void 0 && (n.curve_pivot_x = St({
		black: i,
		white: o
	}, xt(e)));
	let s = {
		...e,
		...n
	};
	if (s.auto_gamma && s.curve_pivot_y_linear_output > 0) {
		let e = c(s.curve_pivot_x, bt, .999999);
		n.curve_gamma = Math.log2(s.curve_pivot_y_linear_output) / Math.log2(e);
	}
	return n;
}
var wt = (e) => ({
	master_outset_ratio: 1,
	master_unrotation_ratio: 1,
	red_outset: e.red_inset,
	green_outset: e.green_inset,
	blue_outset: e.blue_inset,
	red_unrotation: e.red_rotation,
	green_unrotation: e.green_rotation,
	blue_unrotation: e.blue_rotation
}), Tt = (e, t) => Number.isNaN(e) ? t : Number.isNaN(t) ? e : Math.max(e, t), Et = (e, t) => Number.isNaN(e) ? t : Number.isNaN(t) ? e : Math.min(e, t);
function Dt(e) {
	let t = $e(e, B(e));
	return {
		g: t,
		toeSpan: Tt(t.greyLog - t.xmin, 1e-6),
		shoulderSpan: Tt(t.xmax - t.greyLog, 1e-6)
	};
}
function Ot(e) {
	let { g: t, toeSpan: n, shoulderSpan: r } = Dt(e), i = c(e.latitude, 0, 100) / 100, a = c(e.balance, -50, 50) / 100, o = (1 - i) * t.greyLog + i * t.xmin, s = (1 - i) * t.greyLog + i * t.xmax, l = a > 0 ? 2 * a * (s - t.greyLog) : 2 * a * (t.greyLog - o);
	o = Tt(o - l, t.xmin), s = Et(s - l, t.xmax);
	let u = c((t.greyLog - o) / n, 0, 1) * 100, d = c((s - t.greyLog) / r, 0, 1) * 100;
	if (Number.isFinite(u) && Number.isFinite(d)) return {
		toe: u,
		shoulder: d
	};
	let f = c(e.latitude, 0, 100);
	return {
		toe: f,
		shoulder: f
	};
}
function kt(e, t, n) {
	let { toeSpan: r, shoulderSpan: i } = Dt(e), a = c(t, 0, 100) / 100, o = c(n, 0, 100) / 100, s = c((r * a + i * o) / (r + i), 0, 1), l = 0;
	s > 1e-6 && (a > o ? l = .5 * (1 - o / s) : o > a && (l = .5 * (a / s - 1)));
	let u = {
		latitude: s * 100,
		balance: c(l, -.5, .5) * 100
	};
	return Number.isFinite(u.latitude) && Number.isFinite(u.balance) ? u : {
		latitude: e.latitude,
		balance: e.balance
	};
}
var At = [
	"security_factor",
	"grey_point_source",
	"black_point_source",
	"white_point_source",
	"auto_hardness"
], jt = (e, t) => a(R, {
	black_point_source: e,
	white_point_source: t
});
function Mt(e, t) {
	let n = { ...t };
	if (t.security_factor !== void 0 && t.security_factor !== e.security_factor) {
		let r = (t.security_factor - e.security_factor) / (e.security_factor + 100);
		Object.assign(n, jt(e.black_point_source + r * e.black_point_source, e.white_point_source + r * e.white_point_source));
	}
	if (t.grey_point_source !== void 0 && t.grey_point_source !== e.grey_point_source) {
		let r = Math.log2(e.grey_point_source / t.grey_point_source);
		Object.assign(n, jt(e.black_point_source - r, e.white_point_source + r));
	}
	let r = {
		...e,
		...n
	};
	return r.auto_hardness && At.some((e) => t[e] !== void 0) ? n.output_power = c(B(r), 1, 10) : e.auto_hardness && t.auto_hardness === !1 && t.output_power === void 0 && (n.output_power = c(B(e), 1, 10)), n;
}
//#endregion
//#region src/autotune.ts
function Nt(e) {
	let { data: t } = e, n = [
		Infinity,
		Infinity,
		Infinity
	], r = [
		-Infinity,
		-Infinity,
		-Infinity
	], i = [
		0,
		0,
		0
	], a = 0;
	for (let o = 0; o < e.width * e.height; o++) {
		let e = o * 4;
		if (Number.isFinite(t[e]) && Number.isFinite(t[e + 1]) && Number.isFinite(t[e + 2])) {
			for (let a = 0; a < 3; a++) {
				let o = t[e + a];
				o < n[a] && (n[a] = o), o > r[a] && (r[a] = o), i[a] += o;
			}
			a++;
		}
	}
	return a === 0 ? null : {
		min: [
			n[0],
			n[1],
			n[2]
		],
		max: [
			r[0],
			r[1],
			r[2]
		],
		mean: [
			i[0] / a,
			i[1] / a,
			i[2] / a
		]
	};
}
var Pt = 1e-6, Ft = (e, t, n) => e >= t ? e <= n ? e : n : t;
function It(e, t, n) {
	return {
		range_black_relative_ev: t,
		range_white_relative_ev: n,
		curve_pivot_x: St({
			black: t,
			white: n
		}, xt(e))
	};
}
function Lt(e, t) {
	let n = 1 + e.dynamic_range_scaling;
	return It(e, Ft(Math.log2(Math.max(Pt, Math.min(...t.min)) / .18) * n, -20, -.1), Ft(Math.log2(Math.max(Pt, Math.max(...t.max)) / .18) * n, .1, 20));
}
function Rt(e, t) {
	let n = 1 + e.dynamic_range_scaling;
	return It(e, Ft((-8 + .5 * t) * n, -20, -.1), Ft((4 + .8 * t) * n, .1, 20));
}
function zt(e, t) {
	let n = {};
	e.custom_grey && (n.grey_point_source = c(100 * Math.max(...t.mean) / 2, .001, 100));
	let r = (n.grey_point_source ?? e.grey_point_source) / 100, i = 1 + e.security_factor / 100, o = c(Math.log2(Math.max(...t.max) / r), 1, 16), s = (Number.isNaN(o) ? 1 : o) * i, l = c(Math.log2(Math.max(...t.min) / r), -16, -1) * i, u = Number.isNaN(l) ? -16 : Math.max(l, -16), d = {
		...e,
		...a(R, {
			black_point_source: u,
			white_point_source: s
		})
	};
	return {
		...n,
		black_point_source: d.black_point_source,
		white_point_source: d.white_point_source,
		output_power: B({
			...d,
			auto_hardness: !0
		})
	};
}
var Bt = {
	encoding: "linear",
	primaries: "rec2020"
};
async function Vt(e) {
	if (!e.develop.captureFloatFrame) return "unsupported";
	let t = e.stores.useDevelopStore.getState().params, n = await e.develop.captureFloatFrame(t, {
		point: "scene",
		space: Bt
	});
	return n ? n.point === "scene" ? Nt(n) ?? "no frame" : "unsupported" : "no frame";
}
//#endregion
//#region src/runtime.ts
var Ht = null;
function Ut(e) {
	Ht = e;
}
function H() {
	if (!Ht) throw Error("[parametric-tonemappers] api() called before activate()");
	return Ht;
}
function U(e, t, ...n) {
	return H().react.createElement(e, t, ...n);
}
//#endregion
//#region src/sigmoid/params.ts
var Wt = .1845, Gt = {
	middle_grey_contrast: {
		type: "float",
		default: 1.5,
		min: .1,
		max: 10,
		label: "contrast"
	},
	contrast_skewness: {
		type: "float",
		default: 0,
		min: -1,
		max: 1,
		label: "skew"
	},
	display_white_target: {
		type: "float",
		default: 100,
		min: 20,
		max: 1600,
		label: "target white"
	},
	display_black_target: {
		type: "float",
		default: .0152,
		min: 0,
		max: 15,
		label: "target black"
	},
	color_processing: {
		type: "int",
		default: 0,
		min: 0,
		max: 1,
		label: "color processing"
	},
	hue_preservation: {
		type: "float",
		default: 100,
		min: 0,
		max: 100,
		label: "preserve hue"
	},
	red_inset: {
		type: "float",
		default: 0,
		min: 0,
		max: .99,
		label: "red attenuation"
	},
	red_rotation: {
		type: "float",
		default: 0,
		min: -.4,
		max: .4,
		label: "red rotation"
	},
	green_inset: {
		type: "float",
		default: 0,
		min: 0,
		max: .99,
		label: "green attenuation"
	},
	green_rotation: {
		type: "float",
		default: 0,
		min: -.4,
		max: .4,
		label: "green rotation"
	},
	blue_inset: {
		type: "float",
		default: 0,
		min: 0,
		max: .99,
		label: "blue attenuation"
	},
	blue_rotation: {
		type: "float",
		default: 0,
		min: -.4,
		max: .4,
		label: "blue rotation"
	},
	purity: {
		type: "float",
		default: 0,
		min: 0,
		max: 1,
		label: "recover purity"
	},
	base_primaries: {
		type: "int",
		default: 1,
		min: 0,
		max: 4,
		label: "base primaries"
	}
}, Kt = r(Gt), qt = ["per channel", "RGB ratio"], Jt = [
	"working profile",
	"Rec2020",
	"Display P3",
	"Adobe RGB (compatible)",
	"sRGB"
], W = Math.fround, G = (e, t) => W(W(e) ** +W(t)), Yt = (e, t) => Number.isNaN(e) ? t : Number.isNaN(t) ? e : Math.max(e, t), Xt = (e, t) => Number.isNaN(e) ? t : Number.isNaN(t) ? e : Math.min(e, t);
function Zt(e, t, n, r, i, a) {
	let o = G(W(r + W(Yt(e, 0))), i), s = W(t * G(W(o / W(n + o)), a));
	return Number.isNaN(s) ? t : s;
}
var Qt = (e, t, n, r, i) => {
	let a = W(Wt), o = W(1e-6);
	return W(W(W(Zt(W(a + o), e, t, n, r, i) - Zt(W(a - o), e, t, n, r, i)) / 2) / o);
};
function $t(e) {
	let t = W(Wt), n = W(.01), r = W(e.middle_grey_contrast), i = Qt(1, W(G(W(0 + t), r) * W(W(1 / t) - 1)), 0, r, 1), a = G(5, W(-W(e.contrast_skewness))), o = W(n * W(e.display_white_target)), s = W(G(W(o / t), W(1 / a)) - 1), c = W(i / Qt(o, W(G(t, 1) * s), 0, 1, a)), l = W(n * W(e.display_white_target)), u = W(n * W(e.display_black_target)), d = W(G(W(l / t), W(1 / a)) - 1), f = W(G(W(u / l), W(-1 / a)) - 1), p = W(1 / c), m = W(W(t * G(d, p)) / W(G(f, p) - G(d, p)));
	return {
		whiteTarget: l,
		blackTarget: u,
		paperExposure: W(G(W(m + t), c) * d),
		filmFog: m,
		filmPower: c,
		paperPower: a,
		huePreservation: Xt(Yt(W(n * W(e.hue_preservation)), 0), 1)
	};
}
function en(e, t) {
	return e === 1 ? k : e === 2 ? A : e === 3 ? ne : e === 4 || (t ?? 1) >= 2 ? j : k;
}
var tn = (e, t, n) => me([
	F(e, t(0), n[0], 0),
	F(e, t(1), n[1], 1),
	F(e, t(2), n[2], 2)
], e.white);
function nn(e, t, n, r, i) {
	let a = tn(e, (e) => 1 - n[e], r), o = tn(e, (e) => 1 - i * n[e], r), s = o && h(p(e.fromXyz, o));
	return !a || !s ? null : {
		pipeToBase: t,
		baseToRendering: p(e.fromXyz, a),
		renderingToPipe: p(g(t), s)
	};
}
function rn(e, t) {
	let n = en(e.base_primaries, t), r = n === j ? f : p(n.fromXyz, j.toXyz), i = nn(n, r, [
		e.red_inset,
		e.green_inset,
		e.blue_inset
	], [
		e.red_rotation,
		e.green_rotation,
		e.blue_rotation
	], e.purity) ?? nn(n, r, [
		0,
		0,
		0
	], [
		0,
		0,
		0
	], 0);
	if (!i) throw Error("singular colour matrix");
	return i;
}
var an = {
	sgPipeToBase: "mat3",
	sgBaseToRendering: "mat3",
	sgRenderingToPipe: "mat3",
	sgPipeToBaseV1: "mat3",
	sgBaseToRenderingV1: "mat3",
	sgRenderingToPipeV1: "mat3",
	sgCurve: "vec4",
	sgShape: "vec4"
};
function on(e) {
	let t = $t(e), n = rn(e, 2), r = rn(e, 1);
	return {
		sgPipeToBase: S(n.pipeToBase),
		sgBaseToRendering: S(n.baseToRendering),
		sgRenderingToPipe: S(n.renderingToPipe),
		sgPipeToBaseV1: S(r.pipeToBase),
		sgBaseToRenderingV1: S(r.baseToRendering),
		sgRenderingToPipeV1: S(r.renderingToPipe),
		sgCurve: [
			t.whiteTarget,
			t.paperExposure,
			t.filmFog,
			t.filmPower
		],
		sgShape: [
			t.paperPower,
			t.blackTarget,
			t.huePreservation,
			e.color_processing
		]
	};
}
var sn = (e) => ({
	whiteTarget: e.sgCurve[0],
	paperExposure: e.sgCurve[1],
	filmFog: e.sgCurve[2],
	filmPower: e.sgCurve[3],
	paperPower: e.sgShape[0]
}), cn = `${Te}
${we}
bool sgV2() {
  bool v2 = false;
#ifdef SL_PROCESS_VERSION
#if SL_PROCESS_VERSION >= 2
  v2 = true;
#endif
#endif
  return v2;
}
float sgCurveAt(float x) {
  float base = sgCurve.z + max(x, 0.0);
  if (!(base > 0.0)) return 0.0;
  float ratio = 1.0 / (1.0 + sgCurve.y * exp2(-sgCurve.w * log2(base)));
  return sgCurve.x * pow(ratio, sgShape.x);
}
vec3 sgDesaturate(vec3 p) {
  float average = max((p.r + p.g + p.b) / 3.0, 0.0);
  float lowest = min(p.r, min(p.g, p.b));
  float k = lowest < 0.0 ? -average / (lowest - average) : 1.0;
  return average + k * (p - average);
}
ivec3 sgOrder(vec3 p) {
  if (p.r >= p.g) {
    if (p.g > p.b) return ivec3(2, 1, 0);
    if (p.b > p.r) return ivec3(1, 0, 2);
    if (p.b > p.g) return ivec3(1, 2, 0);
    return ivec3(2, 1, 0);
  }
  if (p.r >= p.b) return ivec3(2, 0, 1);
  if (p.b > p.g) return ivec3(0, 1, 2);
  return ivec3(0, 2, 1);
}
float sgAt(vec3 v, int i) {
  return i == 0 ? v.r : (i == 1 ? v.g : v.b);
}
vec3 sgScatter(ivec3 o, float lo, float md, float hi) {
  return vec3(
    o.z == 0 ? hi : (o.y == 0 ? md : lo),
    o.z == 1 ? hi : (o.y == 1 ? md : lo),
    o.z == 2 ? hi : (o.y == 2 ? md : lo));
}
vec3 sgPreserveHue(vec3 i, vec3 pc, float hue) {
  ivec3 o = sgOrder(i);
  float iLo = sgAt(i, o.x);
  float iMd = sgAt(i, o.y);
  float iHi = sgAt(i, o.z);
  float cLo = sgAt(pc, o.x);
  float cMd = sgAt(pc, o.y);
  float cHi = sgAt(pc, o.z);
  float chroma = iHi - iLo;
  float midscale = chroma != 0.0 ? (iMd - iLo) / chroma : 0.0;
  float full = cLo + (cHi - cLo) * midscale;
  float naiveMid = (1.0 - hue) * cMd + hue * full;
  float energy = pc.r + pc.g + pc.b;
  float naiveEnergy = cLo + naiveMid + cHi;
  float loPlusMd = iLo + iMd;
  float blend = loPlusMd != 0.0 ? 2.0 * iLo / loPlusMd : 0.0;
  float target = blend * energy + (1.0 - blend) * naiveEnergy;
  if (naiveMid <= cMd) {
    float mid = ((1.0 - hue) * cMd + hue * (midscale * cHi + (1.0 - midscale) * (target - cHi))) / (1.0 + hue * (1.0 - midscale));
    return sgScatter(o, target - cHi - mid, mid, cHi);
  }
  float mid = ((1.0 - hue) * cMd + hue * (cLo * (1.0 - midscale) + midscale * (target - cLo))) / (1.0 + hue * midscale);
  return sgScatter(o, cLo, mid, target - cLo - mid);
}
vec3 sgPerChannel(vec3 lin, bool v2) {
  vec3 base = sgDesaturate((v2 ? sgPipeToBase : sgPipeToBaseV1) * lin);
  vec3 r = (v2 ? sgBaseToRendering : sgBaseToRenderingV1) * base;
  vec3 pc = vec3(sgCurveAt(r.r), sgCurveAt(r.g), sgCurveAt(r.b));
  return (v2 ? sgRenderingToPipe : sgRenderingToPipeV1) * sgPreserveHue(r, pc, sgShape.z);
}
vec3 sgRgbRatio(vec3 p) {
  vec3 pos = sgDesaturate(p);
  float luma = (pos.r + pos.g + pos.b) / 3.0;
  float mapped = sgCurveAt(luma);
  vec3 pre = luma > 1.0e-9 ? (mapped / luma) * pos : vec3(mapped);
  float lowest = min(pre.r, min(pre.g, pre.b));
  float highest = max(pre.r, max(pre.g, pre.b));
  float eps = 1.0e-6;
  float toWhite = (sgCurve.x - mapped) / (highest - mapped + eps);
  float toBlack = (sgShape.y - mapped) / (lowest - mapped - eps);
  float border = min(toWhite, toBlack);
  float chroma = (mapped - lowest) / (mapped + eps);
  float adjustment = 1.0 / (chroma * border + eps);
  float hyperbolic = 2.0 * chroma / (1.0 - chroma * chroma + eps) * adjustment;
  float z = sqrt(hyperbolic * hyperbolic + 1.0);
  float k = hyperbolic / (1.0 + z) * border;
  return mapped + k * (pre - mapped);
}
vec3 sgRgbRatioIn(vec3 lin, bool v2) {
  if (v2) return sgRgbRatio(lin);
  return ${I(re)} * sgRgbRatio(${I(M)} * lin);
}`, ln = "vec3 pipelineToDisplay(vec3 lin) {\n  bool v2 = sgV2();\n  vec3 c = ptmSanitise(lin);\n  return ptmEncode(sgShape.w > 0.5 ? sgRgbRatioIn(c, v2) : sgPerChannel(c, v2));\n}", un = "parametric-tonemappers.sigmoid", dn = on(Kt);
function fn() {
	return {
		id: un,
		name: "Sigmoid (parametric)",
		description: "Sigmoid: a smooth log-logistic curve between a display black and white, with contrast and skew, applied per channel with hue preservation and adjustable primaries, or to RGB ratios.",
		glsl: ln,
		helpers: cn,
		skipBaseCurve: !0,
		skipToneShoulder: !0,
		params: e(Gt),
		derive: {
			uniforms: i(an, dn),
			fn: (e) => on(n(Gt, e))
		}
	};
}
//#endregion
//#region src/panel/controls.ts
var K = 100, pn = 180 / Math.PI;
function mn(e, t, n, r, i, a, o = "", s = 1, c, l) {
	return {
		kind: "slider",
		key: e,
		label: t,
		tooltip: n,
		min: r,
		max: i,
		step: a,
		unit: o,
		scale: s,
		when: c,
		reset: l
	};
}
var q = mn, J = mn, Y = mn;
function X(e) {
	return /^[a-z][A-Z]/.test(e) ? e : e.charAt(0).toUpperCase() + e.slice(1);
}
var hn = {
	red: "yellow (+) or magenta (-)",
	green: "cyan (+) or yellow (-)",
	blue: "magenta (+) or cyan (-)"
};
function gn(e, t) {
	return [
		"red",
		"green",
		"blue"
	].flatMap((n) => e === "before" ? [q(`${n}_inset`, `${X(n)} attenuation`, `Increase to desaturate ${n}s in highlights faster`, 0, 99, .1, "%", K, t, 0), q(`${n}_rotation`, `${X(n)} rotation`, `Shift the ${n} primary towards ${hn[n]}`, -30, 30, .1, "°", pn, t, 0)] : [q(`${n}_outset`, `${X(n)} purity boost`, `Restore the purity of ${n}, mostly in midtones and shadows`, 0, 99, .1, "%", K, t, 0), q(`${n}_unrotation`, `${X(n)} reverse rotation`, `Reverse the colour shift in ${n}s`, -30, 30, .1, "°", pn, t, 0)]);
}
var _n = [
	1,
	2,
	3,
	4,
	5
].map((e) => [e, X(je[e])]), vn = Xe.map((e, t) => [t, X(e)]), yn = [
	5,
	6,
	7,
	8,
	9
].map((e) => [e, X(Ye[e])]), bn = (e) => !e.disable_primaries_adjustments, xn = (e) => !e.completely_reverse_primaries, Sn = [{
	value: "settings",
	label: "Settings",
	tooltip: "Main look and curve settings",
	sections: [
		{
			title: "Input exposure range",
			controls: [
				q("range_white_relative_ev", "White relative exposure", "Relative exposure above mid-grey (white point)", 1, 10, .01, "EV"),
				q("range_black_relative_ev", "Black relative exposure", "Relative exposure below mid-grey (black point)", -20, -1, .01, "EV"),
				q("dynamic_range_scaling", "Dynamic range scaling", "Symmetrically increase or decrease the computed dynamic range. useful to give a safety margin to extreme luminances.", -50, 50, .1, "%", K),
				{
					kind: "action",
					id: "agxAutoTune",
					label: "Auto tune levels",
					tooltip: "Set black and white relative exposure from the image in view"
				},
				{
					kind: "action",
					id: "agxReadExposure",
					label: "Read exposure",
					tooltip: "Read exposure from the Exposure slider"
				}
			]
		},
		{
			title: "Basic curve parameters",
			controls: [
				{
					kind: "pivot",
					label: "Pivot relative exposure",
					tooltip: "Set the pivot's input exposure in EV relative to mid-grey"
				},
				q("curve_pivot_y_linear_output", "Pivot target output", "Darken or brighten the pivot (linear output power)", 0, 100, .1, "%", K),
				q("curve_contrast_around_pivot", "Contrast", "Slope of the linear section around the pivot", .1, 5, .01),
				q("curve_shoulder_power", "Shoulder power", "Contrast in highlights\nhigher values keep the slope nearly constant for longer, at the cost of a more sudden drop near white", 1, 5, .01),
				q("curve_toe_power", "Toe power", "Contrast in shadows\nhigher values keep the slope nearly constant for longer, at the cost of a more sudden drop near black", 1, 5, .01)
			]
		},
		{
			title: "Show curve",
			collapsed: !0,
			controls: [{ kind: "graph" }]
		},
		{
			title: "Advanced curve parameters",
			collapsed: !0,
			controls: [
				q("curve_linear_ratio_above_pivot", "Shoulder start", "Length to keep curve linear above the pivot. may clip highlights", 0, 100, .1, "%", K),
				q("curve_target_display_white_ratio", "Target white", "Max linear output power", 50, 100, .1, "%", K),
				q("curve_linear_ratio_below_pivot", "Toe start", "Length to keep curve linear below the pivot. may crush shadows", 0, 100, .1, "%", K),
				q("curve_target_display_black_ratio", "Target black", "Raise for a faded look", 0, 2.5, .01, "%", K),
				{
					kind: "toggle",
					key: "auto_gamma",
					label: "Keep the pivot on the diagonal",
					tooltip: "Adjusts the gamma automatically, trying to make sure the curve always remains S-shaped (given that contrast is high enough), so toe and shoulder controls remain effective."
				},
				q("curve_gamma", "Curve y gamma", "Shifts the representation (but not the output power) of the pivot along the y axis of the curve. immediate contrast around the pivot is not affected, but shadows and highlights are; you may have to counteract it with the contrast slider or with toe / shoulder controls.", 1, 5, .01, "", 1, (e) => !e.auto_gamma)
			]
		},
		{
			title: "Look",
			collapsed: !0,
			controls: [
				q("look_slope", "Slope", "Decrease or increase contrast and brightness", 0, 2, .01),
				q("look_lift", "Lift", "Deepen or lift shadows", -.5, .5, .01),
				q("look_brightness", "Brightness", "Increase or decrease brightness", 0, 2, .01),
				q("look_saturation", "Saturation", "Decrease or increase saturation", 0, 200, .1, "%", K),
				q("look_original_hue_mix_ratio", "Preserve hue", "Increase to bring hues closer to the original", 0, 100, .1, "%", K)
			]
		}
	]
}, {
	value: "primaries",
	label: "Primaries",
	tooltip: "Colour primaries adjustments",
	sections: [
		{
			title: "Base",
			controls: [{
				kind: "select",
				key: "base_primaries",
				label: "Base primaries",
				tooltip: "Colour space primaries to use as the base for below adjustments. Follows the working space, linear Rec.709 (Rec.2020 on older version 1 edits).",
				options: _n
			}, {
				kind: "toggle",
				key: "disable_primaries_adjustments",
				label: "Disable adjustments",
				tooltip: "Disable purity adjustments and rotations, only applying the curve. note that those adjustments are at the heart of AgX, without them the results are almost always going to be worse, especially with bright, saturated lights (e.g. LEDs). mainly intended to be used for experimenting."
			}]
		},
		{
			title: "Before tone mapping",
			when: bn,
			controls: gn("before")
		},
		{
			title: "After tone mapping",
			when: bn,
			controls: [
				{
					kind: "toggle",
					key: "completely_reverse_primaries",
					label: "Reverse all",
					tooltip: "Completely restore purity, undo all rotations, and hide the controls below. uncheck to restore the previous state."
				},
				{
					kind: "action",
					id: "agxSetFromAbove",
					label: "Set from above",
					tooltip: "Set parameters to completely reverse primaries modifications, but allow subsequent editing",
					enabled: xn
				},
				q("master_outset_ratio", "Master purity boost", "Overall purity boost", 0, 200, .1, "%", K, xn, 1),
				q("master_unrotation_ratio", "Master rotation reversal", "Overall unrotation ratio", 0, 200, .1, "%", K, xn, 1),
				...gn("after", xn)
			]
		}
	]
}], Cn = (e) => e.custom_grey, wn = [
	{
		value: "scene",
		label: "Scene",
		tooltip: "The scene's exposure range",
		sections: [{
			title: "Scene",
			controls: [
				J("grey_point_source", "Middle grey luminance", "Adjust to match the average luminance of the image's subject. the value entered here will then be remapped to 18.45%. decrease the value to increase the overall brightness.", .1, 36, .01, "%", 1, Cn),
				J("white_point_source", "White relative exposure", "Number of stops between middle grey and pure white. this is a reading a lightmeter would give you on the scene. adjust so highlights clipping is avoided", 2, 8, .01, "EV"),
				J("black_point_source", "Black relative exposure", "Number of stops between middle grey and pure black. this is a reading a lightmeter would give you on the scene. increase to get more contrast. decrease to recover more details in low-lights.", -14, -3, .01, "EV"),
				J("security_factor", "Dynamic range scaling", "Symmetrically enlarge or shrink the computed dynamic range. useful to give a safety margin to extreme luminances.", -50, 50, .1, "%"),
				{
					kind: "action",
					id: "filmicAutoTune",
					label: "Auto tune levels",
					tooltip: "Try to optimize the settings with some statistical assumptions. this will fit the luminance range inside the histogram bounds. works better for landscapes and evenly-lit pictures but fails for high-keys, low-keys and high-ISO pictures. this is not an artificial intelligence, but a simple guess. ensure you understand its assumptions before using it."
				}
			]
		}, {
			title: "Advanced",
			controls: [{
				kind: "toggle",
				key: "custom_grey",
				label: "Use custom middle-grey values",
				tooltip: "Enable to input custom middle-grey values. this is not recommended in general. fix the global exposure with the Exposure slider instead. disable to use standard 18.45 % middle grey."
			}]
		}]
	},
	{
		value: "look",
		label: "Look",
		tooltip: "The curve and the colour rendering",
		sections: [
			{
				title: "Tone mapping",
				controls: [
					J("contrast", "Contrast", "Slope of the linear part of the curve affects mostly the mid-tones", .5, 3, .001),
					J("output_power", "Hardness", "Equivalent to paper grade in analog. increase to make highlights brighter and less compressed. decrease to mute highlights.", 1, 10, .01, "", 1, (e) => !e.auto_hardness),
					{
						kind: "direct",
						side: "shoulder",
						label: "Highlights",
						tooltip: "Distance between middle grey and the start of the highlights roll-off. 0% keeps the shoulder at middle grey, 100% pushes it to the point where the current slope would hit the output white level.",
						min: .1,
						max: 90,
						reset: 10
					},
					{
						kind: "direct",
						side: "toe",
						label: "Shadows",
						tooltip: "Distance between middle grey and the start of the shadows roll-off. 0% keeps the toe at middle grey, 100% pushes it to the point where the current slope would hit the output black level.",
						min: .1,
						max: 90,
						reset: 10
					},
					{
						kind: "select",
						key: "highlights",
						label: "Contrast in highlights",
						tooltip: "Shape of the highlights roll-off of the curve. perceptual (default) is a generalized sigmoid derived from a perceptual appearance model: always smooth and monotonic. hard/soft/safe are the legacy polynomial/rational segments; hard compresses highlights more, soft less.",
						options: vn
					},
					{
						kind: "select",
						key: "shadows",
						label: "Contrast in shadows",
						tooltip: "Shape of the shadows roll-off of the curve. perceptual (default) is a generalized sigmoid derived from a perceptual appearance model: always smooth and monotonic. hard/soft/safe are the legacy polynomial/rational segments; hard compresses shadows more, soft less.",
						options: vn
					},
					{ kind: "graph" }
				]
			},
			{
				title: "Colour mapping",
				controls: [J("saturation", "Colour preservation", "How much of the per-channel hue drift to keep. saturation is not affected: valid diffuse colours (skin tones, product colours) keep their saturation and strongly compressed colours bleach, at any setting. -100% is pure AgX: full hue drift (the 'film' look). 0% (default) removes half the hue drift. +100% restores the original hues exactly.", -100, 100, .1, "%")]
			},
			{
				title: "Advanced",
				controls: [{
					kind: "select",
					key: "version",
					label: "Colour science",
					tooltip: "V8 tone maps each RGB channel separately in an inset rendering space: highlights bleach toward white and hues drift as tonal compression increases, with a parametric hue recovery on the colour preservation slider.",
					options: yn
				}, {
					kind: "toggle",
					key: "auto_hardness",
					label: "Auto adjust hardness",
					tooltip: "Enable to auto-set the look hardness depending on the scene white and black points. this keeps the middle grey on the identity line and improves fast tuning. disable if you want a manual control."
				}]
			}
		]
	},
	{
		value: "display",
		label: "Display",
		tooltip: "The output's black, grey and white",
		sections: [{
			title: "Display",
			controls: [
				J("black_point_target", "Target black luminance", "Luminance of output pure black, this should be 0% except if you want a faded look", 0, 20, 1e-4, "%"),
				J("grey_point_target", "Target middle grey", "Middle grey value of the target display or colour space. you should never touch that unless you know what you are doing.", 1, 50, .01, "%", 1, Cn),
				J("white_point_target", "Target white luminance", "Luminance of output pure white, this should be 100% except if you want a faded look", 0, 100, .01, "%")
			]
		}]
	}
], Tn = (e) => e.color_processing === 0, En = [
	"red",
	"green",
	"blue"
].flatMap((e) => [Y(`${e}_inset`, `${X(e)} attenuation`, `Attenuate the purity of the ${e} primary`, 0, 50, .1, "%", K), Y(`${e}_rotation`, `${X(e)} rotation`, `Rotate the ${e} primary`, -22.9, 22.9, .1, "°", pn)]), Dn = [{
	value: "settings",
	label: "Settings",
	tooltip: "The curve, the colour processing and the display targets",
	sections: [
		{
			title: "Curve",
			controls: [Y("middle_grey_contrast", "Contrast", "Compression of the applied curve implicitly defines the supported input dynamic range", .7, 3, .001), Y("contrast_skewness", "Skew", "Shift the compression towards shadows or highlights. negative values increase contrast in shadows. positive values increase contrast in highlights. the opposite end will see a reduction in contrast.", -1, 1, .01)]
		},
		{
			title: "Colour",
			controls: [{
				kind: "select",
				key: "color_processing",
				label: "Colour processing",
				tooltip: "Per channel tone maps red, green and blue apart, so bright colours bleach towards white; RGB ratio tone maps their average and keeps the ratios between them.",
				options: qt.map((e, t) => [t, X(e)])
			}, Y("hue_preservation", "Preserve hue", "Optional correction of the hue twist introduced by the per-channel processing method.", 0, 100, .1, "%", 1, Tn)]
		},
		{
			title: "Show curve",
			collapsed: !0,
			controls: [{ kind: "graph" }]
		},
		{
			title: "Display luminance",
			collapsed: !0,
			controls: [Y("display_black_target", "Target black", "The black luminance of the target display or print. can be used creatively for a faded look.", 0, 1, 1e-4, "%"), Y("display_white_target", "Target white", "The white luminance of the target display or print. can be used creatively for a faded look or blowing out whites earlier.", 50, 100, .1, "%")]
		}
	]
}, {
	value: "primaries",
	label: "Primaries",
	tooltip: "Set custom primaries",
	when: Tn,
	sections: [{
		title: "Primaries",
		controls: [
			{
				kind: "select",
				key: "base_primaries",
				label: "Base primaries",
				tooltip: "Primaries to use as the base for below adjustments. Working profile follows the working space, linear Rec.709 (Rec.2020 on older version 1 edits).",
				options: Jt.map((e, t) => [t, X(e)])
			},
			...En,
			Y("purity", "Recover purity", "Recover some of the original purity after the inset", 0, 100, 1, "%", K)
		]
	}]
}], On = (e, t) => e / (1 + e ** +t) ** (1 / t);
function kn(e, t) {
	let [n, r, i, a] = t.agxToe, [o, s, c, l] = t.agxShoulder, [u, d, f, p] = t.agxCurveC, [m, h, g] = t.agxToeFallback, [_, v, y] = t.agxShFallback, b;
	return b = e < n ? m > .5 ? e < 0 ? f : f + Math.max(0, h * e ** +g) : i * On(u * (e - n) / i, a) + r : e <= o ? u * e + d : _ > .5 ? e >= 1 ? p : p - Math.max(0, v * (1 - e) ** y) : c * On(u * (e - o) / c, l) + s, b >= f ? Math.min(b, p) : f;
}
//#endregion
//#region src/filmic/twin.ts
function An(e, t) {
	let [n, r] = t.fNodes, [, , i, a] = t.fDisplay, [o, s, c, l, u] = [
		t.fM1,
		t.fM2,
		t.fM3,
		t.fM4,
		t.fM5
	];
	if (e < n) {
		if (i === 3) {
			if (u[0] !== 0) return c[2] + Math.max(0, c[0] * Math.max(e, 0) ** +l[0]);
			let t = n * s[2] + o[2], r = s[2] * (e - n) / o[0];
			return o[0] * (r / (1 + r ** +s[0]) ** (1 / s[0])) + t;
		}
		if (i === 0) return o[0] + e * (s[0] + e * (c[0] + e * (l[0] + e * u[0])));
		if (i === 1) return o[0] + e * (s[0] + e * (c[0] + e * l[0]));
		let t = n - e, r = t * (t * s[0] + 1);
		return l[0] - o[0] * r / (r + c[0]);
	}
	if (e > r) {
		if (a === 3) return l[2] - Math.max(0, c[1] * Math.max(1 - e, 0) ** +l[1]);
		if (a === 0) return o[1] + e * (s[1] + e * (c[1] + e * (l[1] + e * u[1])));
		if (a === 1) return o[1] + e * (s[1] + e * (c[1] + e * l[1]));
		let t = e - r, n = t * (t * s[1] + 1);
		return l[1] + o[1] * n / (n + c[1]);
	}
	return o[2] + e * s[2];
}
//#endregion
//#region src/sigmoid/twin.ts
function jn(e, t) {
	let n = e > 0 ? e : 0, r = (t.filmFog + n) ** +t.filmPower, i = t.whiteTarget * (r / (t.paperExposure + r)) ** +t.paperPower;
	return Number.isNaN(i) ? t.whiteTarget : i;
}
//#endregion
//#region src/panel/Graph.ts
function Mn(e, t) {
	let n;
	try {
		n = e();
	} catch {
		return t;
	}
	let r = { ...t };
	for (let e in t) n[e].every(Number.isFinite) && (r[e] = n[e]);
	return r;
}
function Nn(e, t = 64) {
	return Array.from({ length: t + 1 }, (n, r) => [r / t, e(r / t)]);
}
function Pn(e) {
	let t = Mn(() => xe(e), Ne), n = Math.min(1 - 1e-6, Math.max(1e-6, e.curve_pivot_x));
	return {
		points: Nn((e) => kn(e, t)),
		marker: [n, kn(n, t)]
	};
}
function Fn(e) {
	let t = Mn(() => lt(e), vt), n = t.fNodes[2], r = (e) => {
		let r = An(e, t);
		return r >= 0 ? Math.min(r, n) : 0;
	}, [, i, a] = t.fLog, o = Math.abs(i) / a;
	return {
		points: Nn(r),
		marker: [o, r(o)]
	};
}
var In = -10, Ln = 16.5;
function Rn(e) {
	let t = sn(Mn(() => on(e), dn)), n = (e) => De(jn(Wt * 2 ** (In + e * Ln), t)), r = 10 / Ln;
	return {
		points: Nn(n),
		marker: [r, n(r)]
	};
}
var Z = 100, zn = ([e, t]) => Number.isFinite(e) && Number.isFinite(t);
function Bn({ points: e, marker: t }) {
	let n = H().ui.tokens;
	return U("svg", {
		viewBox: `0 0 ${Z} ${Z}`,
		role: "img",
		"aria-label": "Curve",
		style: {
			width: "100%",
			aspectRatio: "1",
			background: n.surface0,
			border: `1px solid ${n.border}`,
			borderRadius: 4
		}
	}, U("line", {
		x1: 0,
		y1: Z,
		x2: Z,
		y2: 0,
		stroke: n.border,
		strokeWidth: .5
	}), U("polyline", {
		points: e.filter(zn).map(([e, t]) => `${(e * Z).toFixed(2)},${((1 - t) * Z).toFixed(2)}`).join(" "),
		fill: "none",
		stroke: n.textPrimary,
		strokeWidth: 1
	}), t && zn(t) ? U("circle", {
		cx: t[0] * Z,
		cy: (1 - t[1]) * Z,
		r: 1.6,
		fill: n.accent
	}) : null);
}
//#endregion
//#region src/panel/presets.ts
var Q = (e) => e * Math.PI / 180, Vn = {
	look_slope: 1,
	look_brightness: 1,
	look_lift: 0,
	look_saturation: 1,
	look_original_hue_mix_ratio: .6,
	range_black_relative_ev: -10,
	range_white_relative_ev: 6.5,
	dynamic_range_scaling: .1,
	curve_contrast_around_pivot: 3,
	curve_linear_ratio_below_pivot: 0,
	curve_linear_ratio_above_pivot: 0,
	curve_toe_power: 1.5,
	curve_shoulder_power: 3.3,
	curve_target_display_black_ratio: 0,
	curve_target_display_white_ratio: 1,
	auto_gamma: !1,
	curve_gamma: 2.2,
	curve_pivot_x: 10 / 16.5,
	curve_pivot_y_linear_output: .18
}, Hn = {
	disable_primaries_adjustments: !1,
	completely_reverse_primaries: !1
}, $ = {
	classic: {
		...Hn,
		base_primaries: 2,
		red_inset: .29462451,
		green_inset: .25861925,
		blue_inset: .14641371,
		red_rotation: .03540329,
		green_rotation: -.02108586,
		blue_rotation: -.06305724,
		master_outset_ratio: 1,
		master_unrotation_ratio: 0,
		red_outset: .290776401758,
		green_outset: .263155400753,
		blue_outset: .045810721815,
		red_unrotation: .03540329,
		green_unrotation: -.02108586,
		blue_unrotation: -.06305724
	},
	smooth: {
		...Hn,
		base_primaries: 1,
		red_inset: .1,
		green_inset: .1,
		blue_inset: .15,
		red_rotation: Q(2),
		green_rotation: Q(-1),
		blue_rotation: Q(-3),
		master_outset_ratio: 0,
		master_unrotation_ratio: 1,
		red_outset: .1,
		green_outset: .1,
		blue_outset: .15,
		red_unrotation: Q(2),
		green_unrotation: Q(-1),
		blue_unrotation: Q(-3)
	},
	unmodified: {
		...Hn,
		base_primaries: 2,
		red_inset: 0,
		green_inset: 0,
		blue_inset: 0,
		red_rotation: 0,
		green_rotation: 0,
		blue_rotation: 0,
		master_outset_ratio: 1,
		master_unrotation_ratio: 1,
		red_outset: 0,
		green_outset: 0,
		blue_outset: 0,
		red_unrotation: 0,
		green_unrotation: 0,
		blue_unrotation: 0
	}
}, Un = (e) => .18 ** (1 / e), Wn = 2.4 * (2.4 * Un(2.4) ** 1.4 / (2.2 * Un(2.2) ** 1.2)), Gn = (...e) => e.reduce((e, t) => ({
	...e,
	...t
}), {
	...Ae,
	...Vn
}), Kn = Gn($.classic, {
	curve_shoulder_power: 1.5,
	curve_toe_power: 1.5,
	curve_gamma: 2.4,
	curve_contrast_around_pivot: Wn
}), qn = Gn($.classic, {
	look_original_hue_mix_ratio: 1,
	curve_contrast_around_pivot: 3.07,
	curve_toe_power: 1.4,
	curve_shoulder_power: 3.71
}), Jn = [
	{
		name: "unmodified base primaries",
		params: Gn($.unmodified)
	},
	{
		name: "classic | base",
		params: Kn
	},
	{
		name: "classic | punchy",
		params: {
			...Kn,
			look_brightness: 1 / 1.35 ** 2,
			look_lift: 0,
			look_saturation: 1.4
		}
	},
	{
		name: "sigmoid-like | default",
		params: qn
	},
	{
		name: "sigmoid-like | smooth",
		params: {
			...qn,
			...$.smooth,
			look_original_hue_mix_ratio: 0,
			curve_contrast_around_pivot: 2.98,
			curve_toe_power: 1.61,
			curve_shoulder_power: 3.02
		}
	},
	{
		name: "smooth",
		params: Gn($.smooth)
	}
], Yn = (e) => Math.fround(Math.fround(e) * Math.fround(Math.PI) / 180), Xn = {
	...Kt,
	middle_grey_contrast: 1.22,
	contrast_skewness: .65
}, Zn = {
	...Xn,
	middle_grey_contrast: 1.6,
	contrast_skewness: -.2,
	hue_preservation: 0
}, Qn = {
	...Zn,
	middle_grey_contrast: 1,
	contrast_skewness: 0,
	color_processing: 1
}, $n = {
	...Qn,
	middle_grey_contrast: 1.5,
	contrast_skewness: -.2,
	color_processing: 0,
	hue_preservation: 0,
	red_inset: .1,
	green_inset: .1,
	blue_inset: .15,
	red_rotation: Yn(2),
	green_rotation: Yn(-1),
	blue_rotation: Yn(-3),
	purity: 0,
	base_primaries: 1
}, er = [
	{
		name: "neutral grey",
		params: Xn
	},
	{
		name: "ACES 100-nit like",
		params: Zn
	},
	{
		name: "Reinhard",
		params: Qn
	},
	{
		name: "smooth",
		params: $n
	}
], tr = "Tone mapper", nr = "This photo uses another display transform. Pick one of these to edit its settings here.", rr = "This photo uses the older processing, so Safelight's own highlight shoulder still runs before the transform. Use Update processing in Develop's status bar to give the transform the full range.", ir = "Auto tune needs a Safelight build that can measure the scene before the display transform.", ar = "Nothing to measure: no photo is rendered yet, or this GPU has no float render targets.", or = (e) => (String(e).split(".")[1] ?? "").length, sr = (e, t) => Number(e.toFixed(or(t) + 1));
function cr({ label: e, tooltip: t, value: n, min: r, max: i, ...a }) {
	let o = H(), s = sr(n, a.step);
	return U("div", {
		key: e,
		title: t
	}, U(o.components.Slider, {
		label: e,
		value: s,
		min: Math.min(r, s),
		max: Math.max(i, s),
		...a
	}));
}
var lr = (e, t, n) => e.kind === "pivot" ? cr({
	label: `${e.label} (EV)`,
	tooltip: e.tooltip,
	value: xt(t),
	min: t.range_black_relative_ev,
	max: t.range_white_relative_ev,
	step: .01,
	defaultValue: 0,
	onChange: (e) => {
		let t = n.from();
		n.write({ curve_pivot_x: St({
			black: t.range_black_relative_ev,
			white: t.range_white_relative_ev
		}, e) });
	},
	onCommit: () => n.commit(e.label)
}) : null, ur = (e, t, n) => e.kind === "direct" ? cr({
	label: `${e.label} (%)`,
	tooltip: e.tooltip,
	value: Ot(t)[e.side],
	min: e.min,
	max: e.max,
	step: .1,
	defaultValue: e.reset,
	onChange: (t) => {
		let r = n.from(), i = Ot(r);
		n.write(e.side === "toe" ? kt(r, t, i.shoulder) : kt(r, i.toe, t));
	},
	onCommit: () => n.commit(e.label)
}) : null, dr = {
	id: Me,
	name: "AgX",
	table: L,
	tabs: Sn,
	edit: Ct,
	graph: Pn,
	special: lr,
	actions: {
		agxAutoTune: {
			label: "AgX auto tune levels",
			scene: !0,
			run: Lt
		},
		agxReadExposure: {
			label: "AgX read exposure",
			scene: !1,
			run: Rt
		},
		agxSetFromAbove: {
			label: "AgX set from above",
			scene: !1,
			run: wt
		}
	},
	presets: Jn,
	resets: {
		tab: "primaries",
		sets: $
	}
}, fr = {
	id: _t,
	name: "Filmic",
	table: R,
	tabs: wn,
	edit: Mt,
	graph: Fn,
	special: ur,
	actions: { filmicAutoTune: {
		label: "Filmic auto tune levels",
		scene: !0,
		raw: !0,
		run: zt
	} }
}, pr = {
	id: un,
	name: "Sigmoid",
	table: Gt,
	tabs: Dn,
	edit: (e, t) => t,
	graph: Rn,
	special: () => null,
	actions: {},
	presets: er
};
function mr(e) {
	let t = H().stores.useDevelopStore.getState();
	t.setParam("displayTransform", e), t.commitEdit("Display transform");
}
function hr(e) {
	let t = H().stores.useDevelopStore.getState();
	t.setDynParams(o(e.id, r(e.table))), t.commitEdit(`${e.name} reset`);
}
function gr() {
	let e = H(), t = e.pipelines.effectiveId(e.stores.useDevelopStore.getState().params.displayTransform);
	t === "parametric-tonemappers.agx" ? hr(dr) : t === "parametric-tonemappers.filmic" ? hr(fr) : t === "parametric-tonemappers.sigmoid" && hr(pr);
}
function _r() {
	let e = H().ui;
	return U(e.Stack, { gap: 8 }, U("p", { style: {
		margin: 0,
		color: e.tokens.textSecondary,
		fontSize: 11
	} }, nr), U(e.Row, {
		gap: 6,
		wrap: !0
	}, U(e.Button, { onClick: () => mr(Me) }, "Use AgX (parametric)"), U(e.Button, { onClick: () => mr(_t) }, "Use Filmic RGB (parametric)"), U(e.Button, { onClick: () => mr(un) }, "Use Sigmoid (parametric)")));
}
function vr() {
	let e = H(), { useDevelopStore: t, usePipelineStore: n } = e.stores, r = t((e) => e.params.displayTransform), i = t((e) => e.params.processVersion), a = t((e) => e.photoId);
	n((e) => e.activeId);
	let o = e.pipelines.effectiveId(r), s = `${o}:${a}`;
	return o === "parametric-tonemappers.agx" ? U(yr, {
		key: s,
		ui: dr,
		processVersion: i
	}) : o === "parametric-tonemappers.filmic" ? U(yr, {
		key: s,
		ui: fr,
		processVersion: i
	}) : o === "parametric-tonemappers.sigmoid" ? U(yr, {
		key: s,
		ui: pr,
		processVersion: i
	}) : U(_r, null);
}
function yr({ ui: e, processVersion: t }) {
	let i = H(), { useRef: c, useState: l } = i.react, u = i.ui, d = i.stores.useDevelopStore, f = i.develop.useParamScope(), p = `${e.id}.tab`, [m, h] = l(() => i.settings.get(p, e.tabs[0].value)), [g, _] = l(null), [, v] = l(0), y = c(null), b = () => n(e.table, s(e.id, f.getParams())), x = b(), S = r(e.table), C = (t, n, r) => {
		let i = a(e.table, n);
		return o(e.id, a(e.table, r ? i : e.edit(t, i)));
	}, w = (e, t, n = !1) => {
		f.setParams(C(b(), e, n)), f.commit(t);
	}, T = () => y.current ??= {
		from: b(),
		stored: f.getParams(),
		keys: /* @__PURE__ */ new Set()
	}, E = {
		from: () => T().from,
		write: (e) => {
			let { from: t, stored: n, keys: r } = T(), i = C(t, e, !1);
			for (let e of Object.keys(i)) r.add(e);
			let a = {};
			for (let e of r) a[e] = e in i ? i[e] : n[e];
			f.setParams(a);
		},
		commit: (e) => {
			y.current = null, f.commit(e);
		}
	}, D = (e, t) => ({ [e]: t }), ee = async (t) => {
		let n = e.actions[t];
		if (!n) return;
		if (_(null), !n.scene) return w(n.run(b(), d.getState().params.exposure), n.label, n.raw);
		let r = d.getState().photoId, a;
		try {
			a = await Vt(i);
		} catch {
			a = "no frame";
		}
		let o = d.getState();
		o.photoId === r && i.pipelines.effectiveId(o.params.displayTransform) === e.id && (a === "unsupported" ? _(ir) : a === "no frame" ? _(ar) : w(n.run(b(), a), n.label, n.raw));
	}, te = (t, n) => {
		if ("when" in t && t.when && !t.when(x)) return null;
		switch (t.kind) {
			case "slider": return cr({
				label: t.unit ? `${t.label} (${t.unit})` : t.label,
				tooltip: t.tooltip,
				value: x[t.key] * t.scale,
				min: t.min,
				max: t.max,
				step: t.step,
				defaultValue: (t.reset ?? S[t.key]) * t.scale,
				onChange: (e) => E.write(D(t.key, e / t.scale)),
				onCommit: () => E.commit(t.label)
			});
			case "toggle": return U("div", {
				key: t.key,
				title: t.tooltip
			}, U(u.Toggle, {
				checked: x[t.key],
				label: t.label,
				onChange: (e) => w(D(t.key, e), t.label)
			}));
			case "select": {
				let e = x[t.key], n = t.options.some(([t]) => t === e) ? e : t.options[1][0];
				return U(u.Select, {
					key: t.key,
					ariaLabel: t.label,
					title: t.tooltip,
					value: String(n),
					options: t.options.map(([e, t]) => ({
						value: String(e),
						label: t
					})),
					onChange: (e) => w(D(t.key, Number(e)), t.label)
				});
			}
			case "action": {
				let n = e.actions[t.id]?.scene === !0 && !i.develop.captureFloatFrame, r = t.enabled !== void 0 && !t.enabled(x);
				return U(u.Button, {
					key: t.id,
					size: "sm",
					disabled: n || r,
					title: n ? ir : t.tooltip,
					onClick: () => void ee(t.id)
				}, t.label);
			}
			case "graph": return U(Bn, {
				key: `graph-${n}`,
				...e.graph(x)
			});
			default: return e.special(t, x, E);
		}
	}, O = (t) => {
		if (t.when && !t.when(x)) return null;
		let n = `${e.id}.open.${t.title}`, r = !t.collapsed || i.settings.get(n, !1), a = t.title.toLowerCase().replace(/^show /, ""), o = t.collapsed ? U(u.Button, {
			variant: "ghost",
			size: "sm",
			"aria-label": `${r ? "Hide" : "Show"} ${a}`,
			onClick: () => {
				i.settings.set(n, !r), v((e) => e + 1);
			}
		}, r ? "Hide" : "Show") : void 0;
		return U(u.Section, {
			key: t.title,
			title: t.title,
			right: o
		}, r ? U(u.Stack, { gap: 6 }, ...t.controls.map(te)) : null);
	}, k = (e, t, n) => U(u.Select, {
		key: e,
		ariaLabel: e,
		placeholder: e,
		value: "",
		options: t.map((e) => ({
			value: e,
			label: e
		})),
		onChange: n
	}), A = e.tabs.filter((e) => !e.when || e.when(x)), ne = A.find((e) => e.value === m) ?? A[0], { presets: j, resets: M } = e;
	return U(u.Stack, { gap: 10 }, (t ?? 1) < 2 ? U("p", { style: {
		margin: 0,
		color: u.tokens.textMuted,
		fontSize: 11
	} }, rr) : null, j ? k("Preset", j.map((e) => e.name), (t) => {
		let n = j.find((e) => e.name === t);
		n && w(n.params, `${e.name} preset: ${t}`, !0);
	}) : null, U(u.SegmentedControl, {
		value: ne.value,
		options: A.map((e) => ({
			value: e.value,
			label: e.label,
			title: e.tooltip
		})),
		onChange: (e) => {
			i.settings.set(p, e), h(e);
		}
	}), M && ne.value === M.tab ? k("Reset primaries", Object.keys(M.sets), (t) => {
		let n = M.sets[t];
		n && w(n, `${e.name} reset primaries: ${t}`);
	}) : null, ...ne.sections.map(O), g ? U("p", { style: {
		margin: 0,
		color: u.tokens.textSecondary,
		fontSize: 11
	} }, g) : null);
}
//#endregion
//#region src/index.ts
function br(e) {
	Ut(e), e.registerPipeline(Pe()), e.registerPipeline(yt()), e.registerPipeline(fn()), e.registerPanel({
		id: "parametric-tonemappers.panel",
		title: tr,
		component: vr,
		defaultDock: {
			module: "develop",
			direction: "right",
			order: 4,
			width: 268
		},
		modules: ["develop"],
		onReset: gr
	});
}
function xr() {}
//#endregion
export { br as activate, xr as deactivate };

//# sourceMappingURL=index.js.map