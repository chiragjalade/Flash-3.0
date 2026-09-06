import { useEffect, useRef } from "react";
import { GLOW_FRAG, GLOW_VERT } from "../shaders/clockGlow";
import "./ClockGlow.css";

const MAX_DPR = 2;

export type GlassLight = { x: number; y: number; hover: number };

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`clock glow: ${log}`);
  }
  return sh;
}

/**
 * The lit crystal over the clock face.
 *
 * A separate pass from the refraction in Clock.tsx, and deliberately so: the
 * refraction is an SVG filter on the dial beneath the glass, while this is the
 * light coming off the glass itself. Doing it in WebGL rather than with gradients
 * is what lets the highlight bend over the dome and pool at the rim.
 *
 * `lightRef` is written by whoever owns the pointer (the clock's tilt handler), and
 * read here every frame — a prop would mean a React render per pointer move.
 */
export default function ClockGlow({
  lightRef,
  className,
}: {
  lightRef: { current: GlassLight };
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      powerPreference: "low-power",
    });
    // Silent: the clock already reads as glass without it, so a missing context
    // costs a highlight rather than leaving a hole.
    if (!gl) return;

    let program: WebGLProgram | null = null;
    try {
      const vs = compile(gl, gl.VERTEX_SHADER, GLOW_VERT);
      const fs = compile(gl, gl.FRAGMENT_SHADER, GLOW_FRAG);
      program = gl.createProgram()!;
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(`clock glow program: ${gl.getProgramInfoLog(program)}`);
      }
    } catch (err) {
      console.warn(err);
      return;
    }

    gl.useProgram(program);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uLight = gl.getUniformLocation(program, "uLight");
    const uHover = gl.getUniformLocation(program, "uHover");
    const uTime = gl.getUniformLocation(program, "uTime");

    // Eased, so the light glides to the cursor instead of snapping, and fades in
    // and out on enter and leave. Same frame-rate independent form used elsewhere.
    const EASE_TAU = 0.16;
    let lx = 0;
    let ly = -0.35;
    let hover = 0;
    let last = 0;
    let raf = 0;
    let visible = true;
    let disposed = false;
    const start = performance.now();

    const draw = (now: number) => {
      const t = (now - start) / 1000;
      const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
      last = now;
      const k = 1 - Math.exp(-dt / EASE_TAU);

      const want = lightRef.current;
      // At rest the light drifts on its own, so the glass still lives when nobody
      // is pointing at it.
      const tx = want.hover ? want.x : Math.cos(t * 0.23) * 0.5;
      const ty = want.hover ? want.y : Math.sin(t * 0.17) * 0.34 - 0.3;
      lx += (tx - lx) * k;
      ly += (ty - ly) * k;
      hover += (want.hover - hover) * k;

      gl.uniform2f(uLight, lx, ly);
      gl.uniform1f(uHover, hover);
      gl.uniform1f(uTime, t);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const loop = (now: number) => {
      if (disposed || !visible) {
        raf = 0;
        return;
      }
      draw(now);
      raf = requestAnimationFrame(loop);
    };
    const startLoop = () => {
      if (disposed || !visible || raf) return;
      last = 0;
      raf = requestAnimationFrame(loop);
    };

    const resize = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (!w || !h) return;
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      const cw = Math.max(1, Math.round(w * dpr));
      const ch = Math.max(1, Math.round(h * dpr));
      if (cw === canvas.width && ch === canvas.height) return;
      canvas.width = cw;
      canvas.height = ch;
      gl.viewport(0, 0, cw, ch);
    };

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
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
    io.observe(canvas);

    resize();
    startLoop();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      gl.deleteBuffer(buf);
      gl.deleteProgram(program);
    };
  }, [lightRef]);

  return <canvas className={className} ref={canvasRef} aria-hidden />;
}
