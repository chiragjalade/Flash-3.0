import { useEffect, useRef } from "react";
import { MORPH_FRAG, MORPH_VERT } from "../shaders/dialMorph";
import { FIELD_SIZE, dialField } from "../lib/dialField";
import "./DialMorph.css";

// "image 1" of Figma frame 1894:44 and "image 2" of 1900:1079, each masked to an
// ellipse over its own clock. Copied in under routable names — the exports' own
// filenames carry a space, and the asset route takes a single path segment.
export const DIAL_IMAGE_ONE = "/images/dial-morph.png";
export const DIAL_IMAGE_TWO = "/images/dial-morph-2.png";

// The backing store is fixed rather than measured. The host lives inside the SVG's
// own coordinate space, so its layout size is a constant 894 units however large the
// clock is drawn — and sizing off the RENDERED size instead would mean reallocating
// the canvas on every scroll frame, since the clock is being scaled the whole way
// down. 894 at 2x covers the dial at the size it settles to, which is the only size
// the morph is ever seen at.
const BACKING = 1536;

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`dial morph: ${log}`);
  }
  return sh;
}

/**
 * The photograph that takes over the dial as the page keeps scrolling past the
 * settled clock.
 *
 * Sits inside the clock's own SVG, between the dial face and the furniture, so the
 * numerals, the hands and the crystal's reflections all paint over the top of it —
 * it is under the glass, not on it, and the clock stays a working clock.
 *
 * Draws only while the morph is actually in progress or complete; at qRef 0 there is
 * nothing to composite and the loop idles.
 */
export default function DialMorph({
  qRef,
  src = DIAL_IMAGE_ONE,
}: {
  qRef: { current: number };
  src?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl2", {
      alpha: true,
      // The shader writes straight colour and a coverage alpha. Telling the
      // compositor the canvas is NOT premultiplied is what keeps the half-covered
      // pixels along the dissolve edge from darkening toward black.
      premultipliedAlpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: "low-power",
    });
    if (!gl) return;

    canvas.width = BACKING;
    canvas.height = BACKING;
    gl.viewport(0, 0, BACKING, BACKING);

    let program: WebGLProgram | null = null;
    try {
      const vs = compile(gl, gl.VERTEX_SHADER, MORPH_VERT);
      const fs = compile(gl, gl.FRAGMENT_SHADER, MORPH_FRAG);
      program = gl.createProgram()!;
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(`dial morph program: ${gl.getProgramInfoLog(program)}`);
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

    const uQ = gl.getUniformLocation(program, "uQ");
    const uTime = gl.getUniformLocation(program, "uTime");
    const uImgAspect = gl.getUniformLocation(program, "uImgAspect");
    gl.uniform1i(gl.getUniformLocation(program, "uImage"), 0);
    gl.uniform1i(gl.getUniformLocation(program, "uNoise"), 1);
    gl.uniform1f(uImgAspect, 1);

    // The dissolve threshold. Uploaded WITHOUT a flip and with row 0 at the bottom,
    // which is the orientation dialField bakes it in and the one fieldAt reads it
    // back in — so the stagger on the numerals lands on the same values.
    const noiseTex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, noiseTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, FIELD_SIZE, FIELD_SIZE, 0, gl.RED,
      gl.UNSIGNED_BYTE, dialField());
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.activeTexture(gl.TEXTURE0);

    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    // One grey texel to start on, so the first frames have something bound and the
    // draw is valid before the photograph has decoded.
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
      new Uint8Array([160, 160, 160, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    let disposed = false;
    let raf = 0;
    let wasActive = false;
    const start = performance.now();

    // Deferred until the morph is actually approaching: a visitor who never scrolls
    // past the settled clock never fetches the photograph.
    let requested = false;
    const loadImage = () => {
      if (requested) return;
      requested = true;
      const img = new Image();
      img.decoding = "async";
      img.src = src;
      img
        .decode()
        .then(() => {
          if (disposed || !gl) return;
          gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
          gl.useProgram(program);
          gl.uniform1f(uImgAspect, img.naturalWidth / Math.max(1, img.naturalHeight));
        })
        .catch(() => {
          /* the grey texel stands in; the clock is unharmed */
        });
    };

    const draw = (now: number) => {
      gl.uniform1f(uQ, qRef.current);
      gl.uniform1f(uTime, (now - start) / 1000);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const loop = (now: number) => {
      if (disposed) {
        raf = 0;
        return;
      }
      const q = qRef.current;
      if (q > 0.0005) {
        loadImage();
        draw(now);
        wasActive = true;
      } else if (wasActive) {
        // One last frame at zero so nothing is left in the buffer, then idle.
        draw(now);
        wasActive = false;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      gl.deleteTexture(tex);
      gl.deleteTexture(noiseTex);
      gl.deleteBuffer(buf);
      gl.deleteProgram(program);
    };
  }, [qRef, src]);

  return <canvas className="clk__morph" ref={canvasRef} />;
}
