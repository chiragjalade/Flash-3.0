import { useEffect, useRef, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { buildHeroMask } from "../lib/heroMask";
import { HERO_FRAG, HERO_VERT, STAINLESS, material } from "../shaders/liquidMetal";
import "./MetalSurface.css";

// Retina is worth it on metal — the banding is high-frequency — but past 2x the
// fragment count stops buying anything a viewer can see.
const MAX_DPR = 2;

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`metal shader: ${log}`);
  }
  return sh;
}

type Props = {
  /** Flat-black SVG whose alpha is the shape. Must carry transparent padding — see buildHeroMask. */
  src: string;
  /** The artwork's share of the padded SVG's height. bevelFrac is defined against the ARTWORK. */
  artHeightShare: number;
  bevelFrac?: number;
  /** Let the pointer drive the specular while it is over this surface. */
  trackPointer?: boolean;
  /**
   * Live 0..1 blend from STAINLESS to GRAPHITE, read every frame. A ref rather
   * than a value because it is driven by scroll — passing it as a prop would mean
   * a React render per frame.
   */
  toneRef?: { current: number } | null;
  /**
   * Live 0..1 blend toward OCEAN, applied on top of whatever `toneRef` produced.
   * Also a ref: it is driven by the same scroll.
   */
  alloyRef?: { current: number } | null;
  children?: ReactNode;
} & Omit<ComponentPropsWithoutRef<"div">, "children">;

/**
 * Any shape, filled with the liquid-metal shader.
 *
 * Renders its own canvas and owns a WebGL2 context. On failure — no WebGL2, a
 * blocked context, a shader that won't compile, artwork that won't load — it sets
 * `data-metal="off"` on the host and leaves the CSS to draw a static fallback,
 * rather than leaving a hole in the page.
 */
