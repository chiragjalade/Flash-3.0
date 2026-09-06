// Builds the texture that drives the hero's liquid-metal shader.
//
// The shader needs two things per pixel, and only one of them is in the artwork:
//
//   .r  coverage  — the lockup's antialiased alpha, straight from the rasteriser
//   .g  depth     — how far inside a letterform this pixel is, 0 at the outline
//                   and 1 at the spine, which is what the bevel/Fresnel is built on
//
// Depth is a distance transform. It has to be a real euclidean one: the cheap
// approximations (a blurred alpha, or a chamfer/Manhattan pass) put visible
// creases along diagonal stems and corners, and on type at hero size those read as
// dents in the metal. So this uses Felzenszwalb & Huttenlocher's exact algorithm —
// two O(n) passes of a 1-D lower-envelope scan, which is fast enough to rerun on
// every resize without a worker.

const INF = 1e20;

// Exact squared EDT of one row/column. `f` is the input cost (0 = seed), `d` the
// output; `v` and `z` are the parabola hull and its breakpoints, reused across
// calls so a full transform allocates nothing per line.
function edt1d(
  f: Float64Array,
  d: Float64Array,
  v: Int32Array,
  z: Float64Array,
  n: number,
) {
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  let k = 0;
  for (let q = 1; q < n; q++) {
    const fq = f[q]! + q * q;
    let vk = v[k]!;
    let s = (fq - (f[vk]! + vk * vk)) / (2 * q - 2 * vk);
    while (s <= z[k]!) {
      k--;
      vk = v[k]!;
      s = (fq - (f[vk]! + vk * vk)) / (2 * q - 2 * vk);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1]! < q) k++;
    const vk = v[k]!;
    const dq = q - vk;
    d[q] = dq * dq + f[vk]!;
  }
}

// In-place squared EDT of a w x h grid: columns first, then rows.
function edt2d(grid: Float64Array, w: number, h: number) {
  const n = Math.max(w, h);
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);

  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = grid[y * w + x]!;
    edt1d(f, d, v, z, h);
    for (let y = 0; y < h; y++) grid[y * w + x] = d[y]!;
  }
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) f[x] = grid[row + x]!;
    edt1d(f, d, v, z, w);
    for (let x = 0; x < w; x++) grid[row + x] = d[x]!;
  }
}

/**
 * Rasterise `art` at w x h and pack coverage + bevel depth into one RGBA texture.
 *
 * `bevelPx` is the distance over which depth ramps 0 -> 1. Anything deeper than
 * that saturates, so a stroke thicker than 2 * bevelPx keeps a flat centre (a
 * brushed face) while a thinner one rounds over completely.
 *
 * The art must be drawn with enough transparent padding around it that no ink
 * touches the canvas edge — the transform seeds on background pixels, so ink at
 * the boundary has nothing to measure against and its bevel flattens. The lockup
 * SVG carries that padding in its own viewBox.
 */
export function buildHeroMask(
  art: CanvasImageSource,
  w: number,
  h: number,
  bevelPx: number,
): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("hero mask: no 2d context");

  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(art, 0, 0, w, h);

  const src = ctx.getImageData(0, 0, w, h).data;
  const n = w * h;

  const grid = new Float64Array(n);
  for (let i = 0; i < n; i++) grid[i] = src[i * 4 + 3]! > 127 ? INF : 0;
  edt2d(grid, w, h);

  const out = ctx.createImageData(w, h);
  const dst = out.data;
  const inv = 1 / Math.max(bevelPx, 1);
  for (let i = 0; i < n; i++) {
    const depth = Math.min(1, Math.sqrt(grid[i]!) * inv);
    const o = i * 4;
    dst[o] = src[o + 3]!; // coverage
    dst[o + 1] = (depth * 255) | 0; // bevel depth
    dst[o + 2] = 0;
    dst[o + 3] = 255;
  }
  return out;
}
