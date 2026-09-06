// Liquid-metal shader for the hero lockup.
//
// Adapted from the LiquidMetalOverlay shader in MatthewSRC/native-springs-shaders
// (android/src/main/res/raw/liquid_metal.glsl), "Created by Matthias Brandolin -
// 2026", MIT licensed. The flowing-band reflection model, the Fresnel/roughness
// response, the contrast S-curve, the chroma split and the specular lobe are all
// from there.
//
// Two substantive changes were needed to drive hero type instead of a card border:
//
//  1. MASK. The original masks itself to a rounded-rectangle BORDER RING built from
//     two SDFs, and derives `borderDepth` (0 at the ring's outer edge, 1 at its
//     inner edge) from that ring's thickness. Hero type has no such ring, so both
//     now come from a texture: .r is the lockup's antialiased coverage and .g is a
//     normalised distance-to-outline computed on the CPU with an exact euclidean
//     distance transform. `depth` therefore runs 0 at a letterform's outline to 1
//     at its spine.
//
//  2. BEVEL NORMAL. A ring's cross-section is a half-round pipe, so the original
//     faces the viewer at the MIDDLE of the border thickness: cos((d - 0.5) * PI),
//     which grazes at BOTH d=0 and d=1. A filled glyph faces the viewer at its
//     spine and grazes only at its outline, so that becomes sin(d * PI/2).
//     Keeping the original would render every stroke as two parallel tubes with a
//     dark seam down the middle of it.
//
// Everything else is tuning, plus one addition. The look being chased is the
// "stainless steel" material from shaders.com, which is Pro-only with no source
// published; the closest freely-licensed ingredients are this shader's banding and
// (for reference) paper-design/shaders' liquid metal, Apache-2.0. Neither produces
// a DIRECTIONAL grain, and brushed-vs-polished is most of what separates stainless
// from chrome — so the anisotropic brush grain below is mine, not from the source.

export const HERO_VERT = /* glsl */ `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  vUv.y = 1.0 - vUv.y; // the mask is rasterised by canvas2d, whose rows run top-down
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

export const HERO_FRAG = /* glsl */ `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

// .r = antialiased coverage, .g = normalised distance from outline to spine
uniform sampler2D uMask;

uniform float uTime;
uniform vec2  uViewSize;
uniform vec2  uSpecular;   // specular centre, -1..1 in clip space
uniform vec3  uBaseColor;
uniform vec3  uHighlight;
uniform float uFlowSpeed;
uniform float uRepetition;
uniform float uDistortion;
uniform float uChroma;   // colour split only — see uSheen
uniform float uSheen;    // strength of the blown-out white band peaks
uniform float uFlowAngle;
uniform float uRoughness;
uniform float uSpecIntensity;
uniform float uSpecSize;
uniform float uBrush;      // anisotropic brush-grain depth (0 = polished chrome)

const float M_PI_F = 3.14159265359;
const float TWO_PI = 6.28318530718;

const float FRESNEL_F0 = 0.92;
const float ROUGH_UNIFORM_REFLECT = 0.7;
const float BAND_SHARP_MIN = 0.4;
const float BAND_SHARP_MAX = 3.0;
const float CONTRAST_POLISHED = 3.5;
const float CONTRAST_ROUGH = 1.3;
const float CONTRAST_CENTER_POLISHED = 0.48;
const float CONTRAST_CENTER_ROUGH = 0.45;
const float S_CURVE_POLISHED = 0.55;

// Lifted well off the source's near-black 0.02. That value suits a thin border on
// a dark app; on hero type it makes every stroke's core read as wet tar.
const float BASE_DARKEN = 0.18;
const float HIGHLIGHT_BOOST = 1.2;
const float RIM_FALLOFF = 6.0;
const float SPEC_COLOR_BOOST = 1.5;

// Steel reflects a room, so even its darkest band sits at mid-grey, never black.
const vec3 FLOW_DARK = vec3(0.17, 0.18, 0.20);
const vec3 FLOW_BRIGHT = vec3(0.97, 0.98, 1.0);
const vec3 WARM_TINT = vec3(1.0, 0.9, 0.85);
const vec3 COOL_TINT = vec3(0.85, 0.92, 1.0);
const vec3 CHROMA_BLUE = vec3(0.2, 0.5, 1.0);
const vec3 CHROMA_ORANGE = vec3(1.0, 0.5, 0.2);
const vec3 SPEC_WARM_WHITE = vec3(1.0, 0.98, 0.95);

float hashLM(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noiseLM(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hashLM(i), hashLM(i + vec2(1, 0)), f.x),
             mix(hashLM(i + vec2(0, 1)), hashLM(i + vec2(1, 1)), f.x), f.y);
}

