import { useEffect, useRef } from "react";
import { MORPH_FRAG, MORPH_VERT } from "../shaders/dialMorph";
import { FIELD_SIZE, FIELD_PLANES, dialField } from "../lib/dialField";
import "./DialMorph.css";

// "image 1" of Figma frame 1894:44 and "image 2" of 1900:1079, each masked to an
// ellipse over its own clock. Copied in under routable names — the exports' own
// filenames carry a space, and the asset route takes a single path segment.
export const DIAL_IMAGE_ONE = "/images/dial-morph.png";
export const DIAL_IMAGE_TWO = "/images/dial-morph-2.png";
export const DIAL_IMAGE_THREE = "/images/dial-morph-3.png";

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
  outRef,
  inRef,
  out2Ref,
  in3Ref,
}: {
  /** Phase two: the dial becoming the first photograph. */
  qRef: { current: number };
  /** Phase three: that photograph sliding off to the left and coming apart. */
  outRef: { current: number };
  /** Phase three: the second arriving from the right and gathering. */
  inRef: { current: number };
  /** Phase four: the second leaving the same way the first did. */
  out2Ref: { current: number };
  /** Phase four: the third arriving. */
  in3Ref: { current: number };
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
    const uOut = gl.getUniformLocation(program, "uOut");
    const uIn = gl.getUniformLocation(program, "uIn");
    const uOut2 = gl.getUniformLocation(program, "uOut2");
    const uIn3 = gl.getUniformLocation(program, "uIn3");
    const uTime = gl.getUniformLocation(program, "uTime");
    const uImgAspect = gl.getUniformLocation(program, "uImgAspect");
    const uImg2Aspect = gl.getUniformLocation(program, "uImg2Aspect");
    const uImg3Aspect = gl.getUniformLocation(program, "uImg3Aspect");
    gl.uniform1i(gl.getUniformLocation(program, "uImage"), 0);
    gl.uniform1i(gl.getUniformLocation(program, "uNoise"), 1);
    gl.uniform1i(gl.getUniformLocation(program, "uImage2"), 2);
    gl.uniform1i(gl.getUniformLocation(program, "uImage3"), 3);
    gl.uniform1i(gl.getUniformLocation(program, "uNoise2"), 4);
    gl.uniform1f(uImgAspect, 1);
    gl.uniform1f(uImg2Aspect, 1);
    gl.uniform1f(uImg3Aspect, 1);

    // The dissolve threshold. Uploaded WITHOUT a flip and with row 0 at the bottom,
    // which is the orientation dialField bakes it in and the one fieldAt reads it
    // back in — so the stagger on the numerals lands on the same values.
    // RGB, not R8: each texture's three channels carry three independent fields, so
    // one fetch gives three patterns and two textures cover all five transitions.
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    const planes = dialField();
    const noiseTexes = planes.map((plane, i) => {
      const t = gl.createTexture();
      gl.activeTexture(i === 0 ? gl.TEXTURE1 : gl.TEXTURE4);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB8, FIELD_SIZE, FIELD_SIZE, 0, gl.RGB,
        gl.UNSIGNED_BYTE, plane);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    });
    if (noiseTexes.length !== FIELD_PLANES) console.warn("dial morph: field planes");
    gl.activeTexture(gl.TEXTURE0);

    // One grey texel each to start on, so the first frames have something bound and
    // the draw is valid before either photograph has decoded.
    const makeTex = (unit: number) => {
      const t = gl.createTexture();
      gl.activeTexture(unit);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
        new Uint8Array([160, 160, 160, 255]));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    const tex = makeTex(gl.TEXTURE0);
    const tex2 = makeTex(gl.TEXTURE2);
    const tex3 = makeTex(gl.TEXTURE3);

    let disposed = false;
    let raf = 0;
    let wasActive = false;
    const start = performance.now();

    // Deferred until the morph is actually approaching: a visitor who never scrolls
    // past the settled clock never fetches the photograph.
    const requested = new Set<string>();
    const loadImage = (
      url: string,
      unit: number,
      target: WebGLTexture | null,
      aspectLoc: WebGLUniformLocation | null,
    ) => {
      if (requested.has(url)) return;
      requested.add(url);
      const img = new Image();
      img.decoding = "async";
      img.src = url;
      img
        .decode()
        .then(() => {
          if (disposed || !gl) return;
          gl.activeTexture(unit);
          gl.bindTexture(gl.TEXTURE_2D, target);
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
          gl.useProgram(program);
          gl.uniform1f(aspectLoc, img.naturalWidth / Math.max(1, img.naturalHeight));
        })
        .catch(() => {
          /* the grey texel stands in; the clock is unharmed */
        });
    };

    const draw = (now: number) => {
      gl.uniform1f(uQ, qRef.current);
      gl.uniform1f(uOut, outRef.current);
      gl.uniform1f(uIn, inRef.current);
      gl.uniform1f(uOut2, out2Ref.current);
      gl.uniform1f(uIn3, in3Ref.current);
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
        loadImage(DIAL_IMAGE_ONE, gl.TEXTURE0, tex, uImgAspect);
        // Fetched as the handover starts rather than up front, so nobody who stops
        // before it downloads the second picture.
        if (inRef.current > 0.0005 || outRef.current > 0.0005) {
          loadImage(DIAL_IMAGE_TWO, gl.TEXTURE2, tex2, uImg2Aspect);
        }
        if (in3Ref.current > 0.0005 || out2Ref.current > 0.0005) {
          loadImage(DIAL_IMAGE_THREE, gl.TEXTURE3, tex3, uImg3Aspect);
        }
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
      gl.deleteTexture(tex2);
      gl.deleteTexture(tex3);
      for (const t of noiseTexes) gl.deleteTexture(t);
      gl.deleteBuffer(buf);
      gl.deleteProgram(program);
    };
  }, [qRef, outRef, inRef, out2Ref, in3Ref]);

  return <canvas className="clk__morph" ref={canvasRef} />;
}
