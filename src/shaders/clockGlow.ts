// Specular glow on the clock's crystal.
//
// Not a painted gradient: the dome's geometry is reconstructed per pixel and lit by
// a point light at the cursor. R below is the same curvature the refraction map was
// generated from (see the script that writes clock-refract.png), so the highlight
// bends over exactly the surface the dial is being refracted through — the two
// would drift apart if either number changed alone.
//
// Blinn-Phong with two lobes: a tight one for the hot core, a wide one for the
// bloom around it. Both are gated by a Fresnel term, which is what puts most of the
// light at the rim and almost none of it head-on — the single most recognisable
// thing about glass.

export const GLOW_VERT = /* glsl */ `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  vUv.y = 1.0 - vUv.y; // y down, so it matches the pointer coordinates
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

export const GLOW_FRAG = /* glsl */ `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform vec2 uLight;   // light position, -1..1 across the dial
uniform float uHover;  // 0 at rest, 1 with the pointer on the clock
uniform float uTime;

const float R = 1.08;      // dome curvature, in units of the dial radius
const float LIGHT_Z = 1.2; // how far the light floats above the crystal

void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) {
    fragColor = vec4(0.0);
    return;
  }

  // Surface point and normal on the spherical cap.
  float rr = min(r, 0.9995);
  float k = sqrt(R * R - rr * rr);
  float h = k - sqrt(R * R - 1.0);
  float slope = rr / k;
  vec2 dir = r > 1e-5 ? p / r : vec2(0.0);
  // The cap bulges TOWARD the viewer, so height falls off with radius and the
  // normal tilts outward: n = (-dh/dx, -dh/dy, 1) with dh/dr negative, which is
  // +dir * slope. Flipping this sign models a dish instead of a dome, and the
  // giveaway is that the highlight appears on the side away from the light.
  vec3 n = normalize(vec3(dir * slope, 1.0));

  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 P = vec3(p, h);
  vec3 L = normalize(vec3(uLight, LIGHT_Z) - P);
  vec3 H = normalize(L + V);
  float ndh = max(dot(n, H), 0.0);

  float core = pow(ndh, 260.0);
  float bloom = pow(ndh, 13.0);

  // Schlick: glass reflects ~4% head-on and nearly everything at a grazing angle.
  float fres = 0.04 + 0.96 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
  float rim = smoothstep(0.87, 1.0, r);

  float g = core * 0.85 + bloom * 0.13;
  g *= 0.30 + 0.70 * fres + rim * 0.45;

  // A slow breath, so the glass is never completely inert.
  g *= 0.94 + 0.06 * sin(uTime * 0.6);

  // Feather the last sliver so the disc doesn't cut against the bezel.
  g *= smoothstep(1.0, 0.982, r);

  // Present but faint at rest; the pointer brings it up.
  float a = clamp(g, 0.0, 1.0) * (0.16 + 0.84 * uHover);
  fragColor = vec4(vec3(a), a); // premultiplied white
}
`;
