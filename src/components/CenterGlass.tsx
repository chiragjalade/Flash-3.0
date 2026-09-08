import { useEffect, useRef } from "react";
import {
  PHASE_PERIOD,
  PHASE_SECONDS,
  REFRACT_VERT,
  refractFrag,
  refractionUniforms,
} from "../shaders/patternRefraction";

/** The centre area's own size in the frame. The shader works in input pixels — the
 *  pattern period, the refraction distance and the derivative step are all absolute
 *  — so it has to run in the design's coordinate space or it stops being the same
 *  effect. Rendering at a multiple of it and scaling the three lengths to match is
 *  the only way to gain resolution without changing the picture. */
const FRAME_W = 800;
const FRAME_H = 500;

/** Backing store and sample count, chosen together: this runs every frame now, and
 *  the cost is width x height x samples x 3 texture fetches. Figma renders once and
 *  can afford 6x6; at 36 samples over a 1600x1000 buffer this would be 170M fetches
 *  a frame, which is nobody's idea of a background. 1000x625 at 3x3 is a fortieth of
 *  that and, on a field this soft, indistinguishable — the panel is only ~670 CSS px
 *  wide, and every pixel of the input has already been through a 25px blur. */
const SCALE = 1.25;
const MSAA = 3;

/** Layer 1722:149, the plate the photograph sits on. It shows through wherever the
 *  image does not cover, so it has to be under it in the input too. */
const PLATE = "#f0f0f0";

/** The background blur on the layer, in frame units. */
const BACKDROP_BLUR = 25;

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`pattern refraction: ${log}`);
  }
  return sh;
}

/**
 * The centre area's surface: layers 1722:150 and 1722:151 of frame 1722:3, together.
 *
 * The photograph is not drawn as a picture and then covered — it is the shader's
 * INPUT, and what you see is the refraction of it. That is why the panel in the
 * frame looks nothing like the photograph the file references: an office desk,
 * blurred and then displaced by 770 units through a zigzag pattern, mirrored where
 * the rays land outside it. Drawing the photograph normally and blurring it gets the
 * colours right and the material completely wrong.
 *
 * Figma's manifest declares the effect static, so the phase term that moves it is
 * the one thing here that is not from the file. It is periodic in the pattern's own
 * periods, which means the surface returns to itself exactly rather than drifting
 * somewhere the design never described.
 *
 * The loop only runs while the panel is actually on screen. Two pages scroll past
 * above it, and there is no reason to hold a GPU busy refracting something nobody is
 * looking at.
 */