float flowingBand(vec2 coord, float bandFlowAngle, float bandTime, float frequency,
                  float edgeFactor, float noiseInfluence, float sharpnessExp) {
  float c = cos(bandFlowAngle);
  float s = sin(bandFlowAngle);
  float flowPos = coord.x * c + coord.y * s;

  float noise = noiseLM(coord * 3.0 + bandTime * 0.05);
  flowPos += noise * noiseInfluence;
  flowPos += edgeFactor * noise * 0.2;
  flowPos -= bandTime * 0.08;

  float band = sin(flowPos * frequency * TWO_PI);
  band = sign(band) * pow(abs(band), sharpnessExp);

  return band * 0.5 + 0.5;
}

vec3 flowingReflections(vec2 uv, float reflTime, float depth, float frequency,
                        float reflDistortion, float chromatic, float reflFlowAngle,
                        float roughness, float aspectRatio) {
  float sharpnessExp = mix(BAND_SHARP_MIN, BAND_SHARP_MAX, roughness);
  float effectiveChromatic = chromatic * (1.0 - roughness * 0.8);

  vec2 correctedUV = vec2(uv.x * aspectRatio, uv.y);

  // Concentrate the band wobble near a letterform's OUTLINE. The original peaked
  // this at both ends of the border thickness, which for a glyph would also wobble
  // the spine — the one place the reflection should stay coherent.
  float edgeFactor = 1.0 - smoothstep(0.0, 0.55, depth);

  float baseNoise = noiseLM(correctedUV * 2.5 + reflTime * 0.02);

  float band1 = flowingBand(correctedUV, reflFlowAngle, reflTime, frequency, edgeFactor, reflDistortion * 0.5, sharpnessExp);
  float band2 = flowingBand(correctedUV * 1.2, reflFlowAngle + 0.15, reflTime * 0.85, frequency * 0.8, edgeFactor, reflDistortion * 0.4, sharpnessExp);
  float band3 = flowingBand(correctedUV * 0.9, reflFlowAngle - 0.1, reflTime * 1.1, frequency * 1.3, edgeFactor, reflDistortion * 0.3, sharpnessExp);

  float combinedBand = band1 * 0.5 + band2 * 0.3 + band3 * 0.2;
  combinedBand += (baseNoise - 0.5) * 0.15 * reflDistortion;

  float redOffset = effectiveChromatic * 0.03 * (1.0 - baseNoise);
  float blueOffset = -effectiveChromatic * 0.025 * (0.5 + baseNoise * 0.5);

  float rBand = flowingBand(correctedUV + vec2(redOffset, redOffset * 0.5), reflFlowAngle, reflTime, frequency, edgeFactor, reflDistortion * 0.5, sharpnessExp);
  float gBand = combinedBand;
  float bBand = flowingBand(correctedUV + vec2(blueOffset, blueOffset * 0.5), reflFlowAngle, reflTime, frequency, edgeFactor, reflDistortion * 0.5, sharpnessExp);

  rBand = rBand * 0.6 + band2 * 0.4;
  bBand = bBand * 0.6 + band3 * 0.4;

  // Converge the channels toward one achromatic band set.
  //
  // This is the fix that actually neutralises the metal. The source composes r, g
  // and b from DIFFERENT weightings of band1/band2/band3 (0.6/0.4, 50/30/20,
  // 0.6/0.4), so the three channels diverge structurally — the metal stays
  // rainbow-coloured even with the chromatic offsets driven to zero, because the
  // offsets were never the main source of the colour. Interpolating back toward the
  // green channel's blend gives a single dial that runs from neutral steel to the
  // original's iridescence.
  return mix(vec3(gBand), vec3(rBand, gBand, bBand), chromatic);
}

