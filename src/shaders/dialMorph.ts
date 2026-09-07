// The dial turning into a photograph, as a turbulent dissolve.
//
// Not a cross-fade. A cross-fade moves every pixel at the same rate, which reads as
// one picture being turned down while another is turned up — you see both at once,
// flat, for the whole transition. This thresholds a fractal noise field instead, so
// the image arrives in tendrils that widen into each other: at any instant most of
// the surface is fully one or fully the other, and only a narrow band is in between.
// That band is where the eye goes, and it is doing something, which is what makes
// the change read as a morph rather than a fade.
//
// The dissolve is fed by turbulence — the sum of ABS(signed noise) over octaves —
// rather than plain fBm. Taking the absolute value creases the field at every zero
// crossing, and those creases survive the octave sum as filaments; a plain fBm
// thresholds into rounded blobs, which look like a stain spreading.

export const MORPH_VERT = /* glsl */ `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

export const MORPH_FRAG = /* glsl */ `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uImage;
// The dissolve threshold, baked in JS and uploaded (see lib/dialField.ts). Sampled
// rather than computed here so the numerals and hands can be staggered against the
// exact same values — two evaluations of the same noise, one at float32 on the GPU
// and one at float64 in JS, do not agree past the first octave.
uniform sampler2D uNoise;
// 0 = the dial is untouched, 1 = the photograph has taken it completely.
uniform float uQ;
uniform float uTime;
// The image's own aspect ratio. The dial is a circle in a square box, so the image
// is cropped to cover rather than squashed to fit.
uniform float uImgAspect;

// Half-width of the band between "still dial" and "now photograph", in units of the
// noise field. Wide enough that the edge is a gradient rather than a cut, narrow
// enough that the two states stay legible on either side of it.
const float EDGE = 0.18;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 34.56);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1, 0)), f.x),
             mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), f.x), f.y);
}

// Still computed here for the WARP, which nothing outside this shader has to agree
// with. The 2.03 lacunarity is deliberately not 2.0: an exact doubling lines every
// octave's grid up with the last one, and the creases stack into visible
// horizontals and verticals.
float turbulence(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  float norm = 0.0;
  for (int i = 0; i < 5; i++) {
    sum += amp * abs(noise(p) * 2.0 - 1.0);
    norm += amp;
    p *= 2.03;
    amp *= 0.5;
  }
  return sum / norm;
}

void main() {
  vec2 uv = vUv;

  // Already stretched and remapped on the way in; see dialField.ts.
  float n = texture(uNoise, uv).r;

  // Pushed out by EDGE at both ends so uQ = 0 is fully dial and uQ = 1 is fully
  // photograph, with no sliver of the other left at either extreme.
  float t = uQ * (1.0 + 2.0 * EDGE) - EDGE;
  float reveal = smoothstep(n - EDGE, n + EDGE, t);

  // Peaks at the half-way point of each pixel's own transition and is zero at both
  // ends, so the warp exists only while that pixel is actually changing and leaves
  // the settled image undistorted.
  float mid = 4.0 * reveal * (1.0 - reveal);
  vec2 warp = vec2(
    turbulence(uv * 3.4 + 17.0) - 0.35,
    turbulence(uv * 3.4 + 43.0) - 0.35
  ) * 0.16 * mid;

  // Cover, not contain: scale the sampled rect down on the long axis so the short
  // axis fills and the overflow is cropped.
  vec2 fit = uImgAspect > 1.0
    ? vec2(1.0 / uImgAspect, 1.0)
    : vec2(1.0, uImgAspect);
  vec2 iuv = (uv + warp - 0.5) * fit + 0.5;
  vec3 img = texture(uImage, clamp(iuv, 0.0, 1.0)).rgb;

  // The dial is a circle in a square canvas. Feathering the rim here rather than
  // leaning on the parent's border-radius keeps the edge antialiased at any size —
  // a clipped canvas is clipped to whole pixels.
  float r = length(vUv - 0.5) * 2.0;
  float disc = 1.0 - smoothstep(0.988, 1.0, r);

  fragColor = vec4(img, reveal * disc);
}
`;
