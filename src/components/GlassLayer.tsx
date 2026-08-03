import { useEffect, useRef } from "react";
import type { LConfig } from "../glassParams";
import "./GlassLayer.css";

// Full-theme WebGL glass for Liquid Glass Pro. Renders the background photo plus
// a smooth-min union of a rounded-rect for EVERY glass element (tracked live via
// getBoundingClientRect), so overlapping elements — e.g. the dragged clock over
// a card — fuse seamlessly with refraction/dispersion/fresnel/glare. DOM content
// stays crisp on top; the elements' own CSS glass is stripped (see liquid-glass.css).

const MAX = 32;

// The app's main glass surfaces become WebGL liquid glass on hover (plus any
// element manually tagged `.lg-glass`). Must stay in sync with the enhanced-
// surface selector list in liquid-glass.css.
const SELECTOR =
  ".lg-glass, .prompt, .rdesk-card, .rdesk__spot-card, .rdesk__news-card, " +
  ".wl-results, .wl-followed__card, .wl-searchbox, .clock-widget__card, .clock-widget__mini, .theme-pop, " +
  // answer text card + chart cards + action buttons → real WebGL glass that fuses/necks
  ".msg__content, .skel--chart, .msg__act, " +
  // user-sent bubble → WebGL glass too (standalone, not mergeable)
  ".msg__bubble";