export default function CenterGlass({ src }: { src: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const w = Math.round(FRAME_W * SCALE);
    const h = Math.round(FRAME_H * SCALE);
    canvas.width = w;
    canvas.height = h;

    const gl = canvas.getContext("webgl2", { alpha: false, antialias: false });
    if (!gl) {
      // No WebGL2: leave the element blank and let the plain photograph underneath
      // it show, rather than painting a flat rectangle over the panel.
      canvas.dataset.gl = "off";
      return;
    }

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let disposed = false;
    let raf = 0;
    let visible = false;
    let ready = false;
    let start = 0;
    let program: WebGLProgram | null = null;
    let tex: WebGLTexture | null = null;
    let vao: WebGLVertexArrayObject | null = null;
    let buf: WebGLBuffer | null = null;
    let uPhase: WebGLUniformLocation | null = null;

    const setup = (image: HTMLImageElement) => {
      // The shader's input is the layer's BACKDROP: the plate, the photograph over
      // it under `cover`, and the layer's own 25px background blur — in that order,
      // before any refraction. Rasterised on a 2D canvas because that is where a
      // Gaussian of this radius is cheapest and exact; doing it in GL would mean a
      // two-pass blur, and it only has to happen once whatever the animation does.
      const src2d = document.createElement("canvas");
      src2d.width = w;
      src2d.height = h;
      const ctx = src2d.getContext("2d")!;
      ctx.fillStyle = PLATE;
      ctx.fillRect(0, 0, w, h);
      ctx.filter = `blur(${BACKDROP_BLUR * SCALE}px)`;
      // `cover`, computed rather than relying on any CSS: the input has to be the
      // same framing the frame's own image layer has.
      const s = Math.max(w / image.width, h / image.height);
      const dw = image.width * s;
      const dh = image.height * s;
      ctx.drawImage(image, (w - dw) / 2, (h - dh) / 2, dw, dh);
      ctx.filter = "none";

      const vs = compile(gl, gl.VERTEX_SHADER, REFRACT_VERT);
      const fs = compile(gl, gl.FRAGMENT_SHADER, refractFrag(MSAA));
      program = gl.createProgram()!;
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(`pattern refraction: ${gl.getProgramInfoLog(program)}`);
      }
      gl.useProgram(program);

      buf = gl.createBuffer();
      vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(program, "aPos");
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

      tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      // The refracted rays land anywhere in the plane; the mirror fold is done in
      // the shader, so the sampler only has to stop the fold itself wrapping.
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src2d);

      const u = refractionUniforms(SCALE);
      const at = (name: string) => gl.getUniformLocation(program!, name);
      gl.uniform1i(at("uInput"), 0);
      // The centre is a fraction of the input's size, so it scales with it already.
      gl.uniform2f(at("uCenter"), (u.centerPct[0] / 100) * w, (u.centerPct[1] / 100) * h);
      gl.uniform1f(at("uAngle"), u.angle);
      gl.uniform1f(at("uSize"), u.size);
      gl.uniform1f(at("uAmount"), u.amount);
      gl.uniform1f(at("uSeamless"), u.seamless);
      gl.uniform1f(at("uFrost"), u.frost);
      gl.uniform1f(at("uIorDispersion"), u.iorDispersion);
      gl.uniform1f(at("uStep"), u.step);
      gl.uniform1f(at("uWash"), u.wash);
      uPhase = at("uPhase");

      gl.viewport(0, 0, w, h);
      ready = true;
      canvas.dataset.gl = "on";
    };

    const draw = (t: number) => {
      // Each axis walks one whole period of the field over its own number of
      // seconds, so every wrap lands on a picture identical to the one before it.
      gl.uniform2f(
        uPhase,
        ((t / PHASE_SECONDS[0]) % 1) * PHASE_PERIOD[0],
        ((t / PHASE_SECONDS[1]) % 1) * PHASE_PERIOD[1],
      );
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const frame = (now: number) => {
      if (disposed || !ready) return;
      if (!start) start = now;
      draw((now - start) / 1000);
      raf = requestAnimationFrame(frame);
    };

    const run = () => {
      if (!ready || raf || disposed) return;
      if (reduceMotion.matches) {
        // One frame, held. The surface is decoration; someone who has asked for
        // less movement should still get the material, not a blank panel.
        draw(0);
        return;
      }
      raf = requestAnimationFrame(frame);
    };

    const stop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      // Dropping the clock rather than pausing it would jump the pattern on the way
      // back in; keeping the elapsed origin is what makes leaving and returning
      // continuous.
      start = 0;
    };

    // Only while it is on screen. `start` is re-based on the next frame, so the
    // pattern carries on from where it was rather than snapping.
    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry!.isIntersecting;
        if (visible) run();
        else stop();
      },
      { rootMargin: "10% 0px" },
    );
    io.observe(canvas);

    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      if (disposed) return;
      setup(image);
      draw(0);
      if (visible) run();
    };
    image.src = src;

    const onMotionChange = () => {
      stop();
      if (visible) run();
    };
    reduceMotion.addEventListener("change", onMotionChange);

    return () => {
      disposed = true;
      stop();
      io.disconnect();
      reduceMotion.removeEventListener("change", onMotionChange);
      if (tex) gl.deleteTexture(tex);
      if (buf) gl.deleteBuffer(buf);
      if (vao) gl.deleteVertexArray(vao);
      if (program) gl.deleteProgram(program);
    };
  }, [src]);

  return <canvas className="feat__center-glass" ref={canvasRef} aria-hidden />;
}