export default function MetalSurface({
  src,
  artHeightShare,
  bevelFrac = STAINLESS.bevelFrac,
  trackPointer = true,
  toneRef = null,
  alloyRef = null,
  children,
  ...divProps
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;

    const gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: false, // coverage comes from the mask, not from MSAA
      depth: false,
      stencil: false,
      powerPreference: "low-power",
    });
    if (!gl) {
      host.dataset.metal = "off";
      return;
    }

    let program: WebGLProgram | null = null;
    try {
      const vs = compile(gl, gl.VERTEX_SHADER, HERO_VERT);
      const fs = compile(gl, gl.FRAGMENT_SHADER, HERO_FRAG);
      program = gl.createProgram()!;
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(`metal program: ${gl.getProgramInfoLog(program)}`);
      }
    } catch (err) {
      console.warn(err);
      host.dataset.metal = "off";
      return;
    }

    gl.useProgram(program);

    // One oversized triangle rather than a quad: same coverage, no diagonal seam,
    // one less vertex to think about.
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    const aPos = gl.getAttribLocation(program, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const u = (name: string) => gl.getUniformLocation(program!, name);
    const uTime = u("uTime");
    const uViewSize = u("uViewSize");
    const uSpecular = u("uSpecular");

    const uBaseColor = u("uBaseColor");
    const uHighlight = u("uHighlight");
    const uFlowSpeed = u("uFlowSpeed");
    const uRepetition = u("uRepetition");
    const uDistortion = u("uDistortion");
    const uChroma = u("uChroma");
    const uSheen = u("uSheen");
    const uFlowAngle = u("uFlowAngle");
    const uRoughness = u("uRoughness");
    const uSpecIntensity = u("uSpecIntensity");
    const uSpecSize = u("uSpecSize");
    const uBrush = u("uBrush");

    // Re-uploaded only when the tone actually moves — for a surface with no
    // toneRef this runs exactly once, as it did before.
    let lastTone = Number.NaN;
    let lastAlloy = Number.NaN;
    const setMaterial = (t: number, a: number) => {
      const m = material(t, a);
      gl.uniform3fv(uBaseColor, m.baseColor);
      gl.uniform3fv(uHighlight, m.highlight);
      gl.uniform1f(uFlowSpeed, m.flowSpeed);
      gl.uniform1f(uRepetition, m.repetition);
      gl.uniform1f(uDistortion, m.distortion);
      gl.uniform1f(uChroma, m.chroma);
      gl.uniform1f(uSheen, m.sheen);
      gl.uniform1f(uFlowAngle, m.flowAngle);
      gl.uniform1f(uRoughness, m.roughness);
      gl.uniform1f(uSpecIntensity, m.specIntensity);
      gl.uniform1f(uSpecSize, m.specSize);
      gl.uniform1f(uBrush, m.brush);
      lastTone = t;
      lastAlloy = a;
    };
    setMaterial(toneRef ? toneRef.current : 0, alloyRef ? alloyRef.current : 0);

    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(u("uMask"), 0);

    // Specular target. It drifts on its own so the material still moves on a touch
    // device or an idle pointer, and the pointer takes it over while it is over the
    // surface. Position is eased, never snapped — steel with a specular that
    // teleports reads as a decal.
    const spec = { x: -0.4, y: -0.45, tx: -0.4, ty: -0.45, pointer: false };
    // Time constant of the specular easing, in seconds. Applied against real elapsed
    // time rather than per-frame, so the glide is identical on a 60Hz and a 120Hz
    // display and doesn't lurch after a dropped frame.
    const SPEC_EASE_TAU = 0.3;
    let last = 0;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    let art: HTMLImageElement | null = null;
    let maskW = 0;
    let maskH = 0;
    let raf = 0;
    let disposed = false;
    const start = performance.now();

    const uploadMask = () => {
      if (!art || !maskW || !maskH) return;
      const bevelPx = maskH * artHeightShare * bevelFrac;
      const mask = buildHeroMask(art, maskW, maskH, bevelPx);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, mask);
    };

    const draw = (now: number) => {
      const t = reduceMotion.matches ? 8 : (now - start) / 1000;
      // Clamped: a backgrounded tab resumes with a large gap, and an unclamped dt
      // would snap the specular across the surface in a single frame.
      const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
      last = now;

      // Two incommensurate periods, ~33s and ~48s, so the drift never visibly
      // repeats.
      if (!spec.pointer) {
        spec.tx = Math.cos(t * 0.19) * 0.55;
        spec.ty = Math.sin(t * 0.13) * 0.35 - 0.2;
      }
      const k = 1 - Math.exp(-dt / SPEC_EASE_TAU);
      spec.x += (spec.tx - spec.x) * k;
      spec.y += (spec.ty - spec.y) * k;

      const tone = toneRef ? toneRef.current : 0;
      const alloy = alloyRef ? alloyRef.current : 0;
      if (tone !== lastTone || alloy !== lastAlloy) setMaterial(tone, alloy);

      gl.uniform1f(uTime, t);
      gl.uniform2f(uViewSize, maskW, maskH);
      gl.uniform2f(uSpecular, spec.x, spec.y);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    let visible = true;

    const loop = (now: number) => {
      if (disposed || !visible) {
        raf = 0;
        return;
      }
      draw(now);
      raf = requestAnimationFrame(loop);
    };

    // The page carries several of these at once and only some are on screen at a
    // time, so a surface that has scrolled away stops shading. `last` resets too,
    // or the first frame back would compute a dt spanning the whole pause.
    const startLoop = () => {
      if (disposed || !visible || raf || reduceMotion.matches) return;
      last = 0;
      raf = requestAnimationFrame(loop);
    };

    const resize = () => {
      // offsetWidth/Height, NOT getBoundingClientRect: the lockup is scaled down by
      // CSS while the menu is open, and a client rect reports the TRANSFORMED box.
      // Sizing the backing store off that would rebuild the mask at the shrunken
      // size on any resize that happened mid-menu, and leave it there — soft — once
      // the menu closed. Offset sizes are layout sizes and ignore transforms.
      const cw = host.offsetWidth;
      const ch = host.offsetHeight;
      if (!cw || !ch) return;
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      const w = Math.max(1, Math.round(cw * dpr));
      const h = Math.max(1, Math.round(ch * dpr));
      if (w === maskW && h === maskH) return;
      maskW = w;
      maskH = h;
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      uploadMask();
      if (reduceMotion.matches) draw(performance.now());
    };

    const onPointerMove = (e: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      spec.pointer = true;
      spec.tx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      spec.ty = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    };
    const onPointerLeave = () => {
      spec.pointer = false;
    };

    const ro = new ResizeObserver(resize);
    ro.observe(host);

    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry?.isIntersecting ?? true;
        if (visible) startLoop();
        else {
          cancelAnimationFrame(raf);
          raf = 0;
        }
      },
      { rootMargin: "15% 0px" },
    );
    io.observe(host);

    const img = new Image();
    img.decoding = "async";
    img.src = src;
    img
      .decode()
      .then(() => {
        if (disposed) return;
        art = img;
        maskW = 0; // force resize() to rebuild at the real size
        maskH = 0;
        resize();
        if (reduceMotion.matches) draw(performance.now());
        else startLoop();
      })
      .catch(() => {
        if (!disposed) host.dataset.metal = "off";
      });

    if (trackPointer) {
      host.addEventListener("pointermove", onPointerMove);
      host.addEventListener("pointerleave", onPointerLeave);
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      host.removeEventListener("pointermove", onPointerMove);
      host.removeEventListener("pointerleave", onPointerLeave);
      gl.deleteTexture(tex);
      gl.deleteBuffer(buf);
      gl.deleteProgram(program);
    };
  }, [src, artHeightShare, bevelFrac, trackPointer, toneRef, alloyRef]);

  return (
    <div {...divProps} ref={hostRef}>
      <canvas className="metal__canvas" ref={canvasRef} />
      {children}
    </div>
  );
}