const VERT = `#version 300 es
void main(){
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
out vec4 o;
uniform vec2 u_res;
uniform sampler2D u_bg;
uniform vec2 u_bgSize;
uniform vec4 u_rects[${MAX}];   // xy=center(px, GL), zw=half-size(px)
uniform float u_radius[${MAX}];
uniform float u_act[${MAX}];    // per-element activation 0..1 (fade in/out)
uniform float u_merge[${MAX}];  // 1 = mergeable (moving element), 0 = static
uniform int u_count;
uniform float u_k, u_refract, u_disp, u_fres, u_glare, u_angle, u_blur;
uniform float u_kClock;  // merge reach between the two clock elements (card ↔ button)
uniform vec2 u_cursor;   // cursor position (GL px, y-up)
uniform float u_curi;    // cursor-glare intensity 0..1 (eased in/out)
uniform float u_spot;    // radius (px) of the soft glow pooled under the cursor
uniform float u_bgBlur;  // blur radius (px) for the exposed background photo (0 = sharp)
uniform float u_bgZoom;  // default magnification of the background photo (>1)
uniform vec2 u_bgOffset; // parallax offset (uv), eased from the content scroll

float smin(float a, float b, float k){
  if(k <= 0.0) return min(a,b);
  float h = clamp(0.5 + 0.5*(b-a)/k, 0.0, 1.0);
  return mix(b, a, h) - k*h*(1.0-h);
}
float sdBox(vec2 p, vec2 b, float r){
  vec2 q = abs(p) - b + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}
float scene(vec2 p){
  // Static surfaces union with a HARD min (never fuse with each other), while
  // mergeable (moving) elements smooth-union with the static field — so a dragged
  // element grows a liquid neck toward whatever it approaches, but the static
  // card list stays crisply separated.
  float dS = 1e9; // static shapes
  float dA = 1e9; // mergeable (moving) shapes
  for(int i=0;i<${MAX};i++){
    if(i >= u_count) break;
    vec4 R = u_rects[i];
    float di = sdBox(p - R.xy, R.zw, u_radius[i]);
    // mergeable shapes smooth-union with EACH OTHER (the clock card ↔ button neck)
    // at their own reach u_kClock; then the whole mergeable group smooth-unions
    // with the static field at the general reach u_k. Statics hard-union.
    if(u_merge[i] > 0.5) dA = smin(dA, di, u_kClock);
    else dS = min(dS, di);
  }
  return smin(dS, dA, u_k);
}
// activation of the nearest element (drives the glass fade in/out)
float activationAt(vec2 p){
  float best = 1e9, a = 0.0;
  for(int i=0;i<${MAX};i++){
    if(i >= u_count) break;
    vec4 R = u_rects[i];
    float di = sdBox(p - R.xy, R.zw, u_radius[i]);
    if(di < best){ best = di; a = u_act[i]; }
  }
  return a;
}
vec2 nrm(vec2 p){
  vec2 e = vec2(1.5, 0.0);
  return normalize(vec2(
    scene(p+e.xy) - scene(p-e.xy),
    scene(p+e.yx) - scene(p-e.yx)
  ) + 1e-6);
}
vec2 bguv(vec2 f){
  vec2 uv = f / u_res;
  // background-size: cover
  vec2 r = vec2(
    min((u_res.x/u_res.y) / (u_bgSize.x/u_bgSize.y), 1.0),
    min((u_res.y/u_res.x) / (u_bgSize.y/u_bgSize.x), 1.0)
  );
  uv = uv * r + (1.0 - r) * 0.5;
  uv.y = 1.0 - uv.y;
  // default zoom (magnify around centre) + parallax offset driven by scroll
  uv = (uv - 0.5) / u_bgZoom + 0.5 + u_bgOffset;
  return uv;
}
// Smooth disk blur: 16-tap Vogel (golden-angle) spiral instead of a 3x3 box, so
// a large blur radius reads as real frost rather than 9 ghosted copies (banding).
vec3 sampleBg(vec2 uv, float blur){
  vec3 c = texture(u_bg, uv).rgb;
  if(blur < 0.5) return c;
  const float GA = 2.399963322; // golden angle (rad)
  const float TAPS = 32.0;
  float total = 1.0;
  for(int i=0;i<32;i++){
    float fi = float(i) + 0.5;
    float rr = sqrt(fi / TAPS) * blur;   // even area coverage over the disk
    float a = fi * GA;
    c += texture(u_bg, uv + vec2(cos(a), sin(a)) * rr / u_res).rgb;
    total += 1.0;
  }
  return c / total;
}
void main(){
  vec2 f = gl_FragCoord.xy;
  // Background photo — optionally frosted (u_bgBlur) so a busy wallpaper calms
  // down behind the chat conversation, while the glass surfaces stay sharp.
  vec3 photo = sampleBg(bguv(f), u_bgBlur);
  float d = scene(f);
  if(d > 2.0){ o = vec4(photo, 1.0); return; } // outside all glass → plain bg
  float act = clamp(activationAt(f), 0.0, 1.0);

  vec2 n = nrm(f);
  // edge factor: ~0 across the flat interior, rising to 1 at the rounded rim
  float ef = pow(clamp(1.0 + d/34.0, 0.0, 1.0), 1.6);
  vec2 base = bguv(f);
  // Refraction ONLY near the rim (ef→1 at the edge). The flat interior has zero
  // warp — it shows the blurred backdrop straight — so the high-frequency photo
  // (trees/mountains) can't alias into banding across the pane.
  vec2 offuv = (n * u_refract * ef * 22.0) / u_res;
  // Chromatic dispersion confined to the rim (ef^2) so the centre stays colour-
  // clean instead of rainbow-banding the whole pane.
  float dispA = u_disp * ef * ef;
  // Frost the bent rim harder than the flat body: the refracted edge samples the
  // backdrop far offset, so the blur must scale WITH the refraction to fully melt
  // the sharp photo away (otherwise it reads as thin lines along the contour).
  float rimBlur = u_blur + ef * (6.0 + u_refract * 8.0);

  vec3 g;
  g.r = sampleBg(base + offuv * (1.0 + dispA), rimBlur).r;
  g.g = sampleBg(base + offuv, rimBlur).g;
  g.b = sampleBg(base + offuv * (1.0 - dispA), rimBlur).b;

  // Crisp bright rim outline. It follows the sharp SDF (not the blurred backdrop),
  // so every shape AND the merged neck get a defined glass edge like the reference,
  // regardless of how frosted the body is.
  float fr = pow(clamp(1.0 + d/6.0, 0.0, 1.0), 3.0);
  g = mix(g, vec3(1.0), clamp(fr * (0.45 + u_fres * 0.8), 0.0, 0.95));

  vec2 gd = vec2(cos(u_angle), sin(u_angle));
  // static directional sheen — a broad glare band, not a crisp edge line
  float gl = pow(clamp(dot(n, gd)*0.5 + 0.5, 0.0, 1.0), 3.0) * ef * u_glare;
  g += vec3(gl * 0.5);

  // Cursor-following edge light: the rim segment facing the cursor lights up and
  // sweeps as the pointer moves; a proximity falloff keeps it on the element
  // under the cursor. u_curi eases the whole thing in/out on enter/leave.
  vec2 toCur = u_cursor - f;
  float cdist = length(toCur);
  vec2 cdir = toCur / max(cdist, 1.0);
  float prox = 1.0 - smoothstep(0.0, min(u_res.x, u_res.y) * 0.4, cdist);
  float rimLight = pow(clamp(dot(n, cdir), 0.0, 1.0), 4.0) * ef;
  g += vec3(rimLight * prox * u_curi * 0.85);   // moving specular streak on the rim
  // Localized soft glow pooled right under the cursor — a small bright spot on the
  // glass BODY (independent of the rim), so the hovered card lights up where the
  // mouse is, not only along its edges.
  float spot = 1.0 - smoothstep(0.0, u_spot, cdist);
  g = mix(g, vec3(1.0), spot * spot * u_curi * 0.13);

  // light frost fill, tinted a very subtle cool blue (kept low so the glass reads
  // clear enough to see refraction + the merged neck, not milky/opaque)
  g = mix(g, vec3(0.82, 0.89, 1.0), 0.09);

  float inside = (1.0 - smoothstep(-2.0, 2.0, d)) * act; // softer AA on the contour
  o = vec4(clamp(mix(photo, g, inside), 0.0, 1.0), 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS))
    console.warn("[glass] shader:", gl.getShaderInfoLog(sh));
  return sh;
}

// cubic-bezier(x1,y1,x2,y2) → progress remap (Newton-solved), for the load sweep.
function makeBezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1,
    bx = 3 * (x2 - x1) - cx,
    ax = 1 - cx - bx;
  const cy = 3 * y1,
    by = 3 * (y2 - y1) - cy,
    ay = 1 - cy - by;
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sy = (t: number) => ((ay * t + by) * t + cy) * t;
  return (x: number) => {
    let t = x;
    for (let i = 0; i < 5; i++) {
      const d = (3 * ax * t + 2 * bx) * t + cx;
      if (Math.abs(d) < 1e-6) break;
      t -= (sx(t) - x) / d;
    }
    return sy(Math.max(0, Math.min(1, t)));
  };
}
// accelerate out, then a long smooth deceleration into the end (gentle ends)
const sweepEase = makeBezier(0.37, 0, 0.18, 1);

export default function GlassLayer({ config }: { config: LConfig }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const configRef = useRef(config);
  configRef.current = config;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl2", { alpha: false });
    if (!gl) {
      console.warn("[glass] WebGL2 unavailable — falling back to CSS glass");
      return;
    }
    // signal CSS to strip the DOM glass (only while this layer is live)
    document.documentElement.setAttribute("data-glass-webgl", "on");

    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    gl.useProgram(prog);
    const U = (n: string) => gl.getUniformLocation(prog, n);
    const uRes = U("u_res"), uBgSize = U("u_bgSize"), uRects = U("u_rects"),
      uRadius = U("u_radius"), uAct = U("u_act"), uMerge = U("u_merge"),
      uCount = U("u_count"), uK = U("u_k"), uKClock = U("u_kClock"),
      uRefract = U("u_refract"), uDisp = U("u_disp"), uFres = U("u_fres"),
      uGlare = U("u_glare"), uAngle = U("u_angle"), uBlur = U("u_blur"),
      uCursor = U("u_cursor"), uCuri = U("u_curi"), uSpot = U("u_spot"),
      uBgBlur = U("u_bgBlur"), uBgZoom = U("u_bgZoom"),
      uBgOffset = U("u_bgOffset");

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([44, 52, 68, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    let bgW = 1, bgH = 1;
    const img = new Image();
    img.onload = () => {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      // Mipmaps (WebGL2 allows them on NPOT textures): where the rim refraction
      // compresses the photo, trilinear sampling drops to a coarser level
      // instead of aliasing the high-frequency detail into banding.
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      bgW = img.naturalWidth;
      bgH = img.naturalHeight;
    };
    img.src = "/images/img2.jpg";

    // Every glass surface is liquid glass, always — one constant look, not gated
    // on hover. `active` tracks which elements currently have their CSS stripped
    // (`.lg-webgl-active`) so the WebGL glass shows through them.
    const active = new Set<HTMLElement>();

    // Cursor tracking → the shader's moving edge light / glare. `target` is the
    // raw pointer; `cur` is the eased position + intensity used each frame so the
    // glare glides toward the cursor and fades in/out on enter/leave.
    const target = { x: 0, y: 0, on: false };
    const cur = { x: 0, y: 0, i: 0 };
    // One-time auto glare sweep on load: a virtual cursor glides horizontally
    // across the prompt/desk band so the edge glare sweeps the glass once. Any
    // real pointer move cancels it.
    let sweepActive = true;
    const sweepStart = performance.now() + 1500; // 1.5s delay after load
    const SWEEP_DUR = 1550;
    const onPointerMove = (e: PointerEvent) => {
      target.x = e.clientX;
      target.y = e.clientY;
      target.on = true;
      // Only let an ACTIVE move (once the sweep has started) take over — an
      // incidental cursor move during the delay must not cancel the load sweep.
      if (sweepActive && performance.now() >= sweepStart) sweepActive = false;
    };
    const onPointerLeave = () => {
      target.on = false;
    };
    document.addEventListener("pointermove", onPointerMove, { passive: true });
    document.addEventListener("pointerleave", onPointerLeave);
    window.addEventListener("blur", onPointerLeave);

    let dpr = 1;
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = window.innerWidth + "px";
      canvas.style.height = window.innerHeight + "px";
    };
    resize();
    window.addEventListener("resize", resize);

    const rects = new Float32Array(MAX * 4);
    const radii = new Float32Array(MAX);
    const acts = new Float32Array(MAX);
    const merge = new Float32Array(MAX);
    // Only the movable element(s) merge — the draggable clock. Everything else is
    // static and keeps hard, separate edges. Add selectors here for any other
    // element that should grow a liquid neck as it approaches its neighbours.
    const MERGE_SELECTOR =
      ".clock-widget__card, .clock-widget__mini, .msg__content, .skel--chart, .msg__act";
    let raf = 0;
    let bgBlur = 0; // eased background-photo frost (px); ramps in the chat convo
    // Parallax: the photo is zoomed BG_ZOOM by default, and slowly drifts (a
    // fraction of the content scroll, eased) within the headroom the zoom gives —
    // so it moves with the UI but much slower than the content.
    const BG_ZOOM = 1.12;
    const bgOff = { x: 0, y: 0 };
    const render = () => {
      const c = configRef.current ?? {};
      const n = (k: string) => Number(c[k] ?? 0);
      const H = window.innerHeight;

      // Collect every visible glass surface this frame (constant, not hover-gated,
      // re-read live so the glass stays glued to elements as they move/resize).
      const els: HTMLElement[] = [];
      const boxes: DOMRect[] = [];
      const opac: number[] = [];
      const radii2: number[] = [];
      for (const node of document.querySelectorAll<HTMLElement>(SELECTOR)) {
        const b = node.getBoundingClientRect();
        if (b.width < 1 || b.height < 1) continue; // skip hidden/collapsed
        const cs = getComputedStyle(node);
        const op = parseFloat(cs.opacity) || 0;
        if (op < 0.04) continue; // (near-)invisible → not glass; it fades in via opacity
        els.push(node);
        boxes.push(b);
        opac.push(op);
        radii2.push(parseFloat(cs.borderTopLeftRadius) || 8);
        if (els.length >= MAX) break;
      }
      // Strip the CSS on the current set so the WebGL glass shows through;
      // restore it on any element that has left the set.
      for (const el of els)
        if (!active.has(el)) {
          el.classList.add("lg-webgl-active");
          active.add(el);
        }
      for (const el of [...active])
        if (!els.includes(el)) {
          el.classList.remove("lg-webgl-active");
          active.delete(el);
        }

      for (let i = 0; i < els.length; i++) {
        const b = boxes[i]!;
        rects[i * 4] = (b.left + b.width / 2) * dpr;
        rects[i * 4 + 1] = (H - (b.top + b.height / 2)) * dpr;
        rects[i * 4 + 2] = (b.width / 2) * dpr;
        rects[i * 4 + 3] = (b.height / 2) * dpr;
        radii[i] = Math.min(radii2[i]!, b.width / 2, b.height / 2) * dpr;
        acts[i] = opac[i]!; // glass fades in/out with the element's opacity
        // The clock elements are always mergeable, so the clock smooth-unions with
        // the other glass components (prompt/cards) at the general reach u_k. The
        // clock↔button pair uses u_kClock, which is dropped to 0 (→ hard min, no
        // bulge) at rest and only raised while the clock is moving (see below).
        merge[i] = els[i]!.matches(MERGE_SELECTOR) ? 1 : 0;
      }

      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(prog);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform2f(uBgSize, bgW, bgH);
      gl.uniform4fv(uRects, rects);
      gl.uniform1fv(uRadius, radii);
      gl.uniform1fv(uAct, acts);
      gl.uniform1fv(uMerge, merge);
      gl.uniform1i(uCount, els.length);
      gl.uniform1f(uK, n("mergeRate") * 560 * dpr); // general merge reach (Merge Rate slider)
      // clock card ↔ button neck: 0.05 everywhere (moving, dragging near the
      // button, resting out) EXCEPT when the clock is settled INSIDE the button
      // (coincident) — there it drops to 0 (hard min) so the button doesn't bulge.
      const seatedIn = !!document.querySelector(
        ".clock-widget--in:not(.clock-widget--merging)",
      );
      gl.uniform1f(uKClock, (seatedIn ? 0 : 0.026) * 560 * dpr);
      gl.uniform1f(uRefract, n("refractionFactor"));
      gl.uniform1f(uDisp, n("dispersionGain") * 0.06);
      gl.uniform1f(uFres, n("fresnelIntensity") / 100);
      gl.uniform1f(uGlare, n("glareIntensity") / 100);
      gl.uniform1f(uAngle, (n("glareAngle") * Math.PI) / 180);
      gl.uniform1f(uBlur, Math.max(n("blurRadius"), 10) * dpr); // glass component's own frost (a bit more)
      // One-time auto glare sweep, else the normal cursor easing.
      let sweeping = false;
      if (sweepActive) {
        const p = (performance.now() - sweepStart) / SWEEP_DUR;
        if (p >= 1) sweepActive = false;
        else if (p >= 0) {
          sweeping = true;
          const W = window.innerWidth;
          const x0 = W * 0.16;
          const x1 = W * 0.74; // sweep across the chat/desk band (left → right)
          const e = sweepEase(p); // cubic-bezier: accelerate, then slow at the end
          cur.x = x0 + (x1 - x0) * e;
          cur.y = H * 0.52; // between the prompt box and the research desk
          cur.i = Math.sin(Math.PI * p); // glare fades in, peaks, fades out
        }
      }
      if (!sweeping) {
        // Ease the cursor toward the pointer (snap on first move to avoid a sweep
        // in from the corner); fade intensity in/out on enter/leave.
        if (target.on && cur.i < 0.01) {
          cur.x = target.x;
          cur.y = target.y;
        }
        cur.x += (target.x - cur.x) * 0.25;
        cur.y += (target.y - cur.y) * 0.25;
        cur.i += ((target.on ? 1 : 0) - cur.i) * 0.15;
      }
      gl.uniform2f(uCursor, cur.x * dpr, (H - cur.y) * dpr);
      gl.uniform1f(uCuri, cur.i);
      gl.uniform1f(uSpot, 130 * dpr); // ~130 CSS px soft glow under the cursor
      // Frost the background photo while the chat conversation is open (class set
      // by ChatPanel), eased in/out. Glass surfaces are unaffected.
      const bgTarget = document.documentElement.classList.contains("chat-bg-blur")
        ? 22
        : 0;
      bgBlur += (bgTarget - bgBlur) * 0.08;
      gl.uniform1f(uBgBlur, bgBlur * dpr);
      // Parallax offset from whichever content area is scrolling. Clamp to the
      // headroom the zoom provides so the photo edges never slide into view, and
      // ease it (slow follow) so it drifts gently behind the faster UI.
      const sc =
        document.querySelector<HTMLElement>(".chat__convo") ??
        document.querySelector<HTMLElement>(".chat__desk-scroll");
      const maxOff = (BG_ZOOM - 1) / (2 * BG_ZOOM);
      // Only drift within a fraction of the zoom headroom → keeps the parallax
      // subtle (the photo barely shifts, well short of revealing its edges).
      const travel = maxOff * 0.4;
      const clampOff = (v: number) => Math.max(-travel, Math.min(travel, v));
      // Speed scales to the content length: the photo drifts across its `travel`
      // range over the whole scrollable range, so a longer thread → slower drift
      // per pixel. A minimum-speed floor keeps very long threads from parallaxing
      // imperceptibly slowly.
      const MIN_SPEED = 0.00002; // uv per scrolled px (very gentle)
      const maxScrollY = Math.max(1, (sc?.scrollHeight ?? 0) - (sc?.clientHeight ?? 0));
      const maxScrollX = Math.max(1, (sc?.scrollWidth ?? 0) - (sc?.clientWidth ?? 0));
      const speedY = Math.max(travel / maxScrollY, MIN_SPEED);
      const speedX = Math.max(travel / maxScrollX, MIN_SPEED);
      const tX = clampOff((sc?.scrollLeft ?? 0) * speedX);
      const tY = clampOff((sc?.scrollTop ?? 0) * speedY);
      bgOff.x += (tX - bgOff.x) * 0.06;
      bgOff.y += (tY - bgOff.y) * 0.06;
      gl.uniform1f(uBgZoom, BG_ZOOM);
      gl.uniform2f(uBgOffset, bgOff.x, bgOff.y);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      raf = requestAnimationFrame(render);
    };
    render();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener("blur", onPointerLeave);
      active.forEach((el) => el.classList.remove("lg-webgl-active"));
      document.documentElement.removeAttribute("data-glass-webgl");
      gl.deleteProgram(prog);
      gl.deleteTexture(tex);
    };
  }, []);

  return <canvas ref={canvasRef} className="glass-layer" />;
}
