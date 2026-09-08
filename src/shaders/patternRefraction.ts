// "Pattern refraction" — the custom shader on layer 1722:151 of Figma frame 1722:3,
// ported from the WGSL the Figma MCP server ships for it.
//
// Figma's own runtime is WebGPU, and rendering it in a page the way Figma does also
// needs the HTML-in-Canvas API, which has not shipped. None of that is inherent to
// the shader: it is a fragment program over one input texture, and the port below is
// the same program in GLSL ES 3.00, which is what the rest of this project already
// runs. Every constant is Figma's; nothing here is tuned by eye.
//
// What it does: builds a height field from a repeating pattern, differentiates it
// into a surface normal, refracts a straight-down ray through that surface once per
// colour channel at slightly different indices, and samples the input where each
// refracted ray lands. Where the surface is flat the normal points at the viewer and
// nothing moves; where it is steep the ray hits total internal reflection and
// `refract` returns zero, so nothing moves there either. The displacement lives in
// the band between, which is what turns a photograph into the banded, silky field
// the frame shows rather than a recognisably smeared picture.
//
// The one addition is uScale, so the effect can be rendered at more than one device
// pixel per frame unit without changing what it looks like. Every length the shader
// works in is in input pixels, so the caller multiplies the three that are absolute
// (the pattern size, the refraction amount, and the derivative step) by the same
// factor; the pattern centre is already a fraction of the input's size and needs no
// correction.

export const REFRACT_VERT = /* glsl */ `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

export const REFRACT_FRAG = /* glsl */ `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uInput;
uniform vec2  uCenter;     // pattern centre, in input pixels
uniform float uAngle;      // pattern rotation, radians
uniform float uSize;       // pattern period, in input pixels
uniform float uAmount;     // refraction offset, in input pixels
uniform float uSeamless;
uniform float uFrost;
uniform float uIorDispersion;
uniform float uStep;       // derivative step, in input pixels
uniform float uWash;       // white laid over the result, 0..1

const float PI = 3.14159265358979323846;

// Figma's own defaults for this instance, baked in because they are not animated:
//   patternType   1  (zigzag)
//   pixelWrapMode 3  (mirror)
// Both are branches on a uniform in the original; there is no reason to pay for the
// branch per sample when the frame only ever uses one of each.

float zigzag(float t, float freq, float amp) {
  float p = t * freq;
  return (abs(fract(p) * 2.0 - 1.0) * 2.0 - 1.0) * amp;
}

float hash3(vec3 p) {
  vec3 pp = fract(p * 0.3183099 + vec3(0.1));
  pp *= 17.0;
  return fract(pp.x * pp.y * pp.z * (pp.x + pp.y + pp.z));
}

float vnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash3(i + vec3(0, 0, 0)), hash3(i + vec3(1, 0, 0)), u.x),
        mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), u.x), u.y),
    mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), u.x),
        mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), u.x), u.y),
    u.z);
}

float patternHeight(vec2 p, mat2 rot, float invSize) {
  vec2 pos = rot * (p - uCenter) * invSize;
  // patternType 1: the columns are pushed sideways by a zigzag running down them,
  // which is what stops the field reading as a plain corduroy.
  pos.x += zigzag(pos.y, 0.15, 0.6);
  vec2 gridPos = fract(pos) * 2.0 - 1.0;
  float height = pow(sin((gridPos.x * 0.5 + 0.5) * PI), 0.7);
  height = clamp(height, 0.0, 1.0);
  height *= pow(height, uSeamless);
  if (uFrost > 0.0001) height += (vnoise(vec3(p * 0.5, 1.0)) - 0.5) * uFrost;
  return height;
}

vec3 patternNormals(vec2 p, mat2 rot, float invSize) {
  float h = patternHeight(p, rot, invSize);
  float hx = patternHeight(p + vec2(uStep, 0.0), rot, invSize);
  float hy = patternHeight(p + vec2(0.0, uStep), rot, invSize);
  // The z term is deliberately tiny: the surface is nearly edge-on everywhere, and
  // that is what puts most of the field either side of the refracting band.
  return normalize(vec3(h - hx, h - hy, 0.0125));
}