void main() {
  vec2 uv = vUv;
  vec2 mask = texture(uMask, uv).rg;
  float cover = mask.r;

  // Outside the letterforms there is nothing to shade. Bail before the ~10 noise
  // fetches below — on this lockup the type covers well under a fifth of its box,
  // so this early-out is most of the shader's frame budget.
  if (cover < 0.003) {
    fragColor = vec4(0.0);
    return;
  }

  float depth = mask.g;  // 0 at the outline -> 1 at the spine
  float localTime = uTime * uFlowSpeed * 0.3;
  float aspectRatio = uViewSize.x / uViewSize.y;

  // Rounded bevel across each stroke: view-facing at the spine, grazing at the
  // outline. (The source's half-round pipe normal is wrong here — see the header.)
  float bevelNormalY = sin(depth * M_PI_F * 0.5);

  float fresnelTerm = FRESNEL_F0 + (1.0 - FRESNEL_F0) * pow(1.0 - max(bevelNormalY, 0.0), 5.0);
  float baseReflect = mix(fresnelTerm, ROUGH_UNIFORM_REFLECT, uRoughness);

  vec3 darkBase = uBaseColor * BASE_DARKEN;
  vec3 peakWhite = uHighlight * HIGHLIGHT_BOOST;

  vec3 flowBands = flowingReflections(uv, localTime, depth, uRepetition, uDistortion,
                                      uChroma, uFlowAngle, uRoughness, aspectRatio);

  vec3 flowColor;
  flowColor.r = mix(FLOW_DARK.r, FLOW_BRIGHT.r, flowBands.r);
  flowColor.g = mix(FLOW_DARK.g, FLOW_BRIGHT.g, flowBands.g);
  flowColor.b = mix(FLOW_DARK.b, FLOW_BRIGHT.b, flowBands.b);

  float contrastMult = mix(CONTRAST_POLISHED, CONTRAST_ROUGH, uRoughness);
  float contrastCenter = mix(CONTRAST_CENTER_POLISHED, CONTRAST_CENTER_ROUGH, uRoughness);
  flowColor = clamp((flowColor - contrastCenter) * contrastMult + contrastCenter, 0.0, 1.0);

  flowColor *= (0.3 + 0.7 * baseReflect);

  float noiseVal = noiseLM(uv * 15.0 + localTime * 0.02);
  flowColor *= (0.9 + noiseVal * 0.2);

  vec3 metalColor = mix(darkBase, flowColor * uBaseColor, 0.9);

  float flowHighlight = max(max(flowBands.r, flowBands.g), flowBands.b);
  float flowPeak = smoothstep(0.8, 0.95, flowHighlight) * baseReflect;
  // The source drove the white peaks off the chroma amount, which couples two
  // unrelated things: dialling the rainbow down to something steel-like also
  // removed every specular band. Separate control.
  metalColor = mix(metalColor, peakWhite, flowPeak * uSheen);

  float colorBalance = (flowBands.r - flowBands.b) * 0.5 + 0.5;
  vec3 tint = mix(COOL_TINT, WARM_TINT, colorBalance);
  metalColor *= mix(vec3(1.0), tint, flowHighlight * 0.3 * uChroma);

  float edgeChroma = smoothstep(0.3, 0.7, flowHighlight) * (1.0 - smoothstep(0.7, 0.95, flowHighlight));
  vec3 chromaColor = mix(CHROMA_BLUE, CHROMA_ORANGE, flowBands.r);
  metalColor += chromaColor * edgeChroma * baseReflect * uChroma * 0.15;

  // Brushed, not polished: a fine grain stretched ALONG the flow axis. Frequency is
  // kept low across the grain and high along it, which is what reads as stainless.
  vec2 brushDir = vec2(cos(uFlowAngle), sin(uFlowAngle));
  vec2 cuv = vec2(uv.x * aspectRatio, uv.y);
  float alongBrush = dot(cuv, brushDir);
  float acrossBrush = dot(cuv, vec2(-brushDir.y, brushDir.x));
  float grain = noiseLM(vec2(acrossBrush * 170.0, alongBrush * 5.0)) * 0.65
              + noiseLM(vec2(acrossBrush * 61.0, alongBrush * 3.0)) * 0.35;
  metalColor *= (1.0 - uBrush) + uBrush * (0.45 + grain * 1.1);

  // Darken just inside the outline so each stroke reads as turning away from the
  // viewer. (The source darkened both ends of the border pipe; a glyph has one.)
  float edgeDark = smoothstep(0.0, 0.2, depth);
  metalColor *= (0.85 + 0.15 * edgeDark);

  float outerRim = exp(-depth * RIM_FALLOFF) * 0.1;
  metalColor += uHighlight * outerRim * baseReflect;

  if (uSpecIntensity > 0.001) {
    float effectiveSpecSize = uSpecSize * (1.0 + uRoughness * 3.0);
    float effectiveSpecIntensity = uSpecIntensity * (1.0 - uRoughness * 0.6);

    vec2 specUV = uSpecular * 0.5 + 0.5;
    vec2 toSpec = uv - specUV;
    toSpec.x *= aspectRatio;

    float specDist = length(toSpec);
    float specFalloff = 1.0 - smoothstep(0.0, effectiveSpecSize, specDist);
    float specSharpness = mix(2.0, 0.8, uRoughness);
    specFalloff = pow(specFalloff, specSharpness);

    float specStrength = specFalloff * effectiveSpecIntensity * cover;
    specStrength *= (0.3 + 0.7 * baseReflect);

    float shimmer = noiseLM(uv * 8.0 + localTime * 0.1) * 0.3 + 0.7;
    specStrength *= shimmer;

    vec3 specColor = uHighlight * SPEC_COLOR_BOOST;
    specColor = mix(specColor, SPEC_WARM_WHITE, 0.3);

    metalColor = mix(metalColor, specColor, clamp(specStrength, 0.0, 1.0));
  }

  vec3 sCurve = metalColor * metalColor * (3.0 - 2.0 * metalColor);
  float sCurveBlend = mix(S_CURVE_POLISHED, 0.0, uRoughness);
  metalColor = mix(metalColor, sCurve, sCurveBlend);

  metalColor = clamp(max(metalColor, darkBase * 0.3), 0.0, 1.0);

  // Premultiplied, matching the canvas context's premultipliedAlpha default, so the
  // page's grey shows through the counters and the antialiased edges cleanly.
  fragColor = vec4(metalColor * cover, cover);
}
`;

// Stainless steel rather than chrome or oil-slick: a cool grey base, banding soft
// enough to read as brushed, and the chroma split pulled well back — the source's
// defaults are tuned for an iridescent border, which on type looks like petrol.
export const STAINLESS = {
  baseColor: [0.82, 0.84, 0.87] as const,
  highlight: [0.98, 0.99, 1.0] as const,
  // The bands slide at localTime * 0.08 * repetition * 2pi radians/sec, so this
  // works out to roughly a 12s cycle — continuously alive but slow enough that you
  // never catch it moving. The source's 0.5 puts that cycle near 38s, which on a
  // static hero is indistinguishable from a still image.
  flowSpeed: 1.6,
  repetition: 2.2,
  distortion: 0.34,
  // Barely any. The source ships 1.0-ish for an iridescent border; anywhere near
  // that turns the lockup into an oil slick rather than metal.
  chroma: 0.16,
  sheen: 0.5,
  flowAngle: 1.28,
  // High-ish, which softens the band edges — brushed rather than mirror-polished.
  roughness: 0.46,
  specIntensity: 0.45,
  specSize: 0.5,
  brush: 0.2,
  /** Bevel width as a fraction of the art's height. The wordmark's stems measure
   *  ~225 of 2365 units, so a hair over half of that lets thin strokes saturate
   *  to a fully round spine while thick ones keep a flat, brushed centre. */
  bevelFrac: 0.052,
};

/** The same material starved of light: greys, silvers and near-black, with the
 *  colour split all but gone. Reached by scrolling off the hero, and left behind
 *  again as the clock settles. Every key here must exist in STAINLESS — `material`
 *  interpolates between the two of them field by field. */
export const GRAPHITE = {
  ...STAINLESS,
  baseColor: [0.30, 0.31, 0.335] as const,
  highlight: [0.70, 0.71, 0.745] as const,
  // Near-zero: what makes it read as graphite rather than steel is the absence of
  // any hue at all, not merely a darker one.
  chroma: 0.03,
  sheen: 0.26,
  // Softer bands and a heavier grain — light scatters instead of reflecting.
  roughness: 0.56,
  brush: 0.26,
  specIntensity: 0.24,
};

const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** Blend of STAINLESS (t=0) and GRAPHITE (t=1). */
export function material(t: number) {
  const k = Math.max(0, Math.min(1, t));
  return {
    baseColor: STAINLESS.baseColor.map((v, i) => mix(v, GRAPHITE.baseColor[i]!, k)),
    highlight: STAINLESS.highlight.map((v, i) => mix(v, GRAPHITE.highlight[i]!, k)),
    flowSpeed: mix(STAINLESS.flowSpeed, GRAPHITE.flowSpeed, k),
    repetition: mix(STAINLESS.repetition, GRAPHITE.repetition, k),
    distortion: mix(STAINLESS.distortion, GRAPHITE.distortion, k),
    chroma: mix(STAINLESS.chroma, GRAPHITE.chroma, k),
    sheen: mix(STAINLESS.sheen, GRAPHITE.sheen, k),
    flowAngle: mix(STAINLESS.flowAngle, GRAPHITE.flowAngle, k),
    roughness: mix(STAINLESS.roughness, GRAPHITE.roughness, k),
    specIntensity: mix(STAINLESS.specIntensity, GRAPHITE.specIntensity, k),
    specSize: mix(STAINLESS.specSize, GRAPHITE.specSize, k),
    brush: mix(STAINLESS.brush, GRAPHITE.brush, k),
  };
}
