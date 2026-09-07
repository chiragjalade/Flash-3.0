// The turbulence field the dial's morph is thresholded against — baked once, in
// JavaScript, and read by both sides of the effect.
//
// It has to be ONE field, not two matching ones. The shader decides where the
// photograph has arrived; the numerals and hands have to change colour exactly
// where it has, and a numeral turning silver over a patch of dial the image has not
// reached yet is the one mistake that would give the whole thing away. Computing the
// same noise twice — once in GLSL, once here — does not survive that test: the
// hashes are built out of fract() of large products, the GPU evaluates them at
// float32 and this file at float64, and the fractional parts diverge completely
// after the first octave. So it is generated here, uploaded as a texture for the
// shader to sample, and read back out of the same array for the stagger.
//
// That also means the field cannot drift with time the way it first did: a moving
// field would need the element colours recomputed every frame to stay matched. It is
// static, and the transition is short and scroll-driven, so nothing is lost.

export const FIELD_SIZE = 384;

/**
 * Three independent fields, packed one per colour channel.
 *
 * They have to be independent or the handover replays the arrival: thresholding the
 * SAME field twice makes the picture leave through exactly the tendrils it came in
 * through, in the same order, which reads as the animation running again rather than
 * as something new happening. Inverting it for the third — which is what this did at
 * first — is not enough either; a photographic negative of a pattern is still
 * recognisably that pattern.
 *
 * Packed into channels rather than baked as three textures because they are sampled
 * at the same coordinate in the same draw: one fetch, three fields.
 */
export const FIELD_CHANNELS = 3;

// Where each channel starts in the noise domain. Far enough apart that no two share
// any structure — the noise repeats on no scale, but neighbouring windows of it
// still rhyme.
const CHANNEL_ORIGIN = [0, 37.1, 91.7];

// Domain units across the dial. Sets the size of the tendrils: lower and the image
// arrives in a few broad tongues, higher and it dissolves in as noise.
const FIELD_SCALE = 2.6;

const fract = (x: number) => x - Math.floor(x);

function hash21(x: number, y: number): number {
  let px = fract(x * 123.34);
  let py = fract(y * 456.21);
  const d = px * (px + 34.56) + py * (py + 34.56);
  px += d;
  py += d;
  return fract(px * py);
}

function noise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  let fx = x - ix;
  let fy = y - iy;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  const a = hash21(ix, iy);
  const b = hash21(ix + 1, iy);
  const c = hash21(ix, iy + 1);
  const d = hash21(ix + 1, iy + 1);
  return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy;
}

// Turbulence, not plain fBm: the absolute value creases the field at every zero
// crossing and those creases survive the octave sum as filaments. Lacunarity is
// 2.03 rather than 2 because an exact doubling lines every octave's grid up with
// the last and the creases stack into visible horizontals and verticals.
function turbulence(x: number, y: number): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  for (let i = 0; i < 5; i++) {
    sum += amp * Math.abs(noise(x, y) * 2 - 1);
    norm += amp;
    x *= 2.03;
    y *= 2.03;
    amp *= 0.5;
  }
  return sum / norm;
}

const smoothstep = (e0: number, e1: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

let cache: Uint8Array | null = null;

/**
 * The field as one byte per texel, row 0 at the BOTTOM — the orientation a WebGL
 * texture is sampled in, so it can be uploaded without a flip and read back here
 * with the same coordinates the shader uses.
 */
export function dialField(): Uint8Array {
  if (cache) return cache;
  const count = FIELD_SIZE * FIELD_SIZE;
  const data = new Uint8Array(count * FIELD_CHANNELS);

  for (let c = 0; c < FIELD_CHANNELS; c++) {
    const o = CHANNEL_ORIGIN[c]!;
    const raw = new Float32Array(count);
    let sum = 0;
    for (let row = 0; row < FIELD_SIZE; row++) {
      for (let col = 0; col < FIELD_SIZE; col++) {
        const u = (col / (FIELD_SIZE - 1)) * FIELD_SCALE;
        const v = (row / (FIELD_SIZE - 1)) * FIELD_SCALE;
        const t = turbulence(u + o, v + o);
        raw[row * FIELD_SIZE + col] = t;
        sum += t;
      }
    }

    // Normalised against the channel's OWN distribution rather than against fixed
    // bounds. Turbulence clusters around a third of its range and each window of it
    // clusters somewhere slightly different — the three came out centred on 0.48,
    // 0.51 and 0.62 with fixed bounds, which would have made the same scroll
    // distance dissolve at three different rates and the last one feel back-loaded.
    // Centring each on its own mean and spreading it by its own deviation makes the
    // three look unrelated and behave identically.
    const mean = sum / count;
    let varSum = 0;
    for (let i = 0; i < count; i++) {
      const d = raw[i]! - mean;
      varSum += d * d;
    }
    const sd = Math.sqrt(varSum / count) || 1;
    const lo = mean - 1.35 * sd;
    const hi = mean + 1.35 * sd;
    for (let i = 0; i < count; i++) {
      data[i * FIELD_CHANNELS + c] = Math.round(smoothstep(lo, hi, raw[i]!) * 255);
    }
  }
  cache = data;
  return data;
}

/**
 * The field at one point, 0 to 1, bilinear — the same value the shader gets there.
 * `u` and `v` are 0..1 across the dial with v = 0 at the BOTTOM.
 */
export function fieldAt(u: number, v: number): number {
  const data = dialField();
  const x = Math.min(1, Math.max(0, u)) * (FIELD_SIZE - 1);
  const y = Math.min(1, Math.max(0, v)) * (FIELD_SIZE - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(FIELD_SIZE - 1, x0 + 1);
  const y1 = Math.min(FIELD_SIZE - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  // Channel 0 only: the stagger has to match the field the FIRST morph is
  // thresholded against, which is the red one.
  const at = (cx: number, cy: number) =>
    (data[(cy * FIELD_SIZE + cx) * FIELD_CHANNELS] ?? 0) / 255;
  const top = at(x0, y0) + (at(x1, y0) - at(x0, y0)) * fx;
  const bot = at(x0, y1) + (at(x1, y1) - at(x0, y1)) * fx;
  return top + (bot - top) * fy;
}

/** Half-width of the band between "still dial" and "now photograph". Shared with
 *  the shader and with the colour stagger in Clock.css, so all three agree. */
export const FIELD_EDGE = 0.18;

let url: string | null = null;

/**
 * The same field as a greyscale PNG data URL, for the SVG filter that dissolves a
 * whole clock. Built from the identical bytes the shader samples, so the clock and
 * its dial come apart on the same noise rather than on two that merely look alike.
 */
export function fieldDataURL(): string {
  if (url) return url;
  const canvas = document.createElement("canvas");
  canvas.width = FIELD_SIZE;
  canvas.height = FIELD_SIZE;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(FIELD_SIZE, FIELD_SIZE);
  const field = dialField();
  for (let i = 0; i < FIELD_SIZE * FIELD_SIZE; i++) {
    const v = field[i * FIELD_CHANNELS]!;
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  url = canvas.toDataURL("image/png");
  return url;
}