// pixelWrapMode 3 — mirror. Sampling is clamped as well as mirrored so the fold
// itself never picks up the edge texel twice.
vec4 sampleWrapped(vec2 pixelPos, vec2 dims) {
  vec2 uv = pixelPos / dims;
  vec2 m = fract(uv * 0.5) * 2.0;
  vec2 mirrored = vec2(m.x > 1.0 ? 2.0 - m.x : m.x, m.y > 1.0 ? 2.0 - m.y : m.y);
  return texture(uInput, clamp(mirrored, 0.0, 1.0));
}

void main() {
  vec2 dims = vec2(textureSize(uInput, 0));
  vec2 localPos = vUv * dims;

  float c = cos(uAngle);
  float s = sin(uAngle);
  mat2 rot = mat2(c, s, -s, c);
  float invSize = 1.0 / uSize;

  vec3 ray = vec3(0.0, 0.0, -1.0);
  float iorR = 1.333 + uIorDispersion;
  float iorG = 1.333;
  float iorB = 1.333 - uIorDispersion;

  // 6x6 supersampling, as in the original. The pattern's edges are where the
  // displacement changes fastest, so a single sample per pixel aliases into visible
  // stair-stepping across the whole field. This runs once, not per frame.
  const int N = 6;
  vec4 accum = vec4(0.0);
  for (int i = 0; i < N; i++) {
    for (int j = 0; j < N; j++) {
      vec2 offset = vec2(float(i), float(j)) / float(N) - (float(N) - 1.0) / float(N) * 0.5;
      vec3 nor = patternNormals(localPos + offset, rot, invSize);
      vec3 dR = refract(ray, nor, iorR);
      vec3 dG = refract(ray, nor, iorG);
      vec3 dB = refract(ray, nor, iorB);
      accum.r += sampleWrapped(localPos + dR.xy * uAmount, dims).r;
      accum.g += sampleWrapped(localPos + dG.xy * uAmount, dims).g;
      accum.b += sampleWrapped(localPos + dB.xy * uAmount, dims).b;
      accum.a += sampleWrapped(localPos + dG.xy * uAmount, dims).a;
    }
  }
  accum /= float(N * N);

  // The layer's own fill sits over the refracted backdrop: white at 13%.
  fragColor = vec4(mix(accum.rgb, vec3(1.0), uWash), 1.0);
}
`;

/** Every parameter of the shader instance on 1722:151, as Figma stores them, with
 *  the derivations its runtime applies before they reach the program. Kept in the
 *  design's units so they can be checked against the file. */
export const CENTER_REFRACTION = {
  /** centerHandle.x / .y, percentages of the input's size. */
  centerPct: [-68, 192] as const,
  /** centerHandle.angle, degrees — negated into radians by the runtime. */
  angleDeg: -45,
  /** centerHandle.radius 0..100 maps onto a 20..1000px period. */
  radius: 12,
  /** amount -100..100 maps onto -1000..1000px. */
  amount: -77,
  /** 0..100 -> 0..1, floored just above zero so `pow` never sees it. */
  seamlessness: 100,
  /** 0..100 -> 0..0.1. */
  frost: 0,
  /** 0..100 -> 0..0.25. */
  iorDispersion: 10,
  /** The layer's fill: white at 13%. */
  wash: 0.13,
} as const;

/** The runtime's own derivations, in one place so the numbers above stay readable
 *  as the design's and these stay readable as the program's. */
export function refractionUniforms(scale: number) {
  const p = CENTER_REFRACTION;
  return {
    centerPct: p.centerPct,
    angle: -p.angleDeg * (Math.PI / 180),
    size: (20 + (p.radius / 100) * 980) * scale,
    amount: p.amount * 10 * scale,
    seamless: Math.max(0.001, p.seamlessness / 100),
    frost: (p.frost / 100) * 0.1,
    iorDispersion: (p.iorDispersion / 100) * 0.25,
    step: 0.125 * scale,
    wash: p.wash,
  };
}
