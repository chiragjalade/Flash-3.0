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
// The picture that replaces it. Its own sampler rather than a second pass, because
// for most of the handover both are on the dial at once.
uniform sampler2D uImage2;
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
uniform float uImg2Aspect;
// The handover. uOut slides the first picture off to the left and takes it apart as
// it goes; uIn brings the second in from the right and puts it together. Nothing
// else on the clock moves — the rim, the numerals, the hands and the glass are all
// where they were, and these two pictures travel through them.
uniform float uOut;
uniform float uIn;

// Half-width of the band between "still dial" and "now photograph", in units of the
// noise field. Wide enough that the edge is a gradient rather than a cut, narrow
// enough that the two states stay legible on either side of it.
const float EDGE = 0.18;

// How far each picture travels, as a fraction of the dial. Enough to read as a slide
// rather than a fade, short enough that the leading edge of the arriving picture has
// crossed the middle before the departing one has finished going.
const float SHIFT = 0.62;

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

// Threshold the field: 0 before this pixel's turn, 1 after, eased across a band.
float cut(float n, float t) {
  float x = t * (1.0 + 2.0 * EDGE) - EDGE;
  return smoothstep(n - EDGE, n + EDGE, x);
}

// Cover, not contain: scale the sampled rect down on the long axis so the short axis
// fills and the overflow is cropped.
vec2 cover(vec2 uv, float aspect) {
  vec2 fit = aspect > 1.0 ? vec2(1.0 / aspect, 1.0) : vec2(1.0, aspect);
  return (uv - 0.5) * fit + 0.5;
}

// A picture that has slid past its own edge has nothing left to sample; without this
// the clamp would smear its last column across the rest of the dial.
float inFrame(vec2 p) {
  vec2 a = smoothstep(vec2(0.0), vec2(0.012), p);
  vec2 b = smoothstep(vec2(1.0), vec2(0.988), p);
  return a.x * a.y * b.x * b.y;
}

void main() {
  vec2 uv = vUv;

  // Three independent fields, one per channel — already stretched and remapped on
  // the way in; see dialField.ts. One fetch, three patterns.
  //
  // They have to differ. Run the departure against the same field as the arrival and
  // the picture leaves through exactly the tendrils it came in through, in the same
  // order, which reads as the first morph playing again rather than as a handover.
  vec3 n = texture(uNoise, uv).rgb;

  float reveal = cut(n.r, uQ);
  float rOut = cut(n.g, uOut);
  float rIn = cut(n.b, uIn);

  // Peaks at the half-way point of each pixel's own transition and is zero at both
  // ends, so the warp exists only while that pixel is changing and leaves a settled
  // picture undistorted.
  float busy = max(reveal * (1.0 - reveal), max(rOut * (1.0 - rOut), rIn * (1.0 - rIn)));
  vec2 warp = vec2(
    turbulence(uv * 3.4 + 17.0) - 0.35,
    turbulence(uv * 3.4 + 43.0) - 0.35
  ) * 0.16 * 4.0 * busy;

  // Sampling further right shows the picture further left, so uOut adds and uIn —
  // which starts off to the right and comes back to nothing — subtracts.
  vec2 uv1 = cover(uv + warp + vec2(uOut * SHIFT, 0.0), uImgAspect);
  vec2 uv2 = cover(uv + warp - vec2((1.0 - uIn) * SHIFT, 0.0), uImg2Aspect);

  vec3 c1 = texture(uImage, clamp(uv1, 0.0, 1.0)).rgb;
  vec3 c2 = texture(uImage2, clamp(uv2, 0.0, 1.0)).rgb;

  float a1 = reveal * (1.0 - rOut) * inFrame(uv1);
  float a2 = rIn * inFrame(uv2);

  // The second picture over the first, in premultiplied terms and then divided back
  // out — the canvas is not premultiplied, and compositing straight colour would
  // darken every pixel the two of them share.
  float outA = a1 * (1.0 - a2) + a2;
  vec3 outC = c1 * a1 * (1.0 - a2) + c2 * a2;
  outC = outA > 0.0001 ? outC / outA : vec3(0.0);

  // The dial is a circle in a square canvas. Feathering the rim here rather than
  // leaning on the parent's border-radius keeps the edge antialiased at any size —
  // a clipped canvas is clipped to whole pixels.
  float r = length(vUv - 0.5) * 2.0;
  float disc = 1.0 - smoothstep(0.988, 1.0, r);

  fragColor = vec4(outC, outA * disc);
}
`;
